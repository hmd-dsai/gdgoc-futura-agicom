import os
import json
import hashlib
import datetime
from fastapi import HTTPException
from google.genai import types
from config import policy_col, product_col, resolved_qa_col, client
from prompts import (
    DATA_ANALYST_PROMPT, CHAT_RAG_PROMPT, LEARNING_EXTRACTOR_PROMPT,
    STRATEGY_SYSTEM_PROMPT, REJECTION_LEARNING_PROMPT, CRISIS_ANALYSIS_PROMPT
)
from models import MarketInsight
from database import SessionLocal, CoordinationTask, ChatLog, get_chat_history, save_message

def fetch_raw_market_data(sku_id: str) -> dict:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(BASE_DIR, "mock_data", f"{sku_id}-raw.json")

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"Không tìm thấy file: {file_path}")
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)

async def analyze_raw_data_phase1(sku_id: str) -> MarketInsight:
    print(f"[*] PHASE 1: Đang trích xuất dữ liệu thô cho {sku_id}...")

    # 1. Đọc dữ liệu thô
    raw_data = fetch_raw_market_data(sku_id)
    user_prompt = f"Dữ liệu thô từ sàn: {json.dumps(raw_data, ensure_ascii=False)}"

    # 2. Gọi Gemini đóng vai Data Analyst
    response = await client.aio.models.generate_content(
        model="gemini-flash-latest",
        contents=[DATA_ANALYST_PROMPT, user_prompt],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=MarketInsight,
            http_options={'timeout': 45000}
        )
    )

    if not response.text:
        raise HTTPException(status_code=500, detail="Lỗi Phase 1: Không có phản hồi.")

    clean_text = response.text.replace("```json", "").replace("```", "").strip()
    insight_dict = json.loads(clean_text)

    print(f"[*] PHASE 1 HOÀN TẤT: {insight_dict['analyst_summary']}")

    # Trả về cả Insight đã lọc và Internal Data gốc (để lát nữa đưa cho Strategist)
    return {
        "insight": insight_dict,
        "internal_data": raw_data["internal_data"]
    }

async def analyze_strategy_slow_track(data: dict):
    """THINK -> PLAN: Luồng chậm (Phân tích giá & Nội dung)"""
    prompt = f"Phân tích dữ liệu thị trường sau và đưa ra chiến lược định giá/nội dung: {data}"

    response = await client.aio.models.generate_content(
        model="gemini-flash-latest",
        contents=prompt,
        config=types.GenerateContentConfig(response_mime_type="application/json")
    )
    # Trong thực tế, sẽ có response_schema ở đây
    return {"track": "Slow Track", "strategy": "Pricing & Content Proposal", "details": response.text}

async def customer_care_fast_track(data: dict):
    """THINK -> PLAN -> GUARDRAIL: Luồng nhanh (CSKH)"""
    chat_history = data.get("message", "")

    # Prompt tích hợp Safety Guardrail
    prompt = f"""Bạn là Agent CSKH. Trả lời tin nhắn sau: '{chat_history}'.
    Đồng thời tự đánh giá độ tự tin (confidence) của bạn từ 0.0 đến 1.0.
    Nếu bạn không chắc chắn hoặc khách hàng đang giận dữ, hãy cho confidence < 0.7.
    Trả về định dạng JSON: {{"reply": "...", "confidence": 0.9}}"""

    response = await client.aio.models.generate_content(
        model="gemini-flash-latest",
        contents=prompt,
        config=types.GenerateContentConfig(response_mime_type="application/json")
    )

    try:
        result = json.loads(response.text)
        confidence = result.get("confidence", 1.0)

        # ACT: SAFETY GUARDRAIL LOGIC
        if confidence >= 0.7:
            return {"track": "Fast Track", "action": "Auto Reply to Customers", "message": result["reply"], "status": "Safe"}
        else:
            return {"track": "Fast Track", "action": "Send Proposals to Dashboard", "draft": result["reply"], "status": "Flagged / Low Confidence"}
    except:
        return {"track": "Fast Track", "status": "Error parsing JSON"}

async def coordinate_agents(insight_text: str, product_id: str, risk_level: str = "Thấp", risk_category: str = "None"):
    db = SessionLocal()
    target = None
    instruction = ""

    # Ưu tiên xử lý Rủi ro
    if risk_level == "Cao" or risk_category in ["Chất lượng sản phẩm", "Pháp lý/Phốt"]:
        target = "RiskManager"
        instruction = f"BÁO ĐỘNG KHẨN CẤP ({risk_category}): {insight_text}. Kiểm tra ngay sản phẩm {product_id}!"

    # Phân loại cho Pricing
    elif any(word in insight_text.lower() for word in ["giá", "đắt", "rẻ", "voucher"]):
        target = "Pricing"
        instruction = f"Insight về giá cho sản phẩm {product_id}: {insight_text}"

    # Phân loại cho Content
    elif any(word in insight_text.lower() for word in ["màu", "thông tin", "mô tả"]):
        target = "Content"
        instruction = f"Yêu cầu cập nhật nội dung cho {product_id}: {insight_text}"

    if target:
        new_task = CoordinationTask(
            target_agent=target,
            product_id=product_id,
            instruction=instruction,
            status="pending"
        )
        db.add(new_task)
        db.commit()
        print(f"[*] Đã tạo Task cho {target} Agent!")
    db.close()

async def cskh_rag_service(customer_text: str, brand_tone: str):
    # Kiểm tra nhanh đầu vào (Input Validation)
    if len(customer_text.strip()) < 3 or customer_text.lower() in ["string", "test", "hello"]:
        return {
            "suggested_reply": "Dạ Agicom chào anh/chị, em có thể giúp gì được cho mình ạ?",
            "confidence_score": 1.0,
            "is_safe": True,
            "sentiment_analysis": "bình thường",
            "identified_product_id": "None",
            "risk_level": "Thấp",
            "risk_category": "None",
            "sensor_insight": "Khách chào hỏi hoặc nhập tin nhắn test"
        }

    # 1. Retrieval
    policy_hits = policy_col.query(query_texts=[customer_text], n_results=1)
    product_hits = product_col.query(query_texts=[customer_text], n_results=1)
    qa_hits = resolved_qa_col.query(query_texts=[customer_text], n_results=1)

    # Một mẹo nhỏ: Chỉ lấy context nếu điểm số (distance) thấp (nghĩa là độ khớp cao)
    def get_valid_hits(hits):
        if hits and hits.get('documents') and len(hits['documents'][0]) > 0:
            # Nếu distance > 1.5 thường là kết quả "ép buộc", không liên quan
            if hits.get('distances') and hits['distances'][0][0] > 1.5:
                return "Không có thông tin liên quan."
            return hits['documents'][0][0]
        return "Không có thông tin cụ thể."

    context = f"""
    Quy định: {get_valid_hits(policy_hits)}
    Sản phẩm: {get_valid_hits(product_hits)}
    Kinh nghiệm: {get_valid_hits(qa_hits)}
    """

    # 2. Generation (Gemini sẽ nhận prompt đã được siết chặt quy tắc)
    user_prompt = CHAT_RAG_PROMPT.format(chat_history="Đoạn thoại trước: Trống (không có tin nhắn cũ)", context=context, brand_tone=brand_tone)

    response = await client.aio.models.generate_content(
        model="gemini-flash-latest",
        contents=[user_prompt, f"Tin nhắn khách: {customer_text}"],
        config={"response_mime_type": "application/json"}
    )

    try:
        # Làm sạch chuỗi trước khi parse (loại bỏ markdown nếu có)
        clean_text = response.text.replace("```json", "").replace("```", "").strip()
        result = json.loads(clean_text)

        # Nếu AI trả về một danh sách (List), lấy phần tử đầu tiên
        if isinstance(result, list):
            result = result[0] if len(result) > 0 else {}

    except Exception as e:
        print(f"Lỗi phân giải JSON từ AI: {str(e)}")
        result = {
            "suggested_reply": "Dạ, em đang gặp chút gián đoạn, anh/chị đợi em giây lát nhé.",
            "confidence_score": 0.0,
            "is_safe": False
        }

    # 3. Trích xuất các thông tin AI vừa phân tích
    sentiment = result.get("sentiment_analysis", "bình thường")
    product_id = result.get("identified_product_id", "General") # AI tự xác định sản phẩm
    risk_level = result.get("risk_level", "Thấp")
    risk_cat = result.get("risk_category", "None")
    insight = result.get("sensor_insight")

    # 4. Logic Guardrail: Nếu khách tức giận, chặn Auto-Reply
    if sentiment == "tức giận" or risk_level == "Cao":
        result["is_safe"] = False
        print(f"[!] CẢNH BÁO RỦI RO: Khách {sentiment}, ID sản phẩm: {product_id}")

    # 5. Coordination: Điều phối dựa trên dữ liệu AI cung cấp
    if insight and insight != "None":
        await coordinate_agents(
            insight_text=insight,
            product_id=product_id,
            risk_level=risk_level,
            risk_category=risk_cat
        )

    return result

async def learn_from_human_service(customer_q: str, human_a: str):
    """Lưu cặp Q&A đã được con người duyệt vào Vector DB"""
    try:
        # 1. Chuẩn bị Prompt
        prompt = LEARNING_EXTRACTOR_PROMPT.format(chat_log=f"Q: {customer_q}, A: {human_a}")

        # 2. Gọi Gemini (Thêm config response_mime_type để ép AI trả về JSON)
        response = await client.aio.models.generate_content(
            model="gemini-flash-latest",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )

        if not response.text:
            raise HTTPException(status_code=500, detail="AI không trả về kết quả để học.")

        # 3. LÀM SẠCH TEXT (Quan trọng: Xử lý lỗi JSONDecodeError)
        clean_text = response.text.replace("```json", "").replace("```", "").strip()

        # 4. Parse JSON và lưu vào DB
        data = json.loads(clean_text)

        # Tạo ID duy nhất bằng cách băm nội dung câu hỏi
        doc_id = hashlib.md5(data['question'].encode()).hexdigest()

        resolved_qa_col.add(
            documents=[f"Q: {data['question']} A: {data['answer']}"],
            ids=[f"qa_{doc_id}"]
        )

        print(f"[*] Đã học thành công kiến thức mới: {data['question']}")
        return {"status": "Learned successfully", "data_saved": data}

    except json.JSONDecodeError as e:
        print(f"LỖI PARSE JSON: {response.text}")
        raise HTTPException(status_code=500, detail="AI trả về format JSON không hợp lệ.")
    except Exception as e:
        print(f"LỖI HỌC TẬP: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================
# HÀM MỚI: Học từ việc chủ shop REJECT / OVERRIDE đề xuất AI
#
# Được gọi trong 2 tình huống:
#   1. action = "override": customer_q + human_a (câu chủ shop tự viết)
#      → Gọi learn_from_human_service để lưu Q&A tốt hơn vào vector DB
#      → Gọi thêm learn_from_rejection_service nếu có rejection_reason
#   2. action = "reject": customer_q + ai_suggestion (bị loại) + rejection_reason
#      → Gọi learn_from_rejection_service để lưu bài học "KHÔNG nên nói gì"
# ============================================================
async def learn_from_rejection_service(
    customer_message: str,
    ai_suggestion: str,
    rejection_context: str  # Có thể là: câu custom của chủ shop, hoặc lý do reject
):
    """
    Khi chủ shop từ chối / ghi đè đề xuất AI, hàm này:
    1. Dùng AI phân tích điểm sai của đề xuất bị reject
    2. Rút ra bài học dưới dạng "kinh nghiệm phản diện" (negative example)
    3. Lưu vào resolved_qa_col (ChromaDB) để AI tham chiếu khi gặp tình huống tương tự
    """
    try:
        # 1. Gọi AI phân tích điểm sai
        prompt = REJECTION_LEARNING_PROMPT.format(
            customer_message=customer_message,
            ai_suggestion=ai_suggestion,
            rejection_context=rejection_context
        )

        response = await client.aio.models.generate_content(
            model="gemini-flash-latest",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )

        if not response.text:
            print("[!] AI không trả về bài học từ rejection.")
            return {"status": "skipped", "reason": "No AI response"}

        clean_text = response.text.replace("```json", "").replace("```", "").strip()
        lesson_data = json.loads(clean_text)

        lesson = lesson_data.get("lesson", "")
        dont_do = lesson_data.get("dont_do", "")
        better_approach = lesson_data.get("better_approach", "")

        if not lesson:
            return {"status": "skipped", "reason": "No lesson extracted"}

        # 2. Lưu bài học vào Vector DB dưới dạng kinh nghiệm phản diện
        # Định dạng đặc biệt để AI biết đây là "ĐỪNG LÀM" thay vì "HÃY LÀM"
        knowledge_text = (
            f"[Bài học từ Feedback Chủ Shop]: "
            f"Khi khách nói '{customer_message}', "
            f"KHÔNG NÊN: {dont_do}. "
            f"THAY VÀO ĐÓ: {better_approach}. "
            f"Lý do: {lesson}"
        )

        # Tạo ID duy nhất từ nội dung tin nhắn khách + ai_suggestion
        doc_id = hashlib.md5(f"{customer_message}_{ai_suggestion[:50]}".encode()).hexdigest()

        resolved_qa_col.add(
            documents=[knowledge_text],
            ids=[f"rejection_{doc_id}"]
        )

        print(f"[*] AI đã học bài học từ rejection: {lesson}")
        return {
            "status": "Rejection learned",
            "lesson": lesson,
            "dont_do": dont_do,
            "better_approach": better_approach
        }

    except json.JSONDecodeError:
        print(f"[!] Lỗi parse JSON khi học từ rejection.")
        return {"status": "error", "reason": "JSON parse error"}
    except Exception as e:
        print(f"[!] Lỗi learn_from_rejection_service: {str(e)}")
        # Không raise exception — việc học thất bại không nên phá vỡ luồng chính
        return {"status": "error", "reason": str(e)}

# ============================================================
# CRISIS MANAGEMENT SERVICES
# ============================================================

# --- Ngưỡng tính điểm rủi ro ---
_SCORE_NEGATIVE_REVIEW = {1: 4, 2: 3, 3: 1}   # Rating 1★=4đ, 2★=3đ, 3★=1đ
_SCORE_RISK_TASK = 2                             # Mỗi RiskManager task = 2đ
_SCORE_LEGAL_BONUS = 5                           # Phốt/Pháp lý = +5đ thêm

_CRISIS_LEVEL = {
    "theo_doi":     (1, 3),    # 1-3 điểm → Monitoring 🟡
    "canh_bao":     (4, 7),    # 4-7 điểm → Warning 🟠
    "nghiem_trong": (8, 9999), # 8+  điểm → Critical 🔴
}

def _compute_crisis_level(score: float) -> str:
    for level, (lo, hi) in _CRISIS_LEVEL.items():
        if lo <= score <= hi:
            return level
    return "theo_doi"


async def _collect_signals_for_product(db, product_id: str, lookback_days: int) -> dict:
    """
    Thu thập tất cả tín hiệu rủi ro cho 1 sản phẩm từ 3 nguồn:
      1. ReviewLog  — đánh giá xấu từ khách
      2. CoordinationTask (RiskManager) — task rủi ro từ Agent CSKH
      3. ChatLog (general) — chat có từ khoá nguy hiểm (không lọc theo product vì ChatLog không có product_id)

    Returns dict:
      {
        "crisis_score": float,
        "negative_review_count": int,
        "risk_task_count": int,
        "signals": [str, ...],   # Các tín hiệu cụ thể để đưa vào AI
        "categories": [str, ...] # Danh mục rủi ro phát hiện được
      }
    """
    from database import ReviewLog, CoordinationTask, ChatLog
    from sqlalchemy import desc

    cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=lookback_days)
    score = 0.0
    signals = []
    categories = set()

    # ── Nguồn 1: Review xấu ─────────────────────────────────
    neg_reviews = (
        db.query(ReviewLog)
        .filter(
            ReviewLog.product_id == product_id,
            ReviewLog.rating <= 3,
            ReviewLog.timestamp >= cutoff
        )
        .order_by(desc(ReviewLog.timestamp))
        .all()
    )

    for rv in neg_reviews:
        pts = _SCORE_NEGATIVE_REVIEW.get(rv.rating, 1)
        score += pts
        signals.append(
            f"[Review {rv.rating}★ – {rv.customer_name}]: \"{rv.review_text[:200]}\""
            + (f" | AI insight: {rv.ai_insight}" if rv.ai_insight else "")
        )
        # Phát hiện category từ nội dung
        text_lower = (rv.review_text or "").lower()
        if any(kw in text_lower for kw in ["phốt", "lừa", "giả", "vi phạm"]):
            categories.add("Pháp lý/Phốt")
            score += _SCORE_LEGAL_BONUS
        elif any(kw in text_lower for kw in ["ship", "giao", "vận chuyển", "chậm", "thất lạc"]):
            categories.add("Vận chuyển")
        elif any(kw in text_lower for kw in ["hỏng", "lỗi", "vỡ", "méo", "sai size", "không đúng"]):
            categories.add("Chất lượng sản phẩm")
        elif any(kw in text_lower for kw in ["thô lỗ", "phục vụ", "shop không phản hồi"]):
            categories.add("Thái độ phục vụ")

    # ── Nguồn 2: RiskManager Tasks ──────────────────────────
    risk_tasks = (
        db.query(CoordinationTask)
        .filter(
            CoordinationTask.product_id == product_id,
            CoordinationTask.target_agent == "RiskManager",
            CoordinationTask.status == "pending",
            CoordinationTask.created_at >= cutoff
        )
        .order_by(desc(CoordinationTask.created_at))
        .all()
    )

    for task in risk_tasks:
        score += _SCORE_RISK_TASK
        signals.append(f"[Task Rủi ro – Agent CSKH]: \"{task.instruction[:200]}\"")
        instr_lower = (task.instruction or "").lower()
        if "pháp lý" in instr_lower or "phốt" in instr_lower:
            categories.add("Pháp lý/Phốt")
            score += _SCORE_LEGAL_BONUS
        elif "chất lượng" in instr_lower:
            categories.add("Chất lượng sản phẩm")
        elif "vận chuyển" in instr_lower or "giao hàng" in instr_lower:
            categories.add("Vận chuyển")

    # ── Nguồn 3: Chat Log (general mood, không filter product) ─
    # Chỉ áp dụng khi product_id là "General" hoặc insight liên quan đến sản phẩm
    RISK_CHAT_KEYWORDS = [
        "tức giận", "bóc phốt", "khiếu nại", "đòi hoàn tiền",
        "shop tệ", "lừa đảo", "hàng lỗi", "hàng giả"
    ]
    risky_chat_logs = (
        db.query(ChatLog)
        .filter(
            ChatLog.is_archived == False,
            ChatLog.timestamp >= cutoff
        )
        .order_by(desc(ChatLog.timestamp))
        .limit(50)  # Giới hạn để tránh quét quá nhiều
        .all()
    )

    chat_risk_count = 0
    for log in risky_chat_logs:
        insight = (log.insight or "").lower()
        if any(kw in insight for kw in RISK_CHAT_KEYWORDS):
            # Chỉ cộng điểm từ chat nếu tín hiệu này liên quan (chưa có product filter)
            # → Dùng tín hiệu chat như một "nhiệt kế" chung, không cộng vào score chính
            chat_risk_count += 1
            if chat_risk_count <= 5:  # Chỉ lấy 5 tín hiệu chat đại diện
                signals.append(f"[Chat Rủi ro – CSKH]: \"{log.insight}\"")

    # Bonus nhẹ từ chat nếu có nhiều tín hiệu xấu
    if chat_risk_count >= 3:
        score += 1.0

    return {
        "crisis_score": round(score, 1),
        "negative_review_count": len(neg_reviews),
        "risk_task_count": len(risk_tasks),
        "chat_risk_count": chat_risk_count,
        "signals": signals,
        "categories": list(categories),
        "primary_category": list(categories)[0] if len(categories) == 1 else (
            "Nhiều vấn đề" if len(categories) > 1 else "None"
        )
    }


async def _generate_crisis_plan(signals_data: dict, lookback_days: int) -> dict:
    """
    Gọi Gemini để tổng hợp insight và tạo kế hoạch xử lý khủng hoảng.
    """
    # Format signals thành chuỗi đọc được cho AI
    signals_text = "\n".join([f"  • {s}" for s in signals_data.get("signals", [])])
    if not signals_text:
        signals_text = "  (Không có tín hiệu cụ thể — chỉ dựa trên số đếm tổng hợp)"

    formatted_data = f"""
Tổng điểm rủi ro: {signals_data['crisis_score']}
Số review xấu (≤3★): {signals_data['negative_review_count']}
Số task RiskManager đang chờ: {signals_data['risk_task_count']}
Số chat có rủi ro cao: {signals_data['chat_risk_count']}
Danh mục rủi ro phát hiện: {', '.join(signals_data['categories']) or 'Chưa xác định'}

CHI TIẾT TÍN HIỆU:
{signals_text}
"""
    prompt = CRISIS_ANALYSIS_PROMPT.format(
        lookback_days=lookback_days,
        signals_data=formatted_data
    )

    response = await client.aio.models.generate_content(
        model="gemini-flash-latest",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            http_options={"timeout": 45000}
        )
    )

    if not response.text:
        return {"error": "AI không phản hồi"}

    try:
        clean = response.text.replace("```json", "").replace("```", "").strip()
        return json.loads(clean)
    except json.JSONDecodeError:
        print(f"[!] Lỗi parse JSON crisis plan: {response.text[:200]}")
        return {"error": "Parse JSON thất bại", "raw": response.text[:500]}


async def detect_crisis_for_product(db, product_id: str, lookback_days: int = 7, force: bool = False) -> dict:
    """
    Hàm chính: Phát hiện khủng hoảng cho 1 sản phẩm.

    Quy trình:
      1. Thu thập tín hiệu → tính crisis_score
      2. Nếu score > 0 → xác định crisis_level
      3. Nếu alert đã tồn tại (active/monitoring) và không force → cập nhật
         Nếu chưa có hoặc force=True → tạo mới, gọi AI sinh kế hoạch
      4. Trả về dict kết quả

    Nếu score = 0 → không tạo alert, trả về status="clear"
    """
    from database import CrisisAlert

    # 1. Thu thập tín hiệu
    signals_data = await _collect_signals_for_product(db, product_id, lookback_days)
    score = signals_data["crisis_score"]

    if score == 0:
        return {
            "product_id": product_id,
            "status": "clear",
            "crisis_score": 0,
            "message": "Không phát hiện tín hiệu rủi ro nào trong khoảng thời gian này."
        }

    crisis_level = _compute_crisis_level(score)
    primary_category = signals_data["primary_category"]

    # 2. Kiểm tra alert hiện có
    existing = (
        db.query(CrisisAlert)
        .filter(
            CrisisAlert.product_id == product_id,
            CrisisAlert.status.in_(["active", "monitoring"])
        )
        .order_by(CrisisAlert.created_at.desc())
        .first()
    )

    crisis_plan = {}
    need_ai_plan = True

    if existing and not force:
        # Cập nhật số liệu mới nhất mà không cần gọi AI lại
        existing.crisis_score = score
        existing.crisis_level = crisis_level
        existing.crisis_category = primary_category
        existing.negative_review_count = signals_data["negative_review_count"]
        existing.risk_task_count = signals_data["risk_task_count"]
        existing.signals_summary_json = json.dumps(signals_data["signals"], ensure_ascii=False)
        existing.last_updated = datetime.datetime.utcnow()
        db.commit()
        db.refresh(existing)

        crisis_plan = json.loads(existing.crisis_plan_json or "{}")
        need_ai_plan = False
        alert_id = existing.id
        print(f"[🔄 CRISIS UPDATE] product={product_id}, score={score}, level={crisis_level}")

    else:
        # 3. Gọi AI tạo kế hoạch xử lý
        print(f"[🆕 CRISIS GENERATE] product={product_id}, score={score}, level={crisis_level}")
        crisis_plan = await _generate_crisis_plan(signals_data, lookback_days)

        new_alert = CrisisAlert(
            product_id=product_id,
            crisis_level=crisis_level,
            crisis_category=primary_category,
            negative_review_count=signals_data["negative_review_count"],
            risk_task_count=signals_data["risk_task_count"],
            crisis_score=score,
            lookback_days=lookback_days,
            signals_summary_json=json.dumps(signals_data["signals"], ensure_ascii=False),
            crisis_plan_json=json.dumps(crisis_plan, ensure_ascii=False),
            status="active" if crisis_level == "nghiem_trong" else "monitoring"
        )
        db.add(new_alert)
        db.commit()
        db.refresh(new_alert)
        alert_id = new_alert.id

    return {
        "alert_id": alert_id,
        "product_id": product_id,
        "status": "active" if crisis_level == "nghiem_trong" else "monitoring",
        "crisis_level": crisis_level,
        "crisis_score": score,
        "negative_review_count": signals_data["negative_review_count"],
        "risk_task_count": signals_data["risk_task_count"],
        "chat_risk_count": signals_data["chat_risk_count"],
        "primary_category": primary_category,
        "all_categories": signals_data["categories"],
        "signals_count": len(signals_data["signals"]),
        "crisis_plan": crisis_plan,
        "ai_plan_generated": need_ai_plan
    }


async def detect_crisis_all_products(db, lookback_days: int = 7, force: bool = False) -> list:
    """
    Quét tất cả sản phẩm có tín hiệu rủi ro gần đây.
    Lấy danh sách product_id từ ReviewLog + CoordinationTask.
    """
    from database import ReviewLog, CoordinationTask
    from sqlalchemy import desc

    cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=lookback_days)

    # Lấy product_id từ các nguồn có thể có rủi ro
    review_pids = {r.product_id for r in db.query(ReviewLog.product_id).filter(
        ReviewLog.rating <= 3, ReviewLog.timestamp >= cutoff
    ).distinct().all()}

    task_pids = {t.product_id for t in db.query(CoordinationTask.product_id).filter(
        CoordinationTask.target_agent == "RiskManager",
        CoordinationTask.status == "pending",
        CoordinationTask.created_at >= cutoff
    ).distinct().all()}

    all_pids = list(review_pids | task_pids)

    if not all_pids:
        return []

    results = []
    for pid in all_pids:
        try:
            result = await detect_crisis_for_product(db, pid, lookback_days, force)
            if result.get("status") != "clear":
                results.append(result)
        except Exception as e:
            print(f"[!] Lỗi detect crisis cho product {pid}: {e}")
            results.append({"product_id": pid, "error": str(e)})

    # Sắp xếp theo crisis_score giảm dần (nghiêm trọng nhất lên đầu)
    results.sort(key=lambda x: x.get("crisis_score", 0), reverse=True)
    return results


async def full_strategy_pipeline(sku_id: str, shop_profile: dict):
    """KẾT NỐI PHASE 1 & PHASE 2"""

    # 1. Chạy Phase 1: Data Analyst
    phase1_result = await analyze_raw_data_phase1(sku_id)
    insight = phase1_result["insight"]
    internal = phase1_result["internal_data"]

    # 2. Chạy Phase 2: Strategist (Sử dụng STRATEGY_SYSTEM_PROMPT)
    combined_data = {
        "market_insight": insight,
        "internal_data": internal,
        "shop_profile": shop_profile
    }

    user_prompt = f"Dữ liệu tổng hợp: {json.dumps(combined_data, ensure_ascii=False)}"

    response = await client.aio.models.generate_content(
        model="gemini-flash-latest",
        contents=[STRATEGY_SYSTEM_PROMPT, user_prompt],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
        )
    )

    return json.loads(response.text)

async def chat_with_history_service(db, customer_id: str, user_text: str, brand_tone: str):
    # BƯỚC 1: Lấy lịch sử chat cũ (10 câu gần nhất)
    history_msgs = get_chat_history(db, customer_id, limit=10)

    # BƯỚC 2: Định dạng lịch sử thành chuỗi văn bản
    history_context = ""
    for msg in history_msgs:
        prefix = "Khách" if msg.role == "user" else "AI"
        history_context += f"{prefix}: {msg.content}\n"

    # BƯỚC 3: Truy xuất thêm từ Vector DB (RAG)
    policy_hits = policy_col.query(query_texts=[user_text], n_results=1)
    product_hits = product_col.query(query_texts=[user_text], n_results=1)
    qa_hits = resolved_qa_col.query(query_texts=[user_text], n_results=1)

    def get_valid_hits(hits):
        if hits and hits.get('documents') and len(hits['documents'][0]) > 0:
            if hits.get('distances') and hits['distances'][0][0] > 1.5:
                return "Không có thông tin liên quan."
            return hits['documents'][0][0]
        return "Không có thông tin cụ thể."

    context = f"""
    Quy định: {get_valid_hits(policy_hits)}
    Sản phẩm: {get_valid_hits(product_hits)}
    Kinh nghiệm: {get_valid_hits(qa_hits)}
    """

    # BƯỚC 4: Generate
    user_prompt = CHAT_RAG_PROMPT.format(chat_history=history_context, context=context, brand_tone=brand_tone)

    response = await client.aio.models.generate_content(
        model="gemini-flash-latest",
        contents=[user_prompt, f"Tin nhắn mới nhất của khách: {user_text}"],
        config={"response_mime_type": "application/json"}
    )

    ai_data = json.loads(response.text)

    sentiment = ai_data.get("sentiment_analysis", "bình thường")
    product_id = ai_data.get("identified_product_id", "General")
    risk_level = ai_data.get("risk_level", "Thấp")
    risk_cat = ai_data.get("risk_category", "None")
    insight = ai_data.get("sensor_insight")

    if sentiment == "tức giận" or risk_level == "Cao":
        ai_data["is_safe"] = False

    if insight and insight != "None":
        await coordinate_agents(
            insight_text=insight,
            product_id=product_id,
            risk_level=risk_level,
            risk_category=risk_cat
        )

    return ai_data
