import os
import json
import datetime
from fastapi import HTTPException
from google.genai import types
import config as _cfg
from config import client
# Truy cập collections qua module để luôn dùng đúng references
# (tránh trường hợp clear_data() recreate collections nhưng services.py vẫn giữ old refs)
def _get_cols():
    return _cfg.policy_col, _cfg.product_col, _cfg.resolved_qa_col
from prompts import CHAT_RAG_PROMPT, LEARNING_EXTRACTOR_PROMPT, CHAT_SUMMARY_PROMPT
from database import (
    SessionLocal, CoordinationTask, ChatLog, CustomerProfile,
    get_chat_history, save_message, get_or_create_customer_profile, LearnedQAEntry,
    ChatMessage, get_chat_summary, upsert_chat_summary,
)

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
        import hashlib
        doc_id = hashlib.md5(data['question'].encode()).hexdigest()

        chroma_doc_id  = f"qa_{doc_id}"
        chroma_doc_txt = f"Q: {data['question']} A: {data['answer']}"

        _, _, _resolved_qa_col = _get_cols()
        _resolved_qa_col.add(
            documents=[chroma_doc_txt],
            ids=[chroma_doc_id]
        )

        # Backup vào SQL để replay khi vector DB bị xóa hoặc Render cold start
        _bk_db = SessionLocal()
        try:
            _bk_db.merge(LearnedQAEntry(doc_id=chroma_doc_id, document=chroma_doc_txt, source="chat"))
            _bk_db.commit()
        except Exception as _bk_err:
            _bk_db.rollback()
            print(f"[services] Cảnh báo: không thể backup learned Q&A entry: {_bk_err}")
        finally:
            _bk_db.close()

        print(f"[*] Đã học thành công kiến thức mới: {data['question']}")
        return {"status": "Learned successfully", "data_saved": data}

    except json.JSONDecodeError as e:
        print(f"LỖI PARSE JSON: {response.text}")
        raise HTTPException(status_code=500, detail="AI trả về format JSON không hợp lệ.")
    except Exception as e:
        print(f"LỖI HỌC TẬP: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

async def maybe_summarize_chat(customer_id: str):
    """
    Gọi sau khi lưu tin nhắn AI. Tự động tóm tắt hội thoại theo rolling strategy:
    - Kích hoạt mỗi khi tổng số tin nhắn đạt bội số của 10
    - Tóm tắt tất cả tin nhắn trừ 6 tin gần nhất (giữ lại cho context trực tiếp)
    - Sử dụng tóm tắt cũ + tin nhắn mới để tạo tóm tắt rolling
    """
    db = SessionLocal()
    try:
        from sqlalchemy import func, asc
        total_count = db.query(func.count(ChatMessage.id)).filter(
            ChatMessage.customer_id == customer_id
        ).scalar() or 0

        # Chỉ chạy khi đạt bội số 10
        if total_count == 0 or total_count % 10 != 0:
            return

        # Lấy tóm tắt cũ nếu có
        existing_summary = get_chat_summary(db, customer_id)
        previous_summary_text = existing_summary.summary_text if existing_summary else "(Chưa có tóm tắt trước)"
        last_summarized_id = existing_summary.summarized_up_to_id if existing_summary else 0

        # Lấy các tin nhắn chưa được tóm tắt, trừ 6 tin gần nhất
        # Tổng: total_count tin — giữ lại 6 cuối => tóm tắt (total_count - 6) tin đầu
        # Nhưng chỉ xử lý các tin nhắn MỚI (id > last_summarized_id)
        all_msgs = (
            db.query(ChatMessage)
            .filter(
                ChatMessage.customer_id == customer_id,
                ChatMessage.id > last_summarized_id,
            )
            .order_by(asc(ChatMessage.timestamp))
            .all()
        )

        # Bỏ 6 tin nhắn cuối cùng — giữ chúng trong recent history
        msgs_to_summarize = all_msgs if all_msgs else []
        if not msgs_to_summarize:
            return

        # Format thành chuỗi hội thoại
        new_messages_text = "\n".join(
            f"{'Khách' if m.role == 'user' else 'AI'}: {m.content}"
            for m in msgs_to_summarize
        )

        # Gọi Gemini để tóm tắt
        summary_prompt = CHAT_SUMMARY_PROMPT.format(
            previous_summary=previous_summary_text,
            new_messages=new_messages_text,
        )
        response = await client.aio.models.generate_content(
            model="gemini-flash-latest",
            contents=[summary_prompt],
        )
        new_summary_text = (response.text or "").strip()
        if not new_summary_text:
            return

        last_msg_id = msgs_to_summarize[-1].id
        upsert_chat_summary(db, customer_id, new_summary_text, last_msg_id, total_count)
        print(f"[chat_summary] Đã cập nhật tóm tắt cho {customer_id} (total={total_count}, last_id={last_msg_id})")

    except Exception as e:
        print(f"[chat_summary] Lỗi khi tóm tắt hội thoại: {e}")
    finally:
        db.close()


async def chat_with_history_service(db, customer_id: str, user_text: str, brand_tone: str):
    # BƯỚC 1: Lấy lịch sử chat gần nhất (6 tin nhắn cuối)
    history_msgs = get_chat_history(db, customer_id, limit=10)

    # BƯỚC 2: Định dạng lịch sử thành chuỗi văn bản
    history_context = ""
    for msg in history_msgs:
        prefix = "Khách" if msg.role == "user" else "AI"
        history_context += f"{prefix}: {msg.content}\n"

    # BƯỚC 2b: Lấy tóm tắt hội thoại cũ (nếu có)
    try:
        summary_row = get_chat_summary(db, customer_id)
        chat_summary_context = summary_row.summary_text if summary_row else "(Chưa có — đây là đoạn hội thoại đầu tiên hoặc chưa đủ 10 tin nhắn)"
    except Exception:
        chat_summary_context = "(Không thể tải tóm tắt)"

    # BƯỚC 3: Lấy hồ sơ khách hàng từ DB và format thành chuỗi cho prompt
    # Bọc trong try/except: nếu bảng chưa migrate, chat vẫn tiếp tục với hồ sơ mặc định
    try:
        profile = get_or_create_customer_profile(db, customer_id)

        try:
            purchase_history_list = json.loads(profile.purchase_history or "[]")
            purchase_summary = ", ".join(
                f"{p.get('item', '?')} ({p.get('date', '?')}, {p.get('value', 0):,}d)"
                for p in purchase_history_list[:5]
            ) if purchase_history_list else "Chua co lich su mua hang"
        except Exception:
            purchase_summary = "Chua co lich su mua hang"

        segment_label = {
            "new": "Khach moi",
            "regular": "Khach quen",
            "vip": "Khach VIP",
            "at_risk": "Khach co nguy co roi bo",
        }.get(profile.customer_segment or "new", "Khong xac dinh")

        emotion_val = profile.emotion_index or 0.5
        emotion_text = (
            "Rat tieu cuc" if emotion_val <= 0.2 else
            "Tieu cuc" if emotion_val <= 0.4 else
            "Binh thuong" if emotion_val <= 0.6 else
            "Tich cuc" if emotion_val <= 0.8 else
            "Rat tich cuc"
        )

        customer_profile_context = (
            f"- customer_id: {customer_id}\n"
            f"- Phan khuc: {segment_label}\n"
            f"- Xac suat roi bo: {round((profile.churn_probability or 0) * 100)}%\n"
            f"- Chi so cam xuc: {round(emotion_val * 100)}/100 ({emotion_text})\n"
            f"- Tong don hang: {profile.total_orders or 0}\n"
            f"- Tong chi tieu: {int(profile.total_spent or 0)} VND\n"
            f"- Lan mua cuoi: {profile.last_purchase_date or 'Chua co'}\n"
            f"- Lich su mua hang: {purchase_summary}\n"
            f"- Ghi chu: {profile.notes or 'Khong co'}"
        )
    except Exception as e:
        print(f"[chat_with_history] Khong the tai ho so khach hang: {e}")
        customer_profile_context = f"- customer_id: {customer_id}\n- (Ho so chua co trong database)"
        # QUAN TRỌNG: rollback session SQLAlchemy bị lỗi để các query tiếp theo không bị ảnh hưởng
        try:
            db.rollback()
        except Exception:
            pass

    # BƯỚC 4: Truy xuất thêm từ Vector DB (RAG)
    _policy_col, _product_col, _resolved_qa_col = _get_cols()
    policy_hits = _policy_col.query(query_texts=[user_text], n_results=1)
    product_hits = _product_col.query(query_texts=[user_text], n_results=1)
    qa_hits = _resolved_qa_col.query(query_texts=[user_text], n_results=1)

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

    # BƯỚC 5: Generate — truyền customer_profile + chat_summary vào prompt
    user_prompt = CHAT_RAG_PROMPT.format(
        customer_profile=customer_profile_context,
        chat_summary=chat_summary_context,
        chat_history=history_context,
        context=context,
        brand_tone=brand_tone,
    )

    # BƯỚC 6: Gọi Gemini — bắt lỗi quota (429) riêng để không crash server
    try:
        response = await client.aio.models.generate_content(
            model="gemini-flash-latest",
            contents=[user_prompt, f"Tin nhắn mới nhất của khách: {user_text}"],
            config={"response_mime_type": "application/json"}
        )
    except Exception as gemini_err:
        err_str = str(gemini_err)
        if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str or "quota" in err_str.lower():
            print(f"[chat_with_history] Gemini quota exhausted: {err_str[:200]}")
            return {
                "suggested_reply": "Dạ hệ thống AI đang tạm thời quá tải (vượt quota), anh/chị vui lòng thử lại sau ít phút ạ 🙏",
                "confidence_score": 0.0,
                "is_safe": False,
                "sentiment_analysis": "bình thường",
                "identified_product_id": "General",
                "risk_level": "Thấp",
                "risk_category": "None",
                "sensor_insight": None,
                "_quota_exhausted": True
            }
        raise  # Lỗi khác thì re-raise bình thường

    # Parse JSON với error handling
    try:
        clean_text = response.text.replace("```json", "").replace("```", "").strip()
        ai_data = json.loads(clean_text)
        if isinstance(ai_data, list):
            ai_data = ai_data[0] if len(ai_data) > 0 else {}
    except Exception as e:
        print(f"[chat_with_history] Lỗi phân giải JSON từ Gemini: {str(e)}")
        ai_data = {
            "suggested_reply": "Dạ, em đang gặp chút gián đoạn, anh/chị đợi em giây lát nhé.",
            "confidence_score": 0.0,
            "is_safe": False,
            "sentiment_analysis": "bình thường",
            "identified_product_id": "General",
            "risk_level": "Thấp",
            "risk_category": "None",
            "sensor_insight": None
        }

    sentiment = ai_data.get("sentiment_analysis", "bình thường")
    product_id = ai_data.get("identified_product_id", "General")
    risk_level = ai_data.get("risk_level", "Thấp")
    risk_cat = ai_data.get("risk_category", "None")
    insight = ai_data.get("sensor_insight")

    if sentiment == "tức giận" or risk_level == "Cao":
        ai_data["is_safe"] = False

    # Enforce: is_safe=False phải đi kèm confidence_score thấp
    if not ai_data.get("is_safe", True):
        ai_data["confidence_score"] = min(ai_data.get("confidence_score", 0.4), 0.45)
    else:
        # Đảm bảo is_safe=True luôn có confidence_score (fallback nếu Gemini bỏ sót trường này)
        if "confidence_score" not in ai_data or ai_data["confidence_score"] is None:
            ai_data["confidence_score"] = 0.7

    if insight and insight != "None":
        await coordinate_agents(
            insight_text=insight,
            product_id=product_id,
            risk_level=risk_level,
            risk_category=risk_cat
        )

    # BƯỚC 7: Cập nhật hồ sơ khách hàng dựa trên kết quả phân tích AI
    try:
        update_customer_profile_from_chat(db, customer_id, ai_data)
    except Exception as e:
        # Không để lỗi cập nhật profile làm crash toàn bộ response
        print(f"[chat_with_history] Không thể cập nhật hồ sơ khách hàng: {e}")

    return ai_data


def update_customer_profile_from_chat(db, customer_id: str, ai_data: dict):
    """
    Cập nhật CustomerProfile sau mỗi lượt chat dựa trên phân tích AI.
    Sử dụng EMA (trọng số 25%) để cập nhật emotion_index dần dần,
    và delta cộng/trừ cho churn_probability.
    """
    profile = get_or_create_customer_profile(db, customer_id)

    sentiment  = ai_data.get("sentiment_analysis", "bình thường")
    risk_level = ai_data.get("risk_level", "Thấp")
    insight    = ai_data.get("sensor_insight")

    # ── 1. Cập nhật emotion_index (EMA, trọng số 25% cho quan sát mới) ───────
    sentiment_score_map = {
        "hài lòng":  0.90,
        "tích cực":  0.85,
        "bình thường": 0.55,
        "phân vân":  0.40,
        "gấp gáp":   0.40,
        "tức giận":  0.05,
    }
    new_score = sentiment_score_map.get(sentiment, 0.55)
    old_emotion = profile.emotion_index if profile.emotion_index is not None else 0.5
    profile.emotion_index = round(0.75 * old_emotion + 0.25 * new_score, 3)

    # ── 2. Cập nhật churn_probability (delta, kẹp trong [0.0, 1.0]) ──────────
    old_churn = profile.churn_probability if profile.churn_probability is not None else 0.1
    if sentiment == "tức giận" and risk_level == "Cao":
        delta = +0.15
    elif risk_level == "Cao":
        delta = +0.10
    elif risk_level == "Trung bình":
        delta = +0.05
    elif sentiment == "hài lòng":
        delta = -0.05
    elif new_score >= 0.8:           # tích cực
        delta = -0.02
    else:
        delta = 0.0
    profile.churn_probability = round(max(0.0, min(1.0, old_churn + delta)), 3)

    # ── 3. Cập nhật notes (giữ 3 insight gần nhất, không trùng lặp) ─────────
    if insight and insight not in ("None", "none", ""):
        try:
            existing = json.loads(profile.notes or "[]")
            if not isinstance(existing, list):
                existing = []
        except Exception:
            existing = []
        # Thêm insight mới lên đầu, bỏ trùng, giới hạn 3 phần tử
        updated = [insight] + [n for n in existing if n != insight]
        profile.notes = json.dumps(updated[:3], ensure_ascii=False)

    # ── 4. Tự động phân khúc lại customer_segment ───────────────────────────
    total_orders = profile.total_orders or 0
    churn        = profile.churn_probability
    if churn >= 0.6:
        profile.customer_segment = "at_risk"
    elif total_orders >= 5:
        profile.customer_segment = "vip"
    elif total_orders >= 2:
        profile.customer_segment = "regular"
    else:
        profile.customer_segment = "new"

    # ── 5. Ghi timestamp và commit ───────────────────────────────────────────
    profile.updated_at = datetime.datetime.utcnow()
    db.commit()
    print(
        f"[Profile] {customer_id} → emotion={profile.emotion_index}, "
        f"churn={profile.churn_probability}, segment={profile.customer_segment}"
    )