import os
import json
import hashlib
from fastapi import HTTPException
from google.genai import types
from config import policy_col, product_col, resolved_qa_col, client
from prompts import (
    DATA_ANALYST_PROMPT, CHAT_RAG_PROMPT, LEARNING_EXTRACTOR_PROMPT,
    STRATEGY_SYSTEM_PROMPT, REJECTION_LEARNING_PROMPT
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
