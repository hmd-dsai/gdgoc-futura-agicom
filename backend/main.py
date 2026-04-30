from datetime import datetime
import json
import hashlib
import os
import uuid
import asyncio
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from google.genai import types

from config import client, resolved_qa_col
from models import (
    IncomingData, ProposalApproval, ChatMessageRequest, ProductRequest,
    GuardrailResponse, StrategyProposal, ShopProfile, ChatSessionInput, ChatMessage, ReviewData,
    ContentAgentRequest, ScriptGenerateRequest, FilmingGuideRequest, ScriptFeedbackRequest,
)
from prompts import CHAT_SYSTEM_PROMPT, STRATEGY_SYSTEM_PROMPT, REVIEW_LEARNING_PROMPT
from services import (
    analyze_strategy_slow_track,
    customer_care_fast_track,
    analyze_raw_data_phase1,
    learn_from_human_service,
    cskh_rag_service,
    chat_with_history_service,
    scrape_product_data,
    analyze_content_intel_service,
    generate_scripts_service,
    generate_filming_guide_service,
    improve_script_service,
)
from database import SessionLocal, ChatLog, CoordinationTask, ChatMessage as DB_ChatMessage, save_message, init_db, DailySummaryArchive, ReviewLog, ContentSuggestion, CustomerProfile, get_or_create_customer_profile
import config as _cfg
from seed_demo import seed_vector_db

init_db()

try:
    if _cfg.policy_col.count() == 0:
        print("[startup] Vector DB trống — đang auto-seed dữ liệu nền...")
        seed_vector_db(_cfg.policy_col, _cfg.product_col, _cfg.resolved_qa_col)
        print("[startup] Auto-seed Vector DB hoàn tất.")
except Exception as _seed_err:
    print(f"[startup] Cảnh báo: không thể auto-seed Vector DB: {_seed_err}")

app = FastAPI(title="Agicom Core Backend")

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

# ── In-memory Job Store cho Content Agent ────────────────────────────────────
# key: job_id (str) -> {"status": "queued|processing|done|error", "step": str,
#                        "progress": float, "result": dict, "error": str}
_content_jobs: dict = {}
# key: product_intel_id -> product intel dict
_product_intel_store: dict = {}
# key: script_id -> {"scripts": [...], "product_intel_id": str}
_script_store: dict = {}

# ── Health check ─────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"status": "ok", "message": "Agicom Backend đang chạy!", "version": "1.1.0"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

# ── Existing endpoints (giữ nguyên) ──────────────────────────────────────────

@app.get("/test-phase1/{sku_id}")
async def test_data_analyst_agent(sku_id: str):
    try:
        result = await analyze_raw_data_phase1(sku_id)
        return {"status": "success", "message": "Data Analyst đã trích xuất thành công!", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/observe-and-think")
async def process_data_pipeline(input_data: IncomingData):
    try:
        print(f"[*] OBSERVE: Nhận dữ liệu loại '{input_data.data_type}'")
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
    if approval.status == "approved":
        return {"status": "Executed & Learned", "message": "Đã đồng bộ lên sàn và lưu vào ChromaDB"}
    elif approval.status == "declined":
        return {"status": "Re-evaluating", "message": "Đang tính toán lại dựa trên phản hồi của bạn"}

@app.post("/fast-track-chat")
async def process_customer_chat(chat: ChatMessageRequest, profile: ShopProfile):
    try:
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
                http_options={"timeout": 30000}
            )
        )
        if not response.text:
            raise HTTPException(status_code=500, detail="Lỗi phản hồi từ AI.")
        clean_text = response.text.replace("```json", "").replace("```", "").strip()
        guardrail_result = json.loads(clean_text)
        if guardrail_result["is_safe"] and guardrail_result["confidence_score"] >= 0.7:
            action = "Auto-Reply Executed"
            status_color = "Green"
        else:
            action = "Sent to Dashboard for Human Approval"
            status_color = "Red/Orange"
        return {"status": "success", "routing_action": action, "system_color": status_color, "ai_evaluation": guardrail_result}
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
                http_options={"timeout": 60000}
            )
        )
        if not response.text:
            raise HTTPException(status_code=500, detail="Lỗi phản hồi từ AI.")
        clean_text = response.text.replace("```json", "").replace("```", "").strip()
        strategy_result = json.loads(clean_text)
        routing_msg = "Sent to Dashboard for Human Approval" if strategy_result.get("action_required") else "No Action Needed - Monitored"
        return {"status": "success", "routing_action": routing_msg, "proposal_id": f"PROP-{product.product_id}-001", "data": strategy_result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/fast-track-chat-v2")
async def process_chat_v2(chat: ChatMessage, profile: ShopProfile):
    try:
        ai_response = await cskh_rag_service(chat.customer_text, profile.brand_tone)
        db = SessionLocal()
        new_log = ChatLog(customer_q=chat.customer_text, ai_a=ai_response.get("suggested_reply", ""), insight=ai_response.get("sensor_insight"))
        db.add(new_log)
        db.commit()
        db.close()
        return {"status": "success", "data": ai_response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/learn-feedback")
async def human_feedback(customer_q: str, human_a: str):
    return await learn_from_human_service(customer_q, human_a)

@app.get("/daily-summary")
async def get_daily_summary(archive: bool = Query(False)):
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
                report_date=current_date, archived_at=datetime.utcnow(),
                risk_status=risk_status, risk_tasks_json=json.dumps(risk_tasks, ensure_ascii=False),
                pricing_tasks_json=json.dumps(pricing_tasks, ensure_ascii=False),
                content_tasks_json=json.dumps(content_tasks, ensure_ascii=False),
                insights_json=json.dumps(insights, ensure_ascii=False),
                total_tasks=len(tasks), total_insights=len(insights)
            )
            db.add(archive_record)
            for t in tasks: t.status = "archived"
            all_unarchived_logs = db.query(ChatLog).filter(ChatLog.is_archived == False).all()
            for log in all_unarchived_logs: log.is_archived = True
            db.commit()
        return {
            "date": current_date.isoformat(),
            "risk_management": {"status": risk_status, "urgent_actions": risk_tasks},
            "growth_strategy": {"pricing_proposals": pricing_tasks, "content_optimizations": content_tasks},
            "customer_sentiment_overview": insights
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.post("/export-daily-summary")
async def export_and_archive_daily_summary():
    return await get_daily_summary(archive=True)

@app.get("/api/chatbot/features")
async def get_chatbot_features():
    return {"features": [
        {"id": "sentiment", "title": "Phân tích cảm xúc", "status": "Ổn định", "detail": "Theo dõi trạng thái cảm xúc theo từng cụm hội thoại để cảnh báo sớm nhóm khách tiêu cực."},
        {"id": "faq-report", "title": "Báo cáo thắc mắc", "status": "Đang cập nhật", "detail": "Tổng hợp câu hỏi lặp lại trong ngày, ưu tiên theo tần suất và mức độ ảnh hưởng."},
    ]}

@app.get("/api/quality/overview")
async def get_quality_overview():
    return {"items": [
        {"id": "chatbot-summary", "title": "Tổng hợp từ chat bot", "value": "128 tín hiệu/7 ngày", "note": "Hệ thống gom nhóm phản hồi theo chủ đề sản phẩm, kênh bán và thời điểm phát sinh."},
        {"id": "crisis-management", "title": "Quản trị khủng hoảng", "value": "1 cảnh báo cần xử lý", "note": "Phát hiện cụm phản hồi tiêu cực tăng nhanh ở nhóm giao vận, đề xuất xử lý ưu tiên trong 24 giờ."},
    ]}

@app.post("/learn-from-review")
async def process_and_learn_review(review: ReviewData):
    try:
        user_prompt = f"Sản phẩm ID: {review.product_id}\nSố sao: {review.rating}/5\nNội dung: '{review.review_text}'"
        response = await client.aio.models.generate_content(
            model="gemini-flash-latest",
            contents=[REVIEW_LEARNING_PROMPT, user_prompt],
            config=types.GenerateContentConfig(response_mime_type="application/json")
        )
        clean_text = response.text.replace("```json", "").replace("```", "").strip()
        analysis = json.loads(clean_text)
        if analysis.get("qa_knowledge") and analysis["qa_knowledge"] != "None":
            doc_id = hashlib.md5(review.review_text.encode()).hexdigest()
            resolved_qa_col.add(documents=[f"[Kinh nghiệm từ Review {review.rating} sao]: {analysis['qa_knowledge']}"], ids=[f"rev_{doc_id}"])
        db = SessionLocal()
        try:
            new_review_log = ReviewLog(product_id=review.product_id, rating=review.rating, review_text=review.review_text, customer_name=review.customer_name, ai_insight=analysis.get("qa_knowledge", "Không có insight nổi bật"))
            db.add(new_review_log)
            if analysis.get("action_needed") or review.rating <= 3:
                instruction = f"CẢNH BÁO REVIEW {review.rating} SAO: {analysis.get('key_issue')}. Nội dung: '{review.review_text}'"
                target_agent = "RiskManager"
                if "giá" in review.review_text.lower(): target_agent = "Pricing"
                elif "màu" in review.review_text.lower(): target_agent = "Content"
                new_task = CoordinationTask(target_agent=target_agent, product_id=review.product_id, instruction=instruction, status="pending")
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
    db = SessionLocal()
    try:
        query = db.query(ReviewLog)
        if product_id:
            query = query.filter(ReviewLog.product_id == product_id)
        reviews = query.order_by(ReviewLog.timestamp.desc()).limit(limit).all()
        return {"total_fetched": len(reviews), "data": reviews}
    finally:
        db.close()

@app.get("/api/crisis-overview")
async def get_crisis_overview():
    db = SessionLocal()
    try:
        risk_tasks = db.query(CoordinationTask).filter(CoordinationTask.target_agent == "RiskManager", CoordinationTask.status == "pending").order_by(CoordinationTask.id.desc()).all()
        neg_reviews = db.query(ReviewLog).filter(ReviewLog.rating <= 3).order_by(ReviewLog.timestamp.desc()).limit(20).all()
        risk_chat_logs = db.query(ChatLog).filter(ChatLog.is_archived == False, ChatLog.insight.isnot(None), ChatLog.insight != "").order_by(ChatLog.timestamp.desc()).limit(30).all()
        risk_keywords = ["lỗi", "hỏng", "kém", "tệ", "xấu", "complain", "khiếu nại", "trả hàng", "hoàn tiền", "bức xúc", "tức"]
        risk_chat_insights = [log for log in risk_chat_logs if any(kw in (log.insight or "").lower() for kw in risk_keywords)]
        PRODUCT_ALIASES = {
            "anker-100w-cap": "ANKER-100W-01", "cáp sạc anker 100w": "ANKER-100W-01",
            "cap sac anker 100w": "ANKER-100W-01", "anker 100w": "ANKER-100W-01",
            "cáp anker": "ANKER-100W-01", "anker": "ANKER-100W-01",
            "airpods-p2": "AIRPODS-P2", "airpods pro 2": "AIRPODS-P2",
            "tai nghe airpods pro": "AIRPODS-P2", "s24-ultra-001": "S24-ULTRA-001",
            "samsung galaxy s24": "S24-ULTRA-001", "s24 ultra": "S24-ULTRA-001",
        }
        IGNORED_PIDS = {"general", "none", "unknown", "chat_general", ""}
        def normalize_pid(raw_pid: str) -> str:
            if not raw_pid: return "unknown"
            key = raw_pid.lower().strip()
            return PRODUCT_ALIASES.get(key, raw_pid)
        product_signals = {}
        for r in neg_reviews:
            pid = normalize_pid(r.product_id or "unknown")
            if pid.lower() in IGNORED_PIDS: pid = "unknown"
            if pid not in product_signals: product_signals[pid] = {"neg_reviews": [], "risk_tasks": [], "chat_signals": []}
            product_signals[pid]["neg_reviews"].append({"rating": r.rating, "text": (r.review_text or "")[:120], "insight": r.ai_insight or "", "customer": r.customer_name or "Ẩn danh", "time": r.timestamp.strftime("%H:%M, %d/%m/%Y") if r.timestamp else ""})
        for t in risk_tasks:
            pid = normalize_pid(t.product_id or "unknown")
            if pid.lower() in IGNORED_PIDS: pid = "unknown"
            if pid not in product_signals: product_signals[pid] = {"neg_reviews": [], "risk_tasks": [], "chat_signals": []}
            product_signals[pid]["risk_tasks"].append(t.instruction or "")
        for log in risk_chat_insights:
            pid = "chat_general"
            if pid not in product_signals: product_signals[pid] = {"neg_reviews": [], "risk_tasks": [], "chat_signals": []}
            product_signals[pid]["chat_signals"].append(log.insight or "")
        crises = []
        for pid, data in product_signals.items():
            neg_count = len(data["neg_reviews"]); task_count = len(data["risk_tasks"]); chat_count = len(data["chat_signals"])
            score = min(100, neg_count * 15 + task_count * 25 + chat_count * 10)
            severity = "critical" if score >= 60 else "warning" if score >= 25 else "monitoring"
            crises.append({"product_id": pid, "severity": severity, "severity_score": score, "neg_review_count": neg_count, "risk_task_count": task_count, "chat_signal_count": chat_count, "reviews": data["neg_reviews"][:3], "risk_tasks": data["risk_tasks"][:5], "chat_signals": data["chat_signals"][:3], "detected_from": "live_backend"})
        crises.sort(key=lambda x: x["severity_score"], reverse=True)
        if any(c["severity"] == "critical" for c in crises): overall_status = "critical"
        elif any(c["severity"] == "warning" for c in crises): overall_status = "warning"
        elif crises: overall_status = "monitoring"
        else: overall_status = "safe"
        return {"overall_status": overall_status, "total_crisis_products": len(crises), "total_neg_reviews": len(neg_reviews), "total_risk_tasks": len(risk_tasks), "total_chat_signals": len(risk_chat_insights), "crises": crises, "last_updated": datetime.now().isoformat()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.post("/chat-v3")
async def process_chat_with_history(data: ChatSessionInput):
    db = SessionLocal()
    try:
        save_message(db, data.customer_id, "user", data.message)
        ai_response = await chat_with_history_service(db, data.customer_id, data.message, data.brand_tone)
        reply_content = ai_response.get("suggested_reply", "Dạ, em chưa hiểu ý mình ạ.")
        save_message(db, data.customer_id, "assistant", reply_content)
        return {"status": "success", "customer_id": data.customer_id, "reply": reply_content, "ai_evaluation": ai_response}
    except Exception as e:
        print(f"LỖI CHAT HISTORY: {str(e)}")
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

@app.get("/api/customer-profile/{customer_id}")
async def get_customer_profile(customer_id: str):
    db = SessionLocal()
    try:
        profile = get_or_create_customer_profile(db, customer_id)
        purchase_history = json.loads(profile.purchase_history or "[]")
        return {"status": "success", "customer_id": profile.customer_id, "churn_probability": profile.churn_probability, "emotion_index": profile.emotion_index, "customer_segment": profile.customer_segment, "total_orders": profile.total_orders, "total_spent": profile.total_spent, "last_purchase_date": profile.last_purchase_date, "purchase_history": purchase_history, "notes": profile.notes, "updated_at": profile.updated_at.isoformat() if profile.updated_at else None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.patch("/api/customer-profile/{customer_id}")
async def update_customer_profile(customer_id: str, payload: dict):
    db = SessionLocal()
    try:
        profile = get_or_create_customer_profile(db, customer_id)
        allowed_fields = {"churn_probability", "emotion_index", "customer_segment", "total_orders", "total_spent", "last_purchase_date", "purchase_history", "notes"}
        for field, value in payload.items():
            if field in allowed_fields:
                if field == "purchase_history" and isinstance(value, list):
                    value = json.dumps(value, ensure_ascii=False)
                setattr(profile, field, value)
        profile.updated_at = datetime.utcnow()
        db.commit()
        return {"status": "success", "customer_id": customer_id}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.get("/api/content-suggestions")
async def get_content_suggestions():
    db = SessionLocal()
    try:
        saved_sugs = db.query(ContentSuggestion).filter(ContentSuggestion.status != "ignored").order_by(ContentSuggestion.combined_score.desc()).all()
        content_tasks = db.query(CoordinationTask).filter(CoordinationTask.target_agent == "Content", CoordinationTask.status == "pending").order_by(CoordinationTask.id.desc()).all()
        neg_reviews = db.query(ReviewLog).filter(ReviewLog.rating <= 3).order_by(ReviewLog.timestamp.desc()).limit(30).all()
        recent_insights = db.query(ChatLog).filter(ChatLog.is_archived == False, ChatLog.insight.isnot(None)).order_by(ChatLog.timestamp.desc()).limit(20).all()
        suggestions = []
        saved_suggestion_ids = set()
        for s in saved_sugs:
            saved_suggestion_ids.add(s.suggestion_id)
            sq = []; sr = []
            try: sq = json.loads(s.sample_questions or "[]")
            except Exception: pass
            try: sr = json.loads(s.sample_reviews or "[]")
            except Exception: pass
            suggestions.append({"id": s.suggestion_id, "db_id": s.id, "title": s.title, "type": s.type or "guide", "platform": s.platform or "Blog + Website", "priority": s.priority or "medium", "status": s.status, "combined_score": s.combined_score or 70, "chatbot_signal": {"count": s.chatbot_count or 0, "topic": s.chatbot_topic or "Từ backend", "sample_questions": sq}, "review_signal": {"count": s.review_count or 0, "neg_pct": s.review_neg_pct or 0, "sample_reviews": sr}, "angle": s.angle or "", "estimated_impact": s.estimated_impact or "Cải thiện trải nghiệm khách hàng", "estimated_production": s.estimated_production or "1-2 ngày", "_fromBackend": True, "_source": s.source or "db"})
        def _detect_type(text):
            t = (text or "").lower()
            if any(k in t for k in ["video", "quay", "tiktok", "youtube"]): return "video"
            if any(k in t for k in ["so sánh", " vs ", "compare"]): return "comparison"
            if any(k in t for k in ["faq", "blog", "hướng dẫn", "câu hỏi", "giải đáp"]): return "blog_faq"
            return "guide"
        def _platform_for(t):
            return {"video": "TikTok + YouTube", "blog_faq": "Blog + Website", "comparison": "Blog + YouTube", "guide": "Website + Shopee"}.get(t, "Đa nền tảng")
        neg_by_product = {}
        for r in neg_reviews:
            pid = r.product_id or "unknown"
            neg_by_product.setdefault(pid, []).append(r)
        for task in content_tasks:
            task_sug_id = f"task-{task.id}"
            if task_sug_id in saved_suggestion_ids: continue
            related_neg = neg_by_product.get(task.product_id or "", [])
            sug_type = _detect_type(task.instruction)
            score = min(99, 65 + len(related_neg) * 8 + (10 if related_neg else 0))
            suggestions.append({"id": task_sug_id, "title": (task.instruction or "")[:100], "type": sug_type, "platform": _platform_for(sug_type), "priority": "high" if len(related_neg) >= 1 or score >= 80 else "medium", "status": "pending", "combined_score": score, "chatbot_signal": {"count": len(recent_insights), "topic": "Phát hiện từ báo cáo hàng ngày", "sample_questions": [log.customer_q[:60] for log in recent_insights[:2]]}, "review_signal": {"count": len(related_neg), "neg_pct": 100 if related_neg else 0, "sample_reviews": [(r.review_text or "")[:60] for r in related_neg[:2]]}, "angle": task.instruction or "", "estimated_impact": "Giảm câu hỏi lặp lại ~30-50%", "estimated_production": {"video": "1-2 ngày", "blog_faq": "2-4 giờ", "comparison": "1 ngày", "guide": "3-5 giờ"}.get(sug_type, "1-2 ngày"), "_fromBackend": True, "_source": "content_task"})
        suggestions.sort(key=lambda x: (0 if x["status"] in ("saved", "scheduled") else 1, -x["combined_score"]))
        return {"total": len(suggestions), "suggestions": suggestions, "meta": {"neg_review_count": len(neg_reviews), "content_tasks_count": len(content_tasks), "chat_signals_count": len(recent_insights), "saved_in_db": len(saved_sugs)}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.patch("/api/content-suggestions/{suggestion_id}/status")
async def update_content_suggestion_status(suggestion_id: str, body: dict):
    new_status = body.get("status")
    if new_status not in ("pending", "saved", "scheduled", "ignored"):
        raise HTTPException(status_code=400, detail="status không hợp lệ")
    db = SessionLocal()
    try:
        sug = db.query(ContentSuggestion).filter(ContentSuggestion.suggestion_id == suggestion_id).first()
        if sug:
            sug.status = new_status; sug.updated_at = datetime.utcnow()
        else:
            title = body.get("title", suggestion_id)
            sug = ContentSuggestion(suggestion_id=suggestion_id, title=title[:200] if title else suggestion_id, type=body.get("type", "guide"), platform=body.get("platform", ""), priority=body.get("priority", "medium"), status=new_status, combined_score=int(body.get("combined_score", 0)), chatbot_count=int(body.get("chatbot_count", 0)), chatbot_topic=body.get("chatbot_topic", ""), review_count=int(body.get("review_count", 0)), review_neg_pct=int(body.get("review_neg_pct", 0)), sample_questions=json.dumps(body.get("sample_questions", []), ensure_ascii=False), sample_reviews=json.dumps(body.get("sample_reviews", []), ensure_ascii=False), angle=body.get("angle", ""), estimated_impact=body.get("estimated_impact", ""), estimated_production=body.get("estimated_production", ""), source=body.get("source", "frontend"))
            db.add(sug)
        db.commit()
        return {"status": "success", "suggestion_id": suggestion_id, "new_status": new_status}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.post("/system/reset-all")
async def reset_all_data():
    db = SessionLocal()
    try:
        db.query(DB_ChatMessage).delete(); db.query(ChatLog).delete(); db.query(CoordinationTask).delete()
        db.commit()
        from config import chroma_client
        all_cols = ["policy_db", "product_db", "resolved_qa_db"]
        for col in all_cols:
            try: chroma_client.delete_collection(col); chroma_client.get_or_create_collection(col)
            except: pass
        return {"status": "success", "message": "Hệ thống đã được đưa về trạng thái trắng."}
    finally:
        db.close()


# ── Content Agent Endpoints ───────────────────────────────────────────────────

async def _run_content_analysis_job(job_id: str, req: ContentAgentRequest):
    """Background task: scrape -> analyze -> store result."""
    try:
        # Step 1: Scrape
        _content_jobs[job_id]["step"] = "scraping_product"
        _content_jobs[job_id]["progress"] = 0.1

        if req.product_data_override:
            product_data = req.product_data_override
            product_data["_scrape_success"] = True
            product_data["platform"] = req.platform
        else:
            product_data = await scrape_product_data(req.product_url, req.platform)

        _content_jobs[job_id]["step"] = "analyzing_with_ai"
        _content_jobs[job_id]["progress"] = 0.4

        # Step 2: LLM analysis
        intel = await analyze_content_intel_service(
            product_data=product_data,
            shop_context=req.shop_context,
            content_goal=req.content_goal,
            product_url=req.product_url,
        )

        # Step 3: Store
        intel_id = f"pi_{uuid.uuid4().hex[:12]}"
        _product_intel_store[intel_id] = intel

        _content_jobs[job_id]["status"] = "done"
        _content_jobs[job_id]["progress"] = 1.0
        _content_jobs[job_id]["step"] = "completed"
        _content_jobs[job_id]["result"] = {
            "product_intel_id": intel_id,
            "product_name": intel.get("product_name", ""),
            "usp": intel.get("usp", []),
            "audience": intel.get("audience", []),
            "positioning": intel.get("positioning", ""),
            "recommended_content_format": intel.get("recommended_content_format", ""),
            "content_tone": intel.get("content_tone", ""),
            "key_message": intel.get("key_message", ""),
            "scrape_success": intel.get("scrape_success", False),
        }

    except Exception as e:
        print(f"[content_agent] Job {job_id} failed: {e}")
        _content_jobs[job_id]["status"] = "error"
        _content_jobs[job_id]["error"] = str(e)


async def _run_script_gen_job(job_id: str, req: ScriptGenerateRequest, product_intel: dict):
    """Background task: generate scripts for all variants."""
    try:
        _content_jobs[job_id]["step"] = "generating_scripts"
        _content_jobs[job_id]["progress"] = 0.2

        scripts = await generate_scripts_service(
            product_intel=product_intel,
            variants=req.variants,
            video_length=req.video_length,
            language=req.language,
            persona_id=req.persona_id,
        )

        script_id = f"scr_{uuid.uuid4().hex[:12]}"
        _script_store[script_id] = {
            "scripts": scripts,
            "product_intel_id": req.product_intel_id,
            "generated_at": datetime.utcnow().isoformat(),
        }

        _content_jobs[job_id]["status"] = "done"
        _content_jobs[job_id]["progress"] = 1.0
        _content_jobs[job_id]["step"] = "completed"
        _content_jobs[job_id]["result"] = {
            "script_id": script_id,
            "variants_generated": [s.get("variant", "unknown") for s in scripts],
            "scripts": scripts,
        }

    except Exception as e:
        print(f"[script_gen] Job {job_id} failed: {e}")
        _content_jobs[job_id]["status"] = "error"
        _content_jobs[job_id]["error"] = str(e)


@app.post("/api/v1/content-agent/analyze", status_code=202)
async def analyze_product(req: ContentAgentRequest, background_tasks: BackgroundTasks):
    """
    Nhận product link → scrape → phân tích USP + Audience bằng LLM.
    Trả về job_id để poll kết quả qua GET /api/v1/content-agent/jobs/{job_id}.
    """
    job_id = f"job_{uuid.uuid4().hex[:16]}"
    _content_jobs[job_id] = {
        "status": "queued",
        "step": "waiting",
        "progress": 0.0,
        "result": None,
        "error": None,
        "created_at": datetime.utcnow().isoformat(),
    }
    background_tasks.add_task(_run_content_analysis_job, job_id, req)
    return {
        "job_id": job_id,
        "status": "queued",
        "estimated_seconds": 30,
        "poll_url": f"/api/v1/content-agent/jobs/{job_id}",
    }


@app.get("/api/v1/content-agent/jobs/{job_id}")
async def get_job_status(job_id: str):
    """Poll trạng thái job. Khi status='done', result chứa đầy đủ kết quả."""
    job = _content_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' không tồn tại.")
    return {
        "job_id": job_id,
        "status": job["status"],         # queued | processing | done | error
        "step": job.get("step", ""),
        "progress": job.get("progress", 0.0),
        "result": job.get("result"),
        "error": job.get("error"),
        "created_at": job.get("created_at"),
    }


@app.get("/api/v1/content-agent/product-intel/{intel_id}")
async def get_product_intel(intel_id: str):
    """Lấy lại kết quả phân tích sản phẩm đã lưu (cache)."""
    intel = _product_intel_store.get(intel_id)
    if not intel:
        raise HTTPException(status_code=404, detail=f"Product Intel '{intel_id}' không tồn tại hoặc đã hết hạn.")
    return {"status": "success", "product_intel_id": intel_id, "data": intel}


@app.post("/api/v1/content-agent/script/generate", status_code=202)
async def generate_script(req: ScriptGenerateRequest, background_tasks: BackgroundTasks):
    """
    Từ product_intel_id → tạo script cho tất cả variants được yêu cầu.
    Trả về job_id để poll kết quả.
    """
    product_intel = _product_intel_store.get(req.product_intel_id)
    if not product_intel:
        raise HTTPException(
            status_code=404,
            detail=f"Product Intel '{req.product_intel_id}' không tìm thấy. Hãy chạy /analyze trước."
        )
    job_id = f"job_{uuid.uuid4().hex[:16]}"
    _content_jobs[job_id] = {
        "status": "queued",
        "step": "waiting",
        "progress": 0.0,
        "result": None,
        "error": None,
        "created_at": datetime.utcnow().isoformat(),
    }
    background_tasks.add_task(_run_script_gen_job, job_id, req, product_intel)
    return {
        "job_id": job_id,
        "status": "queued",
        "estimated_seconds": 45,
        "poll_url": f"/api/v1/content-agent/jobs/{job_id}",
    }


@app.post("/api/v1/content-agent/filming-guide")
async def generate_filming_guide(req: FilmingGuideRequest):
    """
    Từ script đã chọn → tạo hướng dẫn quay phim chi tiết (sync endpoint).
    Trả về hướng dẫn từng cảnh: setup, ánh sáng, góc quay, props.
    """
    store = _script_store.get(req.script_id)
    if not store:
        raise HTTPException(
            status_code=404,
            detail=f"Script '{req.script_id}' không tìm thấy. Hãy chạy /script/generate trước."
        )

    # Tìm variant được yêu cầu
    target_script = None
    for s in store.get("scripts", []):
        if s.get("variant") == req.variant:
            target_script = s
            break

    if not target_script:
        available = [s.get("variant") for s in store.get("scripts", [])]
        raise HTTPException(
            status_code=404,
            detail=f"Variant '{req.variant}' không có trong script. Các variant hiện có: {available}"
        )

    try:
        guide = await generate_filming_guide_service(
            script=target_script,
            equipment=req.equipment,
            location=req.location,
        )
        return {
            "status": "success",
            "script_id": req.script_id,
            "variant": req.variant,
            "equipment": req.equipment,
            "location": req.location,
            "guide": guide,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/content-agent/script/feedback")
async def improve_script_with_feedback(req: ScriptFeedbackRequest):
    """
    Chủ shop feedback → agent cải thiện script ngay lập tức (sync).
    Input tự nhiên như 'hook chưa đủ mạnh' hoặc 'tone quá formal'.
    """
    store = _script_store.get(req.script_id)
    if not store:
        raise HTTPException(
            status_code=404,
            detail=f"Script '{req.script_id}' không tìm thấy."
        )

    target_script = None
    for s in store.get("scripts", []):
        if s.get("variant") == req.variant:
            target_script = s
            break

    if not target_script:
        raise HTTPException(status_code=404, detail=f"Variant '{req.variant}' không có trong script.")

    try:
        improved = await improve_script_service(script_data=target_script, feedback=req.feedback)
        # Cập nhật lại store với phiên bản mới
        for i, s in enumerate(store["scripts"]):
            if s.get("variant") == req.variant:
                store["scripts"][i] = improved
                break
        return {
            "status": "success",
            "script_id": req.script_id,
            "variant": req.variant,
            "feedback_applied": req.feedback,
            "improved_script": improved,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/content-agent/trends")
async def get_content_trends(
    platform: str = Query("tiktok", description="tiktok | shopee | lazada"),
    industry: str = Query("general", description="beauty | fashion | tech | food | general"),
    limit: int = Query(10, ge=1, le=20),
):
    """
    Trả về trending hooks, formats, hashtags theo ngành và platform.
    Dữ liệu static + có thể mở rộng kết nối API thực tế sau.
    """
    TRENDS_DB = {
        "tiktok": {
            "beauty": {
                "hooks": [
                    "POV: bạn lần đầu thử [sản phẩm] và không thể tin vào mắt mình...",
                    "Tôi đã tốn 5 triệu trước khi biết đến cái này 😭",
                    "Anh/chị ơi, da mình sau 7 ngày dùng...",
                    "Honest review sau 30 ngày — không filter, không chỉnh sửa",
                    "Đây là lý do dân mạng đang điên đảo vì [sản phẩm]",
                ],
                "formats": ["before_after", "get_ready_with_me", "honest_review", "tutorial", "unboxing"],
                "hashtags": ["#lammẹp", "#beautyreview", "#skincare", "#reviewmypham", "#beautyhacks"],
            },
            "fashion": {
                "hooks": [
                    "Outfit dưới 300k mà ai cũng tưởng đắt tiền",
                    "POV: bạn tìm được set đồ hoàn hảo sau bao lâu tìm kiếm",
                    "3 cách phối đồ với [sản phẩm] này — cách 3 bất ngờ lắm",
                    "Stylist không muốn bạn biết điều này...",
                ],
                "formats": ["outfit_check", "styling_tips", "haul", "ootd", "comparison"],
                "hashtags": ["#ootd", "#fashionvietnam", "#thudofashion", "#outfitinspo", "#streetstyle"],
            },
            "tech": {
                "hooks": [
                    "Gadget này đã thay đổi hoàn toàn workflow của mình",
                    "Mua về rồi mới biết tính năng ẩn này...",
                    "So sánh [A] vs [B] — cái nào xứng đáng hơn?",
                    "Lỗi thường gặp và cách fix trong 30 giây",
                ],
                "formats": ["unboxing", "review", "comparison", "tutorial", "tips_tricks"],
                "hashtags": ["#techreview", "#gadget", "#reviewcongnghe", "#techtok", "#iphone"],
            },
            "general": {
                "hooks": [
                    "Sản phẩm này có thực sự xứng đáng không? Honest review!",
                    "POV: order online và nhận được điều không ngờ",
                    "Mình đã dùng thử [X ngày] — đây là kết quả thật",
                    "Đừng mua trước khi xem video này",
                ],
                "formats": ["review", "unboxing", "comparison", "tutorial", "haul"],
                "hashtags": ["#review", "#shopee", "#muasamonline", "#trending", "#viral"],
            },
        },
        "shopee": {
            "general": {
                "hooks": ["Flash sale hôm nay — deal không thể bỏ lỡ", "Đánh giá thật sau khi nhận hàng"],
                "formats": ["product_demo", "review", "comparison"],
                "hashtags": ["#shopee", "#shoppingonline", "#dealkhung", "#shopshopeevn"],
            },
        },
    }

    platform_data = TRENDS_DB.get(platform, TRENDS_DB["tiktok"])
    industry_data = platform_data.get(industry, platform_data.get("general", {}))

    hooks = (industry_data.get("hooks") or [])[:limit]
    formats = (industry_data.get("formats") or [])[:limit]
    hashtags = (industry_data.get("hashtags") or [])[:limit]

    return {
        "platform": platform,
        "industry": industry,
        "hooks": hooks,
        "formats": formats,
        "hashtags": hashtags,
        "total_hooks": len(hooks),
        "note": "Dữ liệu static. Kết nối Kalodata API để lấy trending real-time.",
        "updated_at": datetime.utcnow().isoformat(),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
