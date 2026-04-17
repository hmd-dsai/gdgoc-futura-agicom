from datetime import datetime
import json
import hashlib
import os
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from google.genai import types

# Nhập các thành phần từ file khác
from config import client, resolved_qa_col
from models import (
    IncomingData, ProposalApproval, ChatMessageRequest, ProductRequest,
    GuardrailResponse, StrategyProposal, ShopProfile, ChatSessionInput, ChatMessage,
    ReviewData, ChatApprovalRequest
)
from prompts import CHAT_SYSTEM_PROMPT, STRATEGY_SYSTEM_PROMPT, REVIEW_LEARNING_PROMPT
from services import (
    analyze_strategy_slow_track,
    customer_care_fast_track,
    analyze_raw_data_phase1,
    learn_from_human_service,
    learn_from_rejection_service,
    cskh_rag_service,
    chat_with_history_service
)
from database import (
    SessionLocal, ChatLog, CoordinationTask,
    ChatMessage as DB_ChatMessage,
    PendingChatMessage,
    save_message, init_db,
    DailySummaryArchive, ReviewLog
)

init_db()

app = FastAPI(title="Agicom Core Backend")

# ---------------------------------------------------------------------------
# CORS – cho phép frontend Netlify và localhost kết nối
# ---------------------------------------------------------------------------
FRONTEND_URL = os.getenv("FRONTEND_URL", "*")

ALLOWED_ORIGINS = ["*"] if FRONTEND_URL == "*" else [
    FRONTEND_URL,
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False if FRONTEND_URL == "*" else True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    """Health check endpoint cho Render"""
    return {"status": "ok", "message": "Agicom Backend đang chạy!", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}

@app.get("/test-phase1/{sku_id}")
async def test_data_analyst_agent(sku_id: str):
    """API dùng để test khả năng đọc Raw Data của LLM Phase 1"""
    try:
        result = await analyze_raw_data_phase1(sku_id)
        return {
            "status": "success",
            "message": "Data Analyst đã trích xuất thành công!",
            "data": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/observe-and-think")
async def process_data_pipeline(input_data: IncomingData):
    """
    OBSERVE -> PROCESS IN BACKEND -> TASK ROUTER
    Đây là "cánh cửa" nhận mọi dữ liệu từ bên ngoài (API Sàn / File giả lập).
    """
    try:
        print(f"[*] OBSERVE: Nhận dữ liệu loại '{input_data.data_type}'")

        # TASK ROUTER LOGIC
        if input_data.data_type == "market_data":
            print("[*] TASK ROUTER: Chuyển hướng sang Slow Track (Chiến lược)")
            proposal = await analyze_strategy_slow_track(input_data.payload)
            return {"status": "success", "routing": "Strategy", "action": "Send Proposals to Dashboard", "data": proposal}

        elif input_data.data_type == "customer_chat":
            print("[*] TASK ROUTER: Chuyển hướng sang Fast Track (CSKH)")
            chat_response = await customer_care_fast_track(input_data.payload)
            return {"status": "success", "routing": "Chat", "data": chat_response}

        else:
            raise HTTPException(status_code=400, detail="Loại dữ liệu không hợp lệ")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/act-and-learn")
async def human_approval_flow(approval: ProposalApproval):
    """
    ACT -> HUMAN APPROVAL -> LEARN
    Mô phỏng thao tác của Chủ shop trên Dashboard.
    """
    if approval.status == "approved":
        print(f"[*] ACT: Execute on Platforms (Gửi lệnh cập nhật giá lên Shopee API)")
        print(f"[*] LEARN: Store in Vector Database (Lưu chiến lược thành công)")
        return {"status": "Executed & Learned", "message": "Đã đồng bộ lên sàn và lưu vào ChromaDB"}

    elif approval.status == "declined":
        print(f"[*] ACT: Declined. User Feedback: {approval.feedback}")
        print(f"[*] RE-EVALUATE: Gửi feedback '{approval.feedback}' về lại LLM Framework")
        return {"status": "Re-evaluating", "message": "Đang tính toán lại dựa trên phản hồi của bạn"}

@app.post("/fast-track-chat")
async def process_customer_chat(chat: ChatMessageRequest, profile: ShopProfile):
    try:
        # Inject Tone and Target Customers
        personalized_chat_prompt = CHAT_SYSTEM_PROMPT.format(
            brand_tone=profile.brand_tone,
            target_customers=profile.target_customers
        )

        user_prompt = f"Chính sách shop: {chat.shop_policy}\nTin nhắn của khách: '{chat.customer_text}'"

        response = await client.aio.models.generate_content(
            model="gemini-flash-latest",
            contents=[personalized_chat_prompt, user_prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=GuardrailResponse,
                http_options={'timeout': 30000}
            )
        )

        if not response.text:
            raise HTTPException(status_code=500, detail="Lỗi phản hồi từ AI.")

        clean_text = response.text.replace("```json", "").replace("```", "").strip()
        guardrail_result = json.loads(clean_text)

        # --- ROUTER LOGIC: Tự động hay Cần người duyệt? ---
        if guardrail_result["is_safe"] and guardrail_result["confidence_score"] >= 0.7:
            action = "Auto-Reply Executed"
            status_color = "Green"
        else:
            action = "Sent to Dashboard for Human Approval"
            status_color = "Red/Orange"

        return {
            "status": "success",
            "routing_action": action,
            "system_color": status_color,
            "ai_evaluation": guardrail_result
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/slow-track-strategy")
async def process_market_strategy(product: ProductRequest):
    try:
        personalized_system_prompt = STRATEGY_SYSTEM_PROMPT.format(
            strategic_vision=product.shop_profile.strategic_vision,
            target_customers=product.shop_profile.target_customers
        )

        user_prompt = f"Hồ sơ dữ liệu sản phẩm hiện tại: {product.model_dump_json()}"

        response = await client.aio.models.generate_content(
            model="gemini-flash-latest",
            contents=[personalized_system_prompt, user_prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=StrategyProposal,
                http_options={'timeout': 60000}
            )
        )

        if not response.text:
            raise HTTPException(status_code=500, detail="Lỗi phản hồi từ AI.")

        clean_text = response.text.replace("```json", "").replace("```", "").strip()
        strategy_result = json.loads(clean_text)

        routing_msg = "Sent to Dashboard for Human Approval" if strategy_result.get("action_required") else "No Action Needed - Monitored"

        return {
            "status": "success",
            "routing_action": routing_msg,
            "proposal_id": f"PROP-{product.product_id}-001",
            "data": strategy_result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/fast-track-chat-v2")
async def process_chat_v2(chat: ChatMessage, profile: ShopProfile):
    try:
        ai_response = await cskh_rag_service(chat.customer_text, profile.brand_tone)
        db = SessionLocal()
        new_log = ChatLog(
            customer_q=chat.customer_text,
            ai_a=ai_response.get("suggested_reply", ""),
            insight=ai_response.get("sensor_insight")
        )
        db.add(new_log)
        db.commit()
        db.close()

        return {"status": "success", "data": ai_response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/learn-feedback")
async def human_feedback(customer_q: str, human_a: str):
    """API để chủ shop 'dạy' AI khi họ sửa câu trả lời trên Dashboard"""
    return await learn_from_human_service(customer_q, human_a)

@app.get("/daily-summary")
async def get_daily_summary(archive: bool = Query(False, description="Nếu True, sẽ lưu trữ dữ liệu đi sau khi xuất")):
    db = SessionLocal()
    try:
        tasks = db.query(CoordinationTask).filter(CoordinationTask.status == "pending").all()

        pricing_tasks = [t.instruction for t in tasks if t.target_agent == "Pricing"]
        content_tasks = [t.instruction for t in tasks if t.target_agent == "Content"]
        risk_tasks = [t.instruction for t in tasks if t.target_agent == "RiskManager"]

        display_logs = db.query(ChatLog).filter(ChatLog.is_archived == False).order_by(ChatLog.timestamp.desc()).limit(20).all()
        insights = [log.insight for log in display_logs if log.insight]

        current_date = datetime.now().date()
        risk_status = "Cảnh báo" if len(risk_tasks) > 0 else "An toàn"

        if archive:
            archive_record = DailySummaryArchive(
                report_date=current_date,
                archived_at=datetime.utcnow(),
                risk_status=risk_status,
                risk_tasks_json=json.dumps(risk_tasks, ensure_ascii=False),
                pricing_tasks_json=json.dumps(pricing_tasks, ensure_ascii=False),
                content_tasks_json=json.dumps(content_tasks, ensure_ascii=False),
                insights_json=json.dumps(insights, ensure_ascii=False),
                total_tasks=len(tasks),
                total_insights=len(insights)
            )
            db.add(archive_record)

            for t in tasks:
                t.status = "archived"

            all_unarchived_logs = db.query(ChatLog).filter(ChatLog.is_archived == False).all()
            for log in all_unarchived_logs:
                log.is_archived = True

            db.commit()

        return {
            "date": current_date.isoformat(),
            "risk_management": {
                "status": risk_status,
                "urgent_actions": risk_tasks
            },
            "growth_strategy": {
                "pricing_proposals": pricing_tasks,
                "content_optimizations": content_tasks
            },
            "customer_sentiment_overview": insights
        }
    except Exception as e:
        db.rollback()
        print(f"LỖI DAILY SUMMARY: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.post("/export-daily-summary")
async def export_and_archive_daily_summary():
    return await get_daily_summary(archive=True)

@app.get("/api/chatbot/features")
async def get_chatbot_features():
    return {
        "features":[
            {
                "id": "sentiment",
                "title": "Phân tích cảm xúc",
                "status": "Ổn định",
                "detail": "Theo dõi trạng thái cảm xúc theo từng cụm hội thoại để cảnh báo sớm nhóm khách tiêu cực.",
            },
            {
                "id": "faq-report",
                "title": "Báo cáo thắc mắc",
                "status": "Đang cập nhật",
                "detail": "Tổng hợp câu hỏi lặp lại trong ngày, ưu tiên theo tần suất và mức độ ảnh hưởng.",
            },
        ]
    }

@app.get("/api/quality/overview")
async def get_quality_overview():
    return {
        "items":[
            {
                "id": "chatbot-summary",
                "title": "Tổng hợp từ chat bot",
                "value": "128 tín hiệu/7 ngày",
                "note": "Hệ thống gom nhóm phản hồi theo chủ đề sản phẩm, kênh bán và thời điểm phát sinh.",
            },
            {
                "id": "crisis-management",
                "title": "Quản trị khủng hoảng",
                "value": "1 cảnh báo cần xử lý",
                "note": "Phát hiện cụm phản hồi tiêu cực tăng nhanh ở nhóm giao vận, đề xuất xử lý ưu tiên trong 24 giờ.",
            },
        ]
    }

@app.post("/learn-from-review")
async def process_and_learn_review(review: ReviewData):
    try:
        # 1. AI Phân tích Review
        user_prompt = f"Sản phẩm ID: {review.product_id}\nSố sao: {review.rating}/5\nNội dung: '{review.review_text}'"
        response = await client.aio.models.generate_content(
            model="gemini-flash-latest",
            contents=[REVIEW_LEARNING_PROMPT, user_prompt],
            config=types.GenerateContentConfig(response_mime_type="application/json")
        )

        clean_text = response.text.replace("```json", "").replace("```", "").strip()
        analysis = json.loads(clean_text)

        # 2. LƯU BÀI HỌC VÀO VECTOR DB
        if analysis.get("qa_knowledge") and analysis["qa_knowledge"] != "None":
            doc_id = hashlib.md5(review.review_text.encode()).hexdigest()
            resolved_qa_col.add(
                documents=[f"[Kinh nghiệm từ Review {review.rating} sao]: {analysis['qa_knowledge']}"],
                ids=[f"rev_{doc_id}"]
            )

        # 3. LƯU REVIEW GỐC & TẠO TASK VÀO SQL
        db = SessionLocal()
        try:
            new_review_log = ReviewLog(
                product_id=review.product_id,
                rating=review.rating,
                review_text=review.review_text,
                customer_name=review.customer_name,
                ai_insight=analysis.get('qa_knowledge', "Không có insight nổi bật")
            )
            db.add(new_review_log)

            if analysis.get("action_needed") or review.rating <= 3:
                instruction = f"CẢNH BÁO REVIEW {review.rating} SAO: {analysis.get('key_issue')}. Nội dung: '{review.review_text}'"

                target_agent = "RiskManager"
                if "giá" in review.review_text.lower():
                    target_agent = "Pricing"
                elif "màu" in review.review_text.lower():
                    target_agent = "Content"

                new_task = CoordinationTask(
                    target_agent=target_agent,
                    product_id=review.product_id,
                    instruction=instruction,
                    status="pending"
                )
                db.add(new_task)

            db.commit()
        except Exception as db_e:
            db.rollback()
            print("Lỗi Database:", db_e)
        finally:
            db.close()

        return {"status": "success", "message": "Đã lưu Review & Cập nhật trí nhớ AI"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/reviews")
async def get_all_reviews(product_id: str = None, limit: int = 20):
    """
    API dùng để kéo dữ liệu Review từ Database ra cho Frontend hiển thị.
    Nếu truyền product_id thì chỉ lấy review của sản phẩm đó.
    """
    db = SessionLocal()
    try:
        query = db.query(ReviewLog)

        if product_id:
            query = query.filter(ReviewLog.product_id == product_id)

        reviews = query.order_by(ReviewLog.timestamp.desc()).limit(limit).all()

        return {
            "total_fetched": len(reviews),
            "data": reviews
        }
    finally:
        db.close()

# ============================================================
# ENDPOINT /chat-v3 — ĐÃ CẬP NHẬT
#
# Luồng mới:
#   AI trả lời an toàn (is_safe=True & confidence>=0.7)
#     → Auto-reply: lưu cả 2 tin nhắn vào ChatMessage + ChatLog ngay lập tức
#     → routing = "auto_reply"
#
#   AI bị chặn (is_safe=False hoặc confidence<0.7)
#     → Chỉ lưu tin nhắn của khách vào ChatMessage
#     → Tạo PendingChatMessage để chủ shop duyệt
#     → routing = "pending_approval" + trả về pending_id
# ============================================================
@app.post("/chat-v3")
async def process_chat_with_history(data: ChatSessionInput):
    db = SessionLocal()
    try:
        # 1. Lưu tin nhắn của Khách vào lịch sử (luôn luôn)
        save_message(db, data.customer_id, "user", data.message)

        # 2. Xử lý Logic AI (Lấy history -> RAG -> Gemini)
        ai_response = await chat_with_history_service(
            db, data.customer_id, data.message, data.brand_tone
        )

        reply_content = ai_response.get("suggested_reply", "Dạ, em chưa hiểu ý mình ạ.")
        is_safe = ai_response.get("is_safe", True)
        confidence = ai_response.get("confidence_score", 0.0)

        # 3. GUARDRAIL ROUTING
        if is_safe and confidence >= 0.7:
            # ✅ AUTO-REPLY: AI đủ tự tin → gửi ngay, lưu lịch sử đầy đủ
            print(f"[✅ AUTO-REPLY] customer={data.customer_id}, confidence={confidence:.2f}")

            # Lưu tin nhắn AI vào lịch sử hội thoại
            save_message(db, data.customer_id, "assistant", reply_content)

            # Lưu vào ChatLog để tổng hợp cuối ngày
            new_log = ChatLog(
                customer_q=data.message,
                ai_a=reply_content,
                insight=ai_response.get("sensor_insight")
            )
            db.add(new_log)
            db.commit()

            return {
                "status": "success",
                "routing": "auto_reply",
                "customer_id": data.customer_id,
                "reply": reply_content,
                "ai_evaluation": ai_response
            }

        else:
            # 🔴 PENDING APPROVAL: AI không đủ tự tin / nội dung rủi ro
            # → Chờ chủ shop xem và duyệt trước khi gửi
            print(f"[🔴 PENDING] customer={data.customer_id}, is_safe={is_safe}, confidence={confidence:.2f}")

            pending = PendingChatMessage(
                customer_id=data.customer_id,
                user_message=data.message,
                ai_suggestion=reply_content,
                confidence_score=confidence,
                is_safe=is_safe,
                flag_reason=ai_response.get("flag_reason", ""),
                sensor_insight=ai_response.get("sensor_insight", ""),
                status="pending"
            )
            db.add(pending)
            db.commit()
            db.refresh(pending)

            return {
                "status": "success",
                "routing": "pending_approval",
                "pending_id": pending.id,
                "customer_id": data.customer_id,
                "ai_suggestion": reply_content,
                "flag_reason": ai_response.get("flag_reason", ""),
                "ai_evaluation": ai_response,
                "message": "⚠️ Tin nhắn đang chờ chủ shop duyệt trước khi gửi cho khách."
            }

    except Exception as e:
        print(f"LỖI CHAT HISTORY: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


# ============================================================
# ENDPOINT MỚI: GET /chat/pending
# Dashboard của chủ shop dùng endpoint này để lấy danh sách
# tin nhắn AI đang chờ duyệt
# ============================================================
@app.get("/chat/pending")
async def get_pending_chats(limit: int = 20):
    """
    Trả về danh sách các tin nhắn AI đề xuất đang chờ chủ shop xử lý.
    Frontend dùng endpoint này để hiển thị hàng đợi trên Dashboard.
    """
    db = SessionLocal()
    try:
        pending_msgs = (
            db.query(PendingChatMessage)
            .filter(PendingChatMessage.status == "pending")
            .order_by(PendingChatMessage.created_at.desc())
            .limit(limit)
            .all()
        )

        return {
            "total": len(pending_msgs),
            "data": [
                {
                    "pending_id": msg.id,
                    "customer_id": msg.customer_id,
                    "user_message": msg.user_message,
                    "ai_suggestion": msg.ai_suggestion,
                    "confidence_score": msg.confidence_score,
                    "is_safe": msg.is_safe,
                    "flag_reason": msg.flag_reason,
                    "sensor_insight": msg.sensor_insight,
                    "created_at": msg.created_at.isoformat() if msg.created_at else None,
                }
                for msg in pending_msgs
            ]
        }
    finally:
        db.close()


# ============================================================
# ENDPOINT MỚI: POST /chat/approve
#
# Chủ shop xử lý tin nhắn đang chờ duyệt với 3 lựa chọn:
#
#   action = "approve"
#     → Dùng đúng câu AI đề xuất
#     → Lưu vào ChatMessage + ChatLog
#
#   action = "override"
#     → Chủ shop tự điền nội dung thay thế (custom_message)
#     → Lưu custom_message vào ChatMessage + ChatLog
#     → AI học từ cặp (câu hỏi khách, câu trả lời chủ shop)
#     → Nếu có rejection_reason → AI học thêm bài học "ĐỪNG NÓI"
#
#   action = "reject"
#     → Hủy hoàn toàn, không gửi tin nhắn nào cho khách
#     → Nếu có rejection_reason → AI học bài học "ĐỪNG NÓI"
# ============================================================
@app.post("/chat/approve")
async def approve_or_override_chat(approval: ChatApprovalRequest):
    """
    Chủ shop duyệt / ghi đè / từ chối tin nhắn AI đang chờ.
    Sau khi xử lý, lịch sử hội thoại đầy đủ mới được lưu vào database.
    """
    db = SessionLocal()
    try:
        # 1. Tìm bản ghi đang chờ
        pending = db.query(PendingChatMessage).filter(
            PendingChatMessage.id == approval.pending_id
        ).first()

        if not pending:
            raise HTTPException(status_code=404, detail=f"Không tìm thấy pending_id={approval.pending_id}")

        if pending.status != "pending":
            raise HTTPException(
                status_code=400,
                detail=f"Tin nhắn này đã được xử lý rồi (status='{pending.status}')"
            )

        final_reply = None
        learning_result = {}

        # ----------------------------------------------------------------
        # CASE 1: APPROVE — Chủ shop duyệt đề xuất của AI
        # ----------------------------------------------------------------
        if approval.action == "approve":
            final_reply = pending.ai_suggestion
            pending.status = "approved"
            pending.final_reply = final_reply
            pending.resolved_at = datetime.utcnow()
            print(f"[✅ APPROVED] pending_id={pending.id}, customer={pending.customer_id}")

        # ----------------------------------------------------------------
        # CASE 2: OVERRIDE — Chủ shop tự điền câu trả lời của mình
        # ----------------------------------------------------------------
        elif approval.action == "override":
            if not approval.custom_message.strip():
                raise HTTPException(
                    status_code=400,
                    detail="Vui lòng cung cấp nội dung tin nhắn trong trường 'custom_message'"
                )

            final_reply = approval.custom_message
            pending.status = "overridden"
            pending.final_reply = final_reply
            pending.rejection_reason = approval.rejection_reason
            pending.resolved_at = datetime.utcnow()
            print(f"[✏️ OVERRIDDEN] pending_id={pending.id}, customer={pending.customer_id}")

            # 🎓 HỌC TỪ OVERRIDE:
            # Lưu cặp Q&A (câu khách + câu chủ shop tự viết) → bổ sung kiến thức
            learning_result["qa_learning"] = await learn_from_human_service(
                customer_q=pending.user_message,
                human_a=approval.custom_message
            )

            # 🎓 HỌC BÀI HỌC PHẢN DIỆN (nếu chủ shop giải thích lý do)
            if approval.rejection_reason.strip():
                rejection_context = (
                    f"Câu thay thế của chủ shop: '{approval.custom_message}'. "
                    f"Lý do: {approval.rejection_reason}"
                )
                learning_result["rejection_learning"] = await learn_from_rejection_service(
                    customer_message=pending.user_message,
                    ai_suggestion=pending.ai_suggestion,
                    rejection_context=rejection_context
                )

        # ----------------------------------------------------------------
        # CASE 3: REJECT — Hủy hoàn toàn, không gửi gì
        # ----------------------------------------------------------------
        elif approval.action == "reject":
            pending.status = "rejected"
            pending.rejection_reason = approval.rejection_reason
            pending.resolved_at = datetime.utcnow()
            db.commit()
            print(f"[🚫 REJECTED] pending_id={pending.id}, customer={pending.customer_id}")

            # 🎓 HỌC BÀI HỌC PHẢN DIỆN từ lý do từ chối
            if approval.rejection_reason.strip():
                learning_result["rejection_learning"] = await learn_from_rejection_service(
                    customer_message=pending.user_message,
                    ai_suggestion=pending.ai_suggestion,
                    rejection_context=f"Lý do từ chối: {approval.rejection_reason}"
                )

            return {
                "status": "success",
                "action": "reject",
                "pending_id": pending.id,
                "customer_id": pending.customer_id,
                "message": "🚫 Tin nhắn đã bị hủy. AI đã ghi nhận phản hồi của chủ shop.",
                "learning": learning_result
            }

        # 2. Lưu tin nhắn cuối cùng vào lịch sử hội thoại (ChatMessage)
        save_message(db, pending.customer_id, "assistant", final_reply)

        # 3. Lưu vào ChatLog để tổng hợp cuối ngày
        new_log = ChatLog(
            customer_q=pending.user_message,
            ai_a=final_reply,
            insight=pending.sensor_insight
        )
        db.add(new_log)
        db.commit()

        return {
            "status": "success",
            "action": approval.action,
            "pending_id": pending.id,
            "customer_id": pending.customer_id,
            "final_reply": final_reply,
            "message": "✅ Lịch sử hội thoại đã được lưu đầy đủ.",
            "learning": learning_result
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"LỖI /chat/approve: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.delete("/chat/{customer_id}")
async def delete_chat_history(customer_id: str):
    db = SessionLocal()
    try:
        db.query(DB_ChatMessage).filter(DB_ChatMessage.customer_id == customer_id).delete()
        db.commit()
        return {"status": "success", "message": f"Đã xóa lịch sử chat của {customer_id}"}
    except Exception as e:
        db.rollback()
        return {"status": "error", "detail": str(e)}
    finally:
        db.close()

@app.post("/system/reset-all")
async def reset_all_data():
    db = SessionLocal()
    try:
        # 1. Xóa sạch các bảng trong SQL
        db.query(DB_ChatMessage).delete()
        db.query(ChatLog).delete()
        db.query(CoordinationTask).delete()
        db.query(PendingChatMessage).delete()
        db.commit()

        # 2. Xóa sạch kiến thức trong Vector DB (ChromaDB)
        from config import chroma_client
        all_cols = ["policy_db", "product_db", "resolved_qa_db"]
        for col in all_cols:
            try:
                chroma_client.delete_collection(col)
                chroma_client.get_or_create_collection(col)
            except:
                pass

        return {"status": "success", "message": "Hệ thống đã được đưa về trạng thái trắng."}
    finally:
        db.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)