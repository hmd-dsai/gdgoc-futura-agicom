from datetime import datetime
import json
import hashlib
import os
import re
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from google.genai import types

# Nhập các thành phần từ file khác
from config import client
from models import (
    ProposalApproval, ProductRequest,
    StrategyProposal, ShopProfile, ChatSessionInput, ChatMessage, ReviewData,
    CrisisPlanRequest, ActionStatusUpdate, ContentScriptRequest
)
from prompts import (
    STRATEGY_SYSTEM_PROMPT, REVIEW_LEARNING_PROMPT, CRISIS_PLAN_PROMPT,
    CONTENT_SCRIPT_PROMPT, CONTENT_INTEL_PROMPT
)
from services import (
    analyze_strategy_slow_track,
    learn_from_human_service,
    chat_with_history_service
)
from database import SessionLocal, ChatLog, CoordinationTask, ChatMessage as DB_ChatMessage, save_message, init_db, DailySummaryArchive, ReviewLog, ContentSuggestion, CustomerProfile, get_or_create_customer_profile, StrategyProposalLog, LearnedQAEntry, CrisisPlan, CrisisAction
import config as _cfg
from seed_demo import seed_vector_db, seed_sql_db, seed_content_suggestions, seed_customer_profiles, seed_crisis_demo

# ---------------------------------------------------------------------------
# Product catalog — built once at startup from data/catalog/product_catalog.json.
# PRODUCT_ALIASES : alias (lowercase) → canonical product_id ("son bong" → "P001")
# PRODUCT_NAMES   : product_id → display name          ("P001" → "Son Bóng GIAO FARA")
# To add a new product: edit the catalog JSON only — no code change needed here.
# ---------------------------------------------------------------------------
def _build_product_catalog() -> tuple:
    catalog_path = os.path.normpath(
        os.path.join(os.path.dirname(__file__), "../data/catalog/product_catalog.json")
    )
    try:
        with open(catalog_path, encoding="utf-8") as f:
            catalog = json.load(f)
        aliases: dict = {}
        names:   dict = {}
        for product in catalog.get("products", []):
            canonical_id = product["product_id"]
            names[canonical_id] = product.get("short_name") or product.get("name", canonical_id)
            for alias in product.get("aliases", []):
                aliases[alias.lower().strip()] = canonical_id
        print(f"[startup] Product catalog loaded: {len(catalog['products'])} products, {len(aliases)} aliases.")
        return aliases, names
    except FileNotFoundError:
        print(f"[startup] WARNING: product_catalog.json not found at {catalog_path} — catalog dicts will be empty.")
        return {}, {}
    except Exception as e:
        print(f"[startup] WARNING: Could not load product catalog: {e}")
        return {}, {}

PRODUCT_ALIASES: dict
PRODUCT_NAMES:   dict
PRODUCT_ALIASES, PRODUCT_NAMES = _build_product_catalog()

init_db()

# Auto-seed vector DB nếu rỗng (xảy ra sau mỗi cold start của Render vì dùng EphemeralClient)
try:
    if _cfg.policy_col.count() == 0:
        print("[startup] Vector DB trống — đang auto-seed dữ liệu nền...")
        seed_vector_db(_cfg.policy_col, _cfg.product_col, _cfg.resolved_qa_col)
        print("[startup] Auto-seed Vector DB hoàn tất.")

        # Replay các entry đã học động (từ review/chat) — đây là kiến thức KHÔNG có trong seed files.
        # Dùng upsert (không phải add) để an toàn khi PersistentClient đã có data.
        _replay_db = SessionLocal()
        try:
            _learned = _replay_db.query(LearnedQAEntry).all()
            if _learned:
                _cfg.resolved_qa_col.upsert(
                    documents=[e.document for e in _learned],
                    ids=[e.doc_id for e in _learned]
                )
                print(f"[startup] Đã replay {len(_learned)} learned Q&A entries từ SQL vào resolved_qa_db.")
        except Exception as _replay_err:
            print(f"[startup] Cảnh báo: không thể replay learned Q&A entries: {_replay_err}")
        finally:
            _replay_db.close()
except Exception as _seed_err:
    print(f"[startup] Cảnh báo: không thể auto-seed Vector DB: {_seed_err}")

app = FastAPI(title="Agicom Core Backend")

# ---------------------------------------------------------------------------
# CORS – cho phép frontend Netlify và localhost kết nối
# Có thể thu hẹp lại bằng cách set biến môi trường FRONTEND_URL trên Render
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

@app.post("/act-and-learn")
async def human_approval_flow(approval: ProposalApproval):
    """
    ACT → HUMAN APPROVAL → LEARN
    Xử lý quyết định duyệt/từ chối đề xuất chiến lược của chủ shop.

    approved:
      - ACT:   Tạo CoordinationTask gửi lệnh cập nhật giá cho Pricing Agent
               (thay thế cho Shopee API call thực tế trong giai đoạn này)
      - LEARN: Lưu chiến lược thành công vào Vector DB để AI học hỏi
               và tránh đề xuất lại những gì đã được chứng minh đúng

    declined:
      - LEARN: Lưu chiến lược bị từ chối + lý do vào Vector DB
               để AI tránh lặp lại sai lầm tương tự
      - ACT:   Tạo CoordinationTask yêu cầu AI tính toán lại với feedback
    """
    if approval.status not in ("approved", "declined"):
        raise HTTPException(status_code=400, detail="status phải là 'approved' hoặc 'declined'")

    db = SessionLocal()
    try:
        # ── 1. Tra cứu đề xuất gốc từ DB ────────────────────────────────────
        proposal = db.query(StrategyProposalLog).filter(
            StrategyProposalLog.proposal_id == approval.proposal_id
        ).first()

        # Xây dựng context để lưu vào Vector DB.
        # Dùng dữ liệu từ DB nếu có; nếu proposal cũ (trước migration) thì dùng fallback.
        if proposal:
            product_id   = proposal.product_id   or "unknown"
            product_name = proposal.product_name or "unknown"
            reasoning    = proposal.pricing_reasoning or ""
            content_sug  = proposal.content_update_suggestion or ""
            price_str    = f"{proposal.proposed_price:,.0f}đ" if proposal.proposed_price else "N/A"
            margin_str   = f"{proposal.expected_margin_percent:.1f}%" if proposal.expected_margin_percent else "N/A"
            urgency      = proposal.urgency_level or ""
        else:
            # Proposal chưa được lưu (trước khi triển khai migration này)
            product_id = product_name = "unknown"
            reasoning = content_sug = urgency = ""
            price_str = margin_str = "N/A"
            print(f"[act-and-learn] Cảnh báo: không tìm thấy proposal {approval.proposal_id} trong DB")

        now = datetime.utcnow()

        # ── 2. Nhánh APPROVED ────────────────────────────────────────────────
        if approval.status == "approved":

            # 2a. LEARN — Lưu chiến lược thành công vào Vector DB
            import hashlib
            doc_id = hashlib.md5(approval.proposal_id.encode()).hexdigest()
            learn_doc = (
                f"[Chiến lược được duyệt] Sản phẩm: {product_name} ({product_id}). "
                f"Giá đề xuất: {price_str}. Margin: {margin_str}. Mức độ khẩn: {urgency}. "
                f"Lập luận: {reasoning}. "
                f"Đề xuất nội dung: {content_sug}. "
                f"Kết quả: Chủ shop PHÊ DUYỆT — đây là chiến lược đúng hướng."
            )
            # Ghi vào strategy_col — collection riêng cho lịch sử chiến lược.
            # Chatbot KHÔNG đọc collection này; chỉ /slow-track-strategy dùng để tham khảo.
            _cfg.strategy_col.add(
                documents=[learn_doc],
                ids=[f"strategy_approved_{doc_id}"]
            )
            print(f"[act-and-learn] LEARN: Đã lưu chiến lược được duyệt vào strategy_learnings_db (proposal: {approval.proposal_id})")

            # 2b. ACT — Tạo CoordinationTask để Pricing Agent "thực thi" trên sàn
            # (Trong production: đây sẽ là lời gọi Shopee/Tiki API thực sự)
            platform_task = CoordinationTask(
                target_agent="Pricing",
                product_id=product_id,
                instruction=(
                    f"[ĐÃ DUYỆT - CẬP NHẬT GIÁ] {product_name} ({product_id}): "
                    f"Giá mới {price_str} (margin {margin_str}). "
                    f"Lý do: {reasoning[:200]}. "
                    f"Proposal: {approval.proposal_id}"
                ),
                status="pending",
            )
            db.add(platform_task)

            # 2c. Cập nhật trạng thái proposal
            if proposal:
                proposal.status = "approved"
                proposal.resolved_at = now

            db.commit()
            print(f"[act-and-learn] ACT: Đã tạo Pricing task cho sàn (product: {product_id})")

            return {
                "status": "approved",
                "message": f"Đã lưu chiến lược vào bộ nhớ AI và gửi lệnh cập nhật giá cho {product_name}.",
                "learned": True,
                "platform_task_created": True,
                "product_id": product_id,
            }

        # ── 3. Nhánh DECLINED ────────────────────────────────────────────────
        elif approval.status == "declined":
            feedback_text = approval.feedback or "Không có lý do cụ thể"

            # 3a. LEARN — Lưu bài học "điều không nên làm" vào Vector DB
            import hashlib
            doc_id = hashlib.md5(f"{approval.proposal_id}_declined".encode()).hexdigest()
            learn_doc = (
                f"[Chiến lược bị từ chối] Sản phẩm: {product_name} ({product_id}). "
                f"Giá đề xuất: {price_str}. Margin: {margin_str}. Mức độ khẩn: {urgency}. "
                f"Lập luận AI: {reasoning}. "
                f"Lý do từ chối của chủ shop: {feedback_text}. "
                f"Bài học: Tránh đề xuất chiến lược tương tự cho sản phẩm này trong tương lai."
            )
            _cfg.strategy_col.add(
                documents=[learn_doc],
                ids=[f"strategy_declined_{doc_id}"]
            )
            print(f"[act-and-learn] LEARN: Đã lưu chiến lược bị từ chối vào strategy_learnings_db (proposal: {approval.proposal_id})")

            # 3b. ACT — Tạo CoordinationTask yêu cầu tính toán lại với feedback
            reeval_task = CoordinationTask(
                target_agent="Pricing",
                product_id=product_id,
                instruction=(
                    f"[TỪ CHỐI - TÍNH TOÁN LẠI] {product_name} ({product_id}): "
                    f"Đề xuất {approval.proposal_id} bị từ chối. "
                    f"Lý do: {feedback_text}. "
                    f"Yêu cầu: Phân tích lại chiến lược định giá có tính đến phản hồi này."
                ),
                status="pending",
            )
            db.add(reeval_task)

            # 3c. Cập nhật trạng thái proposal
            if proposal:
                proposal.status = "declined"
                proposal.feedback = feedback_text
                proposal.resolved_at = now

            db.commit()
            print(f"[act-and-learn] ACT: Đã tạo re-evaluation task (product: {product_id})")

            return {
                "status": "declined",
                "message": f"Đã ghi nhận phản hồi và yêu cầu AI tính toán lại chiến lược cho {product_name}.",
                "learned": True,
                "reeval_task_created": True,
                "product_id": product_id,
            }

    except Exception as e:
        db.rollback()
        print(f"[act-and-learn] LỖI: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.post("/slow-track-strategy")
async def process_market_strategy(product: ProductRequest):
    try:
        # Inject personalization into the prompt
        personalized_system_prompt = STRATEGY_SYSTEM_PROMPT.format(
            strategic_vision=product.shop_profile.strategic_vision,
            target_customers=product.shop_profile.target_customers
        )

        user_prompt = f"Hồ sơ dữ liệu sản phẩm hiện tại: {product.model_dump_json()}"

        # Keep your existing structure and timeouts
        response = await client.aio.models.generate_content(
            model="gemini-flash-latest",
            contents=[personalized_system_prompt, user_prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=StrategyProposal,
                http_options={'timeout': 60000} # 60s timeout
            )
        )

        if not response.text:
            raise HTTPException(status_code=500, detail="Lỗi phản hồi từ AI.")
            
        # GIỮ NGUYÊN LOGIC CLEAN TEXT
        clean_text = response.text.replace("```json", "").replace("```", "").strip()
        strategy_result = json.loads(clean_text)

        # Routing based on "Action Required"
        routing_msg = "Sent to Dashboard for Human Approval" if strategy_result.get("action_required") else "No Action Needed - Monitored"
        proposal_id = f"PROP-{product.product_id}-{int(datetime.now().timestamp())}"

        # Lưu đề xuất vào SQL để /act-and-learn có thể tra cứu nội dung khi duyệt/từ chối
        db = SessionLocal()
        try:
            # Nếu đã có pending proposal cho cùng product_id, đánh dấu cũ là superseded
            existing = db.query(StrategyProposalLog).filter(
                StrategyProposalLog.product_id == product.product_id,
                StrategyProposalLog.status == "pending"
            ).all()
            for old in existing:
                old.status = "superseded"

            db.add(StrategyProposalLog(
                proposal_id=proposal_id,
                product_id=product.product_id,
                product_name=product.product_name,
                proposed_price=strategy_result.get("proposed_price", 0),
                expected_margin_percent=strategy_result.get("expected_margin_percent", 0),
                pricing_reasoning=strategy_result.get("pricing_reasoning", ""),
                content_update_suggestion=strategy_result.get("content_update_suggestion", ""),
                urgency_level=strategy_result.get("urgency_level", ""),
                action_required=bool(strategy_result.get("action_required", False)),
                status="pending",
            ))
            db.commit()
        except Exception as db_err:
            db.rollback()
            print(f"[slow-track-strategy] Cảnh báo: không lưu được proposal log: {db_err}")
        finally:
            db.close()

        return {
            "status": "success",
            "routing_action": routing_msg,
            "proposal_id": proposal_id,
            "data": strategy_result
        }
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

@app.get("/api/dashboard/ai-stats")
async def get_dashboard_ai_stats():
    """
    Thống kê hiệu suất AI Agent thực từ DB — dùng cho card "Hiệu suất AI Agent" trên Tổng quan.
    Trả về counts theo thời gian thực thay vì dữ liệu hardcoded.
    """
    db = SessionLocal()
    try:
        # Content Suggestions
        all_sugs       = db.query(ContentSuggestion).all()
        sug_total      = len(all_sugs)
        sug_pending    = sum(1 for s in all_sugs if s.status == "pending")
        sug_approved   = sum(1 for s in all_sugs if s.status == "approved")
        sug_rejected   = sum(1 for s in all_sugs if s.status == "rejected")

        # Chat Logs (proxy: tổng số cuộc hội thoại đã xử lý)
        chats_total    = db.query(ChatLog).count()
        chats_escalated = db.query(ChatLog).filter(ChatLog.is_archived == True).count()

        # Reviews
        reviews_total  = db.query(ReviewLog).count()
        reviews_neg    = db.query(ReviewLog).filter(ReviewLog.rating <= 3).count()

        # Coordination Tasks (tác vụ AI giao con người)
        tasks_total    = db.query(CoordinationTask).count()
        tasks_pending  = db.query(CoordinationTask).filter(
            CoordinationTask.status == "pending"
        ).count()

        # Crisis Plans được AI sinh ra
        crisis_plans   = db.query(CrisisPlan).count()
        crisis_actions_done = db.query(CrisisAction).filter(
            CrisisAction.status == "done"
        ).count()
        crisis_actions_total = db.query(CrisisAction).count()

        return {
            "suggestions": {
                "total":    sug_total,
                "pending":  sug_pending,
                "approved": sug_approved,
                "rejected": sug_rejected,
            },
            "chats": {
                "total":     chats_total,
                "escalated": chats_escalated,
                "auto":      max(0, chats_total - chats_escalated),
            },
            "reviews": {
                "total":    reviews_total,
                "negative": reviews_neg,
                "positive": max(0, reviews_total - reviews_neg),
            },
            "tasks": {
                "total":   tasks_total,
                "pending": tasks_pending,
                "done":    max(0, tasks_total - tasks_pending),
            },
            "crisis": {
                "plans_generated":  crisis_plans,
                "actions_done":     crisis_actions_done,
                "actions_total":    crisis_actions_total,
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.get("/api/shop-profile")
async def get_shop_profile():
    """
    Trả về thông tin shop từ data/mock/shop_profile.json — dùng cho sidebar và form Cài đặt.
    """
    try:
        profile_path = os.path.join(os.path.dirname(__file__), "../data/mock/shop_profile.json")
        with open(profile_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        shop = data["shops"][0] if data.get("shops") else {}
        user = data["users"][0] if data.get("users") else {}
        sub  = data["subscriptions"][0] if data.get("subscriptions") else {}
        shop_name = shop.get("shop_name", "GIAO FARA Official Store")
        # Tạo initials từ tên shop (lấy chữ cái đầu mỗi từ, tối đa 2 ký tự)
        words = shop_name.split()
        initials = "".join(w[0].upper() for w in words if w)[:2]
        plan_name = sub.get("plan_name", "growth").capitalize()
        platform = shop.get("platform", "shopee").capitalize()
        return {
            "shop_name":  shop_name,
            "initials":   initials,
            "platform":   platform,
            "plan":       plan_name,
            "role_label": f"Gói {plan_name} · {platform}",
            "owner_name": user.get("full_name", ""),
            "email":      user.get("email", ""),
            "status":     shop.get("status", "connected"),
        }
    except FileNotFoundError:
        return {
            "shop_name":  "GIAO FARA Official Store",
            "initials":   "GF",
            "platform":   "Shopee",
            "plan":       "Growth",
            "role_label": "Gói Growth · Shopee",
            "owner_name": "Nguyễn Thị Hương",
            "email":      "owner@giaofara.vn",
            "status":     "connected",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _classify_issue(key_issue: str, review_text: str) -> str:
    """
    Phân loại vấn đề từ key_issue + review_text thành một category ổn định.
    Dùng để dedup CoordinationTask: nhiều review cùng loại vấn đề → gộp vào 1 task.

    Categories:
      quality    — chất lượng sản phẩm (màu, độ bền, thành phần, kích ứng…)
      shipping   — giao hàng / đóng gói
      price      — giá cả
      wrong_item — giao sai hàng / sai màu
      general    — fallback
    """
    text = (key_issue + " " + review_text).lower()
    if any(w in text for w in ["sai màu", "sai hàng", "sai sản phẩm", "nhầm hàng", "không đúng màu", "không đúng hàng"]):
        return "wrong_item"
    if any(w in text for w in ["giao hàng", "ship", "shipper", "đóng gói", "hộp bị", "móp", "vỡ", "rò rỉ", "bao bì"]):
        return "shipping"
    if any(w in text for w in ["giá", "đắt", "rẻ", "giảm giá", "chiết khấu", "giá cả", "giá cao"]):
        return "price"
    if any(w in text for w in [
        "chất lượng", "màu bay", "màu phai", "bong tróc", "khô môi", "lông rụng", "gãy cán",
        "kích ứng", "nổi mụn", "dị ứng", "rát", "không lì", "không bền", "purging",
        "thành phần", "mùi", "texture", "độ bám", "trôi màu", "kem bị", "son bị"
    ]):
        return "quality"
    return "general"


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
        
        # 2. LƯU BÀI HỌC VÀO VECTOR DB (Dành cho AI Chatbot đọc)
        # Dùng _cfg.resolved_qa_col (không import trực tiếp) để luôn trỏ đúng collection
        # sau khi /system/reset-all tạo lại collection mới.
        _qa_doc_id  = None
        _qa_doc_txt = None
        if analysis.get("qa_knowledge") and analysis["qa_knowledge"] != "None":
            _qa_doc_id  = f"rev_{hashlib.md5(review.review_text.encode()).hexdigest()}"
            _qa_doc_txt = f"[Kinh nghiệm từ Review {review.rating} sao]: {analysis['qa_knowledge']}"
            _cfg.resolved_qa_col.add(
                documents=[_qa_doc_txt],
                ids=[_qa_doc_id]
            )

        # 3. LƯU REVIEW GỐC, BACKUP LEARNED Q&A & TẠO TASK VÀO SQL
        db = SessionLocal()
        try:
            # 3a. Backup entry học được vào SQL (để replay khi vector DB bị xóa)
            if _qa_doc_id and _qa_doc_txt:
                db.merge(LearnedQAEntry(doc_id=_qa_doc_id, document=_qa_doc_txt, source="review"))

            # Lưu lịch sử Review gốc
            new_review_log = ReviewLog(
                product_id=review.product_id,
                rating=review.rating,
                review_text=review.review_text,
                customer_name=review.customer_name,
                ai_insight=analysis.get('qa_knowledge', "Không có insight nổi bật")
            )
            db.add(new_review_log)

            # Tạo Task nếu Review xấu — với deduplication
            if analysis.get("action_needed") or review.rating <= 3:
                key_issue = analysis.get('key_issue', '')

                # Xác định agent phù hợp
                target_agent = "RiskManager"
                if "giá" in review.review_text.lower():
                    target_agent = "Pricing"
                elif "màu" in review.review_text.lower() and "chất lượng" not in review.review_text.lower():
                    target_agent = "Content"

                # Phân loại vấn đề thành category ổn định để dedup
                issue_type = _classify_issue(key_issue, review.review_text)

                # Kiểm tra xem đã có task pending cho cùng sản phẩm + agent + loại vấn đề chưa
                existing_task = db.query(CoordinationTask).filter(
                    CoordinationTask.product_id  == review.product_id,
                    CoordinationTask.target_agent == target_agent,
                    CoordinationTask.issue_type   == issue_type,
                    CoordinationTask.status       == "pending"
                ).first()

                if existing_task:
                    # Gộp tín hiệu vào task đã có thay vì tạo task mới
                    existing_task.signal_count = (existing_task.signal_count or 1) + 1
                    count = existing_task.signal_count
                    # Cập nhật prefix đếm tín hiệu, giữ nguyên nội dung gốc
                    base_instruction = existing_task.instruction
                    # Loại bỏ prefix cũ nếu có (dạng "[N tín hiệu] ")
                    base_instruction = re.sub(r'^\[\d+ tín hiệu\] ', '', base_instruction)
                    existing_task.instruction = f"[{count} tín hiệu] {base_instruction}"
                else:
                    # Tạo task mới
                    instruction = (
                        f"CẢNH BÁO REVIEW {review.rating} SAO: {key_issue}. "
                        f"Nội dung: '{review.review_text[:200]}'"
                    )
                    new_task = CoordinationTask(
                        target_agent  = target_agent,
                        product_id    = review.product_id,
                        instruction   = instruction,
                        status        = "pending",
                        signal_count  = 1,
                        issue_type    = issue_type,
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
        
        # Lọc theo sản phẩm nếu Frontend có truyền product_id
        if product_id:
            query = query.filter(ReviewLog.product_id == product_id)
            
        # Sắp xếp mới nhất đưa lên đầu
        reviews = query.order_by(ReviewLog.timestamp.desc()).limit(limit).all()
        
        return {
            "total_fetched": len(reviews),
            "data": reviews
        }
    finally:
        db.close()

@app.get("/api/crisis-overview")
async def get_crisis_overview():
    """
    Tổng hợp tín hiệu khủng hoảng từ Reviews tiêu cực và CoordinationTasks rủi ro.
    Dùng để đồng bộ frontend Quản trị Khủng hoảng với dữ liệu thực.
    """
    db = SessionLocal()
    try:
        # 1. Lấy tất cả task RiskManager đang pending
        risk_tasks = db.query(CoordinationTask).filter(
            CoordinationTask.target_agent == "RiskManager",
            CoordinationTask.status == "pending"
        ).order_by(CoordinationTask.id.desc()).all()

        # 2. Lấy review tiêu cực (rating <= 3)
        neg_reviews = db.query(ReviewLog).filter(
            ReviewLog.rating <= 3
        ).order_by(ReviewLog.timestamp.desc()).limit(20).all()

        # 3. Lấy chat insights có rủi ro (dùng keyword trong insight)
        risk_chat_logs = db.query(ChatLog).filter(
            ChatLog.is_archived == False,
            ChatLog.insight.isnot(None),
            ChatLog.insight != ""
        ).order_by(ChatLog.timestamp.desc()).limit(30).all()

        risk_keywords = ["lỗi", "hỏng", "kém", "tệ", "xấu", "complain", "khiếu nại", "trả hàng", "hoàn tiền", "bức xúc", "tức"]
        risk_chat_insights = [
            log for log in risk_chat_logs
            if any(kw in (log.insight or "").lower() for kw in risk_keywords)
        ]

        # PRODUCT_ALIASES được nạp từ data/catalog/product_catalog.json lúc khởi động.
        # Để thêm sản phẩm mới: chỉ cần cập nhật catalog JSON — không cần sửa code ở đây.
        # IDs quá chung chung, không tạo crisis entry riêng
        IGNORED_PIDS = {"general", "none", "unknown", "chat_general", ""}

        def normalize_pid(raw_pid: str) -> str:
            if not raw_pid:
                return "unknown"
            key = raw_pid.lower().strip()
            return PRODUCT_ALIASES.get(key, raw_pid)

        # 4. Gom nhóm tín hiệu tiêu cực theo sản phẩm (sau khi chuẩn hóa ID)
        product_signals: dict = {}

        for r in neg_reviews:
            pid = normalize_pid(r.product_id or "unknown")
            if pid.lower() in IGNORED_PIDS:
                pid = "unknown"
            if pid not in product_signals:
                product_signals[pid] = {"neg_reviews": [], "risk_tasks": [], "chat_signals": []}
            product_signals[pid]["neg_reviews"].append({
                "rating": r.rating,
                "text": (r.review_text or "")[:120],
                "insight": r.ai_insight or "",
                "customer": r.customer_name or "Ẩn danh",
                "time": r.timestamp.strftime("%H:%M, %d/%m/%Y") if r.timestamp else ""
            })

        for t in risk_tasks:
            pid = normalize_pid(t.product_id or "unknown")
            if pid.lower() in IGNORED_PIDS:
                pid = "unknown"
            if pid not in product_signals:
                product_signals[pid] = {"neg_reviews": [], "risk_tasks": [], "chat_signals": []}
            # Bao gồm signal_count để crisis center hiển thị "N tín hiệu gộp"
            signal_count = t.signal_count if t.signal_count and t.signal_count > 1 else None
            task_text = t.instruction or ""
            if signal_count:
                # Đảm bảo prefix tín hiệu luôn hiển thị dù DB cũ chưa có prefix
                if not re.match(r'^\[\d+ tín hiệu\]', task_text):
                    task_text = f"[{signal_count} tín hiệu] {task_text}"
            product_signals[pid]["risk_tasks"].append(task_text)

        for log in risk_chat_insights:
            pid = "chat_general"
            if pid not in product_signals:
                product_signals[pid] = {"neg_reviews": [], "risk_tasks": [], "chat_signals": []}
            product_signals[pid]["chat_signals"].append(log.insight or "")

        # 5. Tính severity + gắn plan metadata cho từng sản phẩm
        crises = []
        for pid, data in product_signals.items():
            neg_count  = len(data["neg_reviews"])
            task_count = len(data["risk_tasks"])
            chat_count = len(data["chat_signals"])

            # Tính severity score (tối đa 100)
            score = min(100, neg_count * 15 + task_count * 25 + chat_count * 10)

            if score >= 60:
                severity = "critical"
            elif score >= 25:
                severity = "warning"
            else:
                severity = "monitoring"

            # Gắn tên sản phẩm từ catalog (fallback về pid nếu không có)
            product_name = PRODUCT_NAMES.get(pid, pid)

            # Kiểm tra xem đã có AI plan chưa (truy vấn DB nhanh)
            existing_plan = db.query(CrisisPlan).filter(
                CrisisPlan.product_id == pid
            ).order_by(CrisisPlan.generated_at.desc()).first()

            plan_meta = None
            if existing_plan:
                done_count  = db.query(CrisisAction).filter(
                    CrisisAction.plan_id == existing_plan.plan_id,
                    CrisisAction.status  == "done"
                ).count()
                total_count = db.query(CrisisAction).filter(
                    CrisisAction.plan_id == existing_plan.plan_id
                ).count()
                plan_meta = {
                    "plan_id":      existing_plan.plan_id,
                    "urgency":      existing_plan.urgency,
                    "done_actions": done_count,
                    "total_actions": total_count,
                    "generated_at": existing_plan.generated_at.isoformat() if existing_plan.generated_at else None
                }

            crises.append({
                "product_id":        pid,
                "product_name":      product_name,
                "severity":          severity,
                "severity_score":    score,
                "neg_review_count":  neg_count,
                "risk_task_count":   task_count,
                "chat_signal_count": chat_count,
                "reviews":           data["neg_reviews"][:5],   # tăng từ 3 → 5 để frontend có đủ data
                "risk_tasks":        data["risk_tasks"][:5],
                "chat_signals":      data["chat_signals"][:5],
                "plan":              plan_meta,
                "detected_from":     "live_backend"
            })

        # Sắp xếp theo severity score giảm dần
        crises.sort(key=lambda x: x["severity_score"], reverse=True)

        # 6. Trạng thái tổng thể
        if any(c["severity"] == "critical" for c in crises):
            overall_status = "critical"
        elif any(c["severity"] == "warning" for c in crises):
            overall_status = "warning"
        elif crises:
            overall_status = "monitoring"
        else:
            overall_status = "safe"

        return {
            "overall_status": overall_status,
            "total_crisis_products": len(crises),
            "total_neg_reviews": len(neg_reviews),
            "total_risk_tasks": len(risk_tasks),
            "total_chat_signals": len(risk_chat_insights),
            "crises": crises,
            "last_updated": datetime.now().isoformat()
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


# ---------------------------------------------------------------------------
# CRISIS PLAN ENDPOINTS
# POST /api/crisis-plan          — sinh kế hoạch AI, lưu vào DB (có cache 1h)
# GET  /api/crisis-plan/{pid}    — lấy plan + actions đã lưu cho product
# PATCH /api/crisis-action/{aid} — cập nhật trạng thái 1 action (done/skipped/pending)
# ---------------------------------------------------------------------------

@app.post("/api/crisis-plan")
async def generate_crisis_plan(req: CrisisPlanRequest):
    """
    Gọi Gemini để sinh kế hoạch xử lý khủng hoảng có cấu trúc.
    Lưu CrisisPlan + CrisisActions vào SQL để frontend có thể check-off.
    Nếu plan cho product_id này đã tồn tại và < 1h tuổi, trả về plan cũ
    (trừ khi force_regenerate=True).
    """
    db = SessionLocal()
    try:
        # ── Kiểm tra cache (tránh gọi LLM mỗi page load) ──
        if not req.force_regenerate:
            from datetime import timedelta
            cutoff = datetime.utcnow() - timedelta(hours=1)
            cached = db.query(CrisisPlan).filter(
                CrisisPlan.product_id == req.product_id,
                CrisisPlan.generated_at >= cutoff
            ).order_by(CrisisPlan.generated_at.desc()).first()
            if cached:
                actions = db.query(CrisisAction).filter(
                    CrisisAction.plan_id == cached.plan_id
                ).order_by(CrisisAction.id).all()
                return {
                    "plan_id":            cached.plan_id,
                    "product_id":         cached.product_id,
                    "root_cause_summary": cached.root_cause_summary,
                    "urgency":            cached.urgency,
                    "generated_at":       cached.generated_at.isoformat(),
                    "from_cache":         True,
                    "actions": [{
                        "action_id":     a.action_id,
                        "type":          a.type,
                        "category":      a.category,
                        "title":         a.title,
                        "detail":        a.detail,
                        "draft_message": a.draft_message,
                        "status":        a.status
                    } for a in actions]
                }

        # ── Chuẩn bị dữ liệu cho prompt ──
        reviews_text = "\n".join(
            f"- [{r.get('rating',0)}★] {r.get('customer','Ẩn danh')}: {r.get('text','')}"
            + (f" | AI insight: {r.get('insight','')}" if r.get('insight') else "")
            for r in req.reviews
        ) or "Không có review tiêu cực."

        risk_tasks_text = "\n".join(f"- {t}" for t in req.risk_tasks) or "Không có tác vụ rủi ro."
        chat_signals_text = "\n".join(f"- {s}" for s in req.chat_signals) or "Không có tín hiệu chat."

        prompt = CRISIS_PLAN_PROMPT.format(
            product_id=req.product_id,
            product_name=req.product_name,
            neg_review_count=req.neg_review_count,
            risk_task_count=req.risk_task_count,
            chat_signal_count=req.chat_signal_count,
            reviews_text=reviews_text,
            risk_tasks_text=risk_tasks_text,
            chat_signals_text=chat_signals_text,
        )

        response = await client.aio.models.generate_content(
            model="gemini-flash-latest",
            contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json")
        )
        clean = response.text.replace("```json","").replace("```","").strip()
        plan_data = json.loads(clean)

        # ── Lưu vào SQL ──
        ts = int(datetime.utcnow().timestamp())
        plan_id = f"plan_{req.product_id}_{ts}"

        # Xóa plan cũ cho cùng product_id (giữ DB gọn)
        old_plans = db.query(CrisisPlan).filter(CrisisPlan.product_id == req.product_id).all()
        for op in old_plans:
            db.query(CrisisAction).filter(CrisisAction.plan_id == op.plan_id).delete()
        db.query(CrisisPlan).filter(CrisisPlan.product_id == req.product_id).delete()

        new_plan = CrisisPlan(
            plan_id=plan_id,
            product_id=req.product_id,
            root_cause_summary=plan_data.get("root_cause_summary",""),
            urgency=plan_data.get("urgency","medium"),
            crisis_snapshot=json.dumps({"reviews": req.reviews, "risk_tasks": req.risk_tasks,
                                        "chat_signals": req.chat_signals}, ensure_ascii=False)
        )
        db.add(new_plan)

        saved_actions = []
        for i, act in enumerate(plan_data.get("actions", [])):
            action_id = f"act_{req.product_id}_{i}_{ts}"
            new_action = CrisisAction(
                action_id=action_id,
                plan_id=plan_id,
                product_id=req.product_id,
                type=act.get("type","immediate"),
                category=act.get("category","monitor"),
                title=act.get("title",""),
                detail=act.get("detail",""),
                draft_message=act.get("draft_message") or None,
                status="pending"
            )
            db.add(new_action)
            saved_actions.append({
                "action_id":     action_id,
                "type":          new_action.type,
                "category":      new_action.category,
                "title":         new_action.title,
                "detail":        new_action.detail,
                "draft_message": new_action.draft_message,
                "status":        "pending"
            })

        db.commit()
        return {
            "plan_id":            plan_id,
            "product_id":         req.product_id,
            "root_cause_summary": new_plan.root_cause_summary,
            "urgency":            new_plan.urgency,
            "generated_at":       new_plan.generated_at.isoformat() if new_plan.generated_at else None,
            "from_cache":         False,
            "actions":            saved_actions
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.get("/api/crisis-plan/{product_id}")
async def get_crisis_plan(product_id: str):
    """Trả về plan + actions mới nhất đã lưu cho một sản phẩm. 404 nếu chưa có."""
    db = SessionLocal()
    try:
        plan = db.query(CrisisPlan).filter(
            CrisisPlan.product_id == product_id
        ).order_by(CrisisPlan.generated_at.desc()).first()

        if not plan:
            raise HTTPException(status_code=404, detail="Chưa có kế hoạch xử lý cho sản phẩm này.")

        actions = db.query(CrisisAction).filter(
            CrisisAction.plan_id == plan.plan_id
        ).order_by(CrisisAction.id).all()

        return {
            "plan_id":            plan.plan_id,
            "product_id":         plan.product_id,
            "root_cause_summary": plan.root_cause_summary,
            "urgency":            plan.urgency,
            "generated_at":       plan.generated_at.isoformat() if plan.generated_at else None,
            "from_cache":         True,
            "actions": [{
                "action_id":     a.action_id,
                "type":          a.type,
                "category":      a.category,
                "title":         a.title,
                "detail":        a.detail,
                "draft_message": a.draft_message,
                "status":        a.status
            } for a in actions]
        }
    finally:
        db.close()


@app.patch("/api/crisis-action/{action_id}")
async def update_crisis_action_status(action_id: str, update: ActionStatusUpdate):
    """Cập nhật trạng thái một action (pending → done / skipped / pending)."""
    if update.status not in ("pending", "done", "skipped"):
        raise HTTPException(status_code=400, detail="status phải là: pending | done | skipped")
    db = SessionLocal()
    try:
        action = db.query(CrisisAction).filter(CrisisAction.action_id == action_id).first()
        if not action:
            raise HTTPException(status_code=404, detail=f"Không tìm thấy action {action_id}")
        action.status = update.status
        db.commit()
        return {"action_id": action_id, "status": update.status}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.post("/chat-v3")
async def process_chat_with_history(data: ChatSessionInput):
    db = SessionLocal()
    try:
        # 1. Lưu tin nhắn của Người dùng vào SQLite
        save_message(db, data.customer_id, "user", data.message)

        # 2. Xử lý Logic AI (Lấy history -> RAG -> Gemini)
        ai_response = await chat_with_history_service(
            db, data.customer_id, data.message, data.brand_tone
        )
        
        reply_content = ai_response.get("suggested_reply", "Dạ, em chưa hiểu ý mình ạ.")

        # 3. Lưu câu trả lời của AI vào SQLite (kèm metadata để frontend replay đúng trạng thái)
        save_message(
            db, data.customer_id, "assistant", reply_content,
            is_safe=ai_response.get("is_safe"),
            confidence_score=ai_response.get("confidence_score"),
            sentiment=ai_response.get("sentiment_analysis"),
        )

        # 4. Trả về cho Frontend
        return {
            "status": "success",
            "customer_id": data.customer_id,
            "reply": reply_content,
            "ai_evaluation": ai_response
        }
    except Exception as e:
        print(f"LỖI CHAT HISTORY: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.get("/api/chat-messages/{customer_id}")
async def get_chat_messages_endpoint(customer_id: str, limit: int = 50):
    """Lấy lịch sử chat để frontend replay lại sau khi reload trang."""
    db = SessionLocal()
    try:
        from sqlalchemy import asc
        messages = (
            db.query(DB_ChatMessage)
            .filter(DB_ChatMessage.customer_id == customer_id)
            .order_by(asc(DB_ChatMessage.timestamp))
            .limit(limit)
            .all()
        )
        return {
            "status": "success",
            "customer_id": customer_id,
            "messages": [
                {
                    "role": m.role,
                    "content": m.content,
                    "timestamp": m.timestamp.isoformat() if m.timestamp else None,
                    # AI evaluation metadata — None cho tin nhắn của user
                    "is_safe": m.is_safe,
                    "confidence_score": m.confidence_score,
                    "sentiment": m.sentiment,
                }
                for m in messages
            ]
        }
    finally:
        db.close()


@app.delete("/chat/{customer_id}")
async def delete_chat_history(customer_id: str):
    db = SessionLocal()
    try:
        # Xóa các tin nhắn trong bảng ChatMessage của user này
        db.query(DB_ChatMessage).filter(DB_ChatMessage.customer_id == customer_id).delete()
        db.commit()
        return {"status": "success", "message": f"Đã xóa lịch sử chat của {customer_id}"}
    except Exception as e:
        db.rollback()
        return {"status": "error", "detail": str(e)}
    finally:
        db.close()


# ── Customer Profile ────────────────────────────────────────────────────────

def _deserialize_notes(raw: str | None) -> str | None:
    """
    notes được lưu dưới dạng JSON array ["insight1", "insight2"].
    Hàm này chuyển thành chuỗi dễ đọc để frontend hiển thị trực tiếp.
    Nếu raw là chuỗi plain text (DB cũ), trả về nguyên xi.
    """
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return " · ".join(str(i) for i in parsed if i)
    except (json.JSONDecodeError, TypeError):
        pass
    return raw  # fallback: plain text cũ


@app.get("/api/customer-profile/{customer_id}")
async def get_customer_profile(customer_id: str):
    """Trả về hồ sơ khách hàng; tự tạo mới nếu chưa tồn tại."""
    db = SessionLocal()
    try:
        profile = get_or_create_customer_profile(db, customer_id)
        purchase_history = json.loads(profile.purchase_history or "[]")
        return {
            "status": "success",
            "customer_id": profile.customer_id,
            "churn_probability": profile.churn_probability,
            "emotion_index": profile.emotion_index,
            "customer_segment": profile.customer_segment,
            "total_orders": profile.total_orders,
            "total_spent": profile.total_spent,
            "last_purchase_date": profile.last_purchase_date,
            "purchase_history": purchase_history,
            "notes": _deserialize_notes(profile.notes),
            "updated_at": profile.updated_at.isoformat() if profile.updated_at else None,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.patch("/api/customer-profile/{customer_id}")
async def update_customer_profile(customer_id: str, payload: dict):
    """Cập nhật một phần hồ sơ khách hàng (churn_probability, emotion_index, v.v.)."""
    db = SessionLocal()
    try:
        profile = get_or_create_customer_profile(db, customer_id)
        allowed_fields = {
            "churn_probability", "emotion_index", "customer_segment",
            "total_orders", "total_spent", "last_purchase_date",
            "purchase_history", "notes"
        }
        for field, value in payload.items():
            if field in allowed_fields:
                if field == "purchase_history" and isinstance(value, list):
                    value = json.dumps(value, ensure_ascii=False)
                setattr(profile, field, value)
        profile.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(profile)
        return {"status": "success", "customer_id": customer_id}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.get("/api/content-suggestions")
async def get_content_suggestions():
    """
    Tổng hợp tín hiệu content từ CoordinationTask + ChatLog + ReviewLog.
    Trả về danh sách đề xuất có cấu trúc để frontend hiển thị và merge với MOCK.
    """
    db = SessionLocal()
    try:
        # 1. Lấy ContentSuggestion đã lưu/lên lịch (chưa bị ignored)
        saved_sugs = db.query(ContentSuggestion).filter(
            ContentSuggestion.status != "ignored"
        ).order_by(ContentSuggestion.combined_score.desc()).all()

        # 2. Lấy content tasks đang pending
        content_tasks = db.query(CoordinationTask).filter(
            CoordinationTask.target_agent == "Content",
            CoordinationTask.status == "pending"
        ).order_by(CoordinationTask.id.desc()).all()

        # 3. Tín hiệu từ reviews tiêu cực (group by product)
        neg_reviews = db.query(ReviewLog).filter(
            ReviewLog.rating <= 3
        ).order_by(ReviewLog.timestamp.desc()).limit(30).all()

        # 4. Tín hiệu từ chat logs gần đây
        recent_insights = db.query(ChatLog).filter(
            ChatLog.is_archived == False,
            ChatLog.insight.isnot(None)
        ).order_by(ChatLog.timestamp.desc()).limit(20).all()

        suggestions = []

        # -- Từ ContentSuggestion đã lưu trong DB --
        saved_suggestion_ids = set()
        for s in saved_sugs:
            saved_suggestion_ids.add(s.suggestion_id)
            sq = []
            sr = []
            try:
                sq = json.loads(s.sample_questions or "[]")
            except Exception:
                pass
            try:
                sr = json.loads(s.sample_reviews or "[]")
            except Exception:
                pass
            suggestions.append({
                "id": s.suggestion_id,
                "db_id": s.id,
                "title": s.title,
                "type": s.type or "guide",
                "platform": s.platform or "Blog + Website",
                "priority": s.priority or "medium",
                "status": s.status,
                "combined_score": s.combined_score or 70,
                "chatbot_signal": {
                    "count": s.chatbot_count or 0,
                    "topic": s.chatbot_topic or "Từ backend",
                    "sample_questions": sq
                },
                "review_signal": {
                    "count": s.review_count or 0,
                    "neg_pct": s.review_neg_pct or 0,
                    "sample_reviews": sr
                },
                "angle": s.angle or "",
                "estimated_impact": s.estimated_impact or "Cải thiện trải nghiệm khách hàng",
                "estimated_production": s.estimated_production or "1-2 ngày",
                "_fromBackend": True,
                "_source": s.source or "db"
            })

        # -- Từ CoordinationTask target_agent=Content (chưa có trong DB) --
        def _detect_type(text):
            t = (text or "").lower()
            if any(k in t for k in ["video", "quay", "tiktok", "youtube"]):
                return "video"
            if any(k in t for k in ["so sánh", " vs ", "compare"]):
                return "comparison"
            if any(k in t for k in ["faq", "blog", "hướng dẫn", "câu hỏi", "giải đáp"]):
                return "blog_faq"
            return "guide"

        def _platform_for(t):
            return {
                "video": "TikTok + YouTube",
                "blog_faq": "Blog + Website",
                "comparison": "Blog + YouTube",
                "guide": "Website + Shopee"
            }.get(t, "Đa nền tảng")

        neg_by_product = {}
        for r in neg_reviews:
            pid = r.product_id or "unknown"
            neg_by_product.setdefault(pid, []).append(r)

        for task in content_tasks:
            task_sug_id = f"task-{task.id}"
            if task_sug_id in saved_suggestion_ids:
                continue  # đã có trong DB rồi

            related_neg = neg_by_product.get(task.product_id or "", [])
            sug_type = _detect_type(task.instruction)
            score = min(99, 65 + len(related_neg) * 8 + (10 if related_neg else 0))

            suggestions.append({
                "id": task_sug_id,
                "title": (task.instruction or "")[:100],
                "type": sug_type,
                "platform": _platform_for(sug_type),
                "priority": "high" if len(related_neg) >= 1 or score >= 80 else "medium",
                "status": "pending",
                "combined_score": score,
                "chatbot_signal": {
                    "count": len(recent_insights),
                    "topic": "Phát hiện từ báo cáo hàng ngày",
                    "sample_questions": [log.customer_q[:60] for log in recent_insights[:2]]
                },
                "review_signal": {
                    "count": len(related_neg),
                    "neg_pct": 100 if related_neg else 0,
                    "sample_reviews": [(r.review_text or "")[:60] for r in related_neg[:2]]
                },
                "angle": task.instruction or "",
                "estimated_impact": f"Giảm câu hỏi lặp lại ~30–50%",
                "estimated_production": {"video": "1-2 ngày", "blog_faq": "2-4 giờ", "comparison": "1 ngày", "guide": "3-5 giờ"}.get(sug_type, "1-2 ngày"),
                "_fromBackend": True,
                "_source": "content_task"
            })

        # Sắp xếp: đã lưu/lên lịch lên đầu, rồi theo score
        suggestions.sort(key=lambda x: (0 if x["status"] in ("saved", "scheduled") else 1, -x["combined_score"]))

        return {
            "total": len(suggestions),
            "suggestions": suggestions,
            "meta": {
                "neg_review_count": len(neg_reviews),
                "content_tasks_count": len(content_tasks),
                "chat_signals_count": len(recent_insights),
                "saved_in_db": len(saved_sugs)
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.patch("/api/content-suggestions/{suggestion_id}/status")
async def update_content_suggestion_status(suggestion_id: str, body: dict):
    """
    Cập nhật trạng thái đề xuất content: pending | saved | scheduled | ignored.
    Tự động tạo mới bản ghi nếu chưa có trong DB.
    """
    new_status = body.get("status")
    if new_status not in ("pending", "saved", "scheduled", "ignored"):
        raise HTTPException(status_code=400, detail="status không hợp lệ")

    db = SessionLocal()
    try:
        sug = db.query(ContentSuggestion).filter(
            ContentSuggestion.suggestion_id == suggestion_id
        ).first()

        if sug:
            sug.status = new_status
            sug.updated_at = datetime.utcnow()
        else:
            # Tạo bản ghi tối giản để lưu trạng thái
            title = body.get("title", suggestion_id)
            sug = ContentSuggestion(
                suggestion_id=suggestion_id,
                title=title[:200] if title else suggestion_id,
                type=body.get("type", "guide"),
                platform=body.get("platform", ""),
                priority=body.get("priority", "medium"),
                status=new_status,
                combined_score=int(body.get("combined_score", 0)),
                chatbot_count=int(body.get("chatbot_count", 0)),
                chatbot_topic=body.get("chatbot_topic", ""),
                review_count=int(body.get("review_count", 0)),
                review_neg_pct=int(body.get("review_neg_pct", 0)),
                sample_questions=json.dumps(body.get("sample_questions", []), ensure_ascii=False),
                sample_reviews=json.dumps(body.get("sample_reviews", []), ensure_ascii=False),
                angle=body.get("angle", ""),
                estimated_impact=body.get("estimated_impact", ""),
                estimated_production=body.get("estimated_production", ""),
                source=body.get("source", "frontend")
            )
            db.add(sug)

        db.commit()
        return {"status": "success", "suggestion_id": suggestion_id, "new_status": new_status}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.get("/api/customers")
async def list_customers():
    """
    Liệt kê tất cả khách hàng có tin nhắn trong DB, kèm thông tin
    hồ sơ cơ bản. Dùng để populate Chat Inbox ở frontend.
    """
    db = SessionLocal()
    try:
        from sqlalchemy import func, desc as sqldesc

        # Subquery: timestamp lớn nhất mỗi khách → xác định tin nhắn cuối
        subq = (
            db.query(
                DB_ChatMessage.customer_id,
                func.max(DB_ChatMessage.timestamp).label("max_ts"),
            )
            .group_by(DB_ChatMessage.customer_id)
            .subquery()
        )

        rows = (
            db.query(DB_ChatMessage, CustomerProfile)
            .join(
                subq,
                (DB_ChatMessage.customer_id == subq.c.customer_id)
                & (DB_ChatMessage.timestamp == subq.c.max_ts),
            )
            .outerjoin(
                CustomerProfile,
                DB_ChatMessage.customer_id == CustomerProfile.customer_id,
            )
            .order_by(sqldesc(subq.c.max_ts))
            .all()
        )

        customers = []
        for msg, profile in rows:
            customers.append(
                {
                    "customer_id":       msg.customer_id,
                    "last_message":      (msg.content or "")[:80],
                    "last_role":         msg.role,
                    "last_timestamp":    msg.timestamp.isoformat() if msg.timestamp else None,
                    "churn_probability": profile.churn_probability if profile else 0.1,
                    "emotion_index":     profile.emotion_index if profile else 0.5,
                    "customer_segment":  profile.customer_segment if profile else "new",
                    "total_orders":      profile.total_orders if profile else 0,
                    "total_spent":       float(profile.total_spent or 0) if profile else 0.0,
                }
            )
        return {"status": "success", "customers": customers}
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════════════════════════
# CONTENT AGENT ENDPOINTS
# Thay thế luồng crawl URL cũ bằng form nhập product + USP + custom instructions.
# Luồng mới: frontend gửi product_id + USP focus → AI tạo script có cấu trúc cố định.
#
# Cách kích hoạt Content Agent:
#   A) THỦ CÔNG: User chọn sản phẩm trên UI và nhấn "Tạo script"
#   B) TỰ ĐỘNG từ Strategy Agent: CoordinationTask target_agent="Content" được tạo
#      khi strategy đề xuất content_update_suggestion → frontend poll /api/content-suggestions
#   C) TỰ ĐỘNG từ Crisis Center: CrisisPlan kích hoạt action category="marketing"
#      → gọi POST /api/content-agent/generate-script với trigger_source="crisis_signal"
#   D) TỰ ĐỘNG từ Daily Summary: chat_signal_count hoặc review_neg_pct cao
#      → tạo CoordinationTask "Content" → (B) ở trên
# ═══════════════════════════════════════════════════════════════════════════════

def _load_catalog_with_usp() -> dict:
    """Load product catalog kèm USP từ data/catalog/product_catalog.json."""
    catalog_path = os.path.join(os.path.dirname(__file__), "../data/catalog/product_catalog.json")
    with open(catalog_path, encoding="utf-8") as f:
        return json.load(f)

def _duration_for_type(content_type: str) -> tuple[int, str]:
    """Trả về (giây, mô tả) cho content_type."""
    mapping = {
        "tiktok_15s": (15, "15 giây"),
        "tiktok_30s": (30, "30 giây"),
        "tiktok_60s": (60, "60 giây"),
        "reels_30s":  (30, "30 giây"),
        "reels_60s":  (60, "60 giây"),
        "youtube_short": (60, "60 giây"),
        "shopee_video":  (30, "30 giây"),
        "facebook_post": (0,  "Bài đăng văn bản + ảnh"),
        "caption_instagram": (0, "Caption Instagram"),
    }
    return mapping.get(content_type, (30, "30 giây"))


@app.get("/api/content-agent/products")
async def get_content_agent_products():
    """
    [Content Agent] Trả về danh sách sản phẩm kèm USP từ catalog.
    Frontend dùng để render dropdown chọn sản phẩm (thay thế input URL cũ).
    """
    try:
        catalog = _load_catalog_with_usp()
        products = [
            {
                "product_id":   p["product_id"],
                "name":         p["name"],
                "short_name":   p.get("short_name", p["name"]),
                "category":     p.get("category", ""),
                "brand":        p.get("brand", ""),
                "price":        p.get("price", 0),
                "description":  p.get("description_short", ""),  # optional shortcut
                "usp":          p.get("usp", []),
                "status":       p.get("status", "active"),
            }
            for p in catalog.get("products", [])
            if p.get("status") == "active"
        ]
        return {"total": len(products), "products": products}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/content-agent/intel")
async def analyze_product_intel(req: ContentScriptRequest):
    """
    [Content Agent — Step 2] Phân tích USP và chân dung khách hàng trước khi tạo script.
    Thay thế bước crawl URL cũ — dữ liệu đến trực tiếp từ catalog + input người dùng.

    Input: ContentScriptRequest (product_id, product_name, product_description, usp_focus, ...)
    Output: intel object (positioning, tone, audience personas, ranked USPs)

    Kích hoạt: Frontend gọi khi người dùng nhấn "Phân tích" sau khi chọn sản phẩm.
    """
    try:
        usp_text = "\n".join(f"• {u}" for u in req.usp_focus) if req.usp_focus else "(Dùng toàn bộ USP trong catalog)"

        # Tra thêm USP từ catalog nếu usp_focus rỗng
        if not req.usp_focus:
            try:
                catalog = _load_catalog_with_usp()
                for p in catalog.get("products", []):
                    if p["product_id"] == req.product_id:
                        usp_text = "\n".join(f"• {u}" for u in p.get("usp", []))
                        break
            except Exception:
                pass

        _, duration_label = _duration_for_type(req.content_type)
        prompt = CONTENT_INTEL_PROMPT.format(
            product_name=req.product_name,
            product_description=req.product_description,
            usp_text=usp_text,
            product_price=f"{req.product_description[:20]}...",  # fallback
            target_audience=req.target_audience or "Phụ nữ 18–35 tuổi, yêu thích làm đẹp",
        )

        response = await client.aio.models.generate_content(
            model="gemini-flash-latest",
            contents=prompt,
        )
        raw = response.text.strip()
        clean = raw.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        intel = json.loads(clean)
        return {"status": "ok", "intel": intel}
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=502, detail=f"AI trả về JSON không hợp lệ: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/content-agent/generate-script")
async def generate_content_script(req: ContentScriptRequest):
    """
    [Content Agent — Step 3/4] Tạo video/content script có cấu trúc cố định cho sản phẩm.

    ★ ĐÂY LÀ ENDPOINT CHÍNH của Content Agent — thay thế hoàn toàn luồng crawl URL cũ.

    Input (ContentScriptRequest):
      - product_id, product_name, product_description: thông tin sản phẩm
      - usp_focus: list USP muốn nhấn mạnh (chọn từ catalog, không cần crawl)
      - content_type: tiktok_30s | reels_30s | shopee_video | facebook_post | ...
      - target_audience: chân dung khách hàng mục tiêu
      - custom_instructions: hướng dẫn tuỳ chỉnh thêm
      - brand_tone: tông giọng thương hiệu
      - trigger_source: "manual" | "content_task" | "crisis_signal" | "strategy_agent"

    Output (fixed structure):
      - 3 phiên bản script: emotional / informational / humor
      - Mỗi phiên bản gồm: hook, scenes (voiceover + caption + visual_note), cta, hashtags, caption_post
      - filming_tips: gợi ý quay phim cho từng phong cách

    Cách kích hoạt tự động:
      - Strategy Agent: tạo CoordinationTask target_agent="Content" → frontend gọi endpoint này
      - Crisis Center: action category="marketing" → backend tự gọi endpoint này
      - Daily Summary: content_signal_count cao → tạo task → (như trên)
    """
    db = SessionLocal()
    try:
        # 1. Lấy USP từ catalog nếu usp_focus rỗng
        usp_list = req.usp_focus
        catalog_price = ""
        if not usp_list or req.product_description == "":
            try:
                catalog = _load_catalog_with_usp()
                for p in catalog.get("products", []):
                    if p["product_id"] == req.product_id:
                        if not usp_list:
                            usp_list = p.get("usp", [])
                        if not catalog_price:
                            catalog_price = f"{p.get('price', 0):,.0f}đ"
                        break
            except Exception:
                pass

        usp_focus_text = "\n".join(f"• {u}" for u in usp_list) if usp_list else "(Không có USP cụ thể — AI sẽ tự phân tích từ mô tả)"
        duration_sec, duration_label = _duration_for_type(req.content_type)

        # 2. Gọi AI generate script
        prompt = CONTENT_SCRIPT_PROMPT.format(
            product_name=req.product_name,
            product_description=req.product_description,
            product_price=catalog_price or "Xem mô tả sản phẩm",
            usp_focus_text=usp_focus_text,
            content_type=req.content_type,
            duration_target=f"{duration_label} ({duration_sec}s)" if duration_sec else duration_label,
            brand_tone=req.brand_tone,
            target_audience=req.target_audience or "Phụ nữ 18–35 tuổi, yêu thích làm đẹp",
            custom_instructions=req.custom_instructions or "Không có yêu cầu đặc biệt",
        )

        response = await client.aio.models.generate_content(
            model="gemini-flash-latest",
            contents=prompt,
        )
        raw = response.text.strip()
        clean = raw.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        script_data = json.loads(clean)

        # 3. Đánh dấu CoordinationTask đã hoàn thành nếu kích hoạt từ task
        if req.source_task_id:
            task = db.query(CoordinationTask).filter(CoordinationTask.id == req.source_task_id).first()
            if task:
                task.status = "done"
                db.commit()

        # 4. Tạo CoordinationTask ghi nhận content đã được tạo (cho audit trail)
        if req.trigger_source != "manual":
            db.add(CoordinationTask(
                target_agent="Content",
                product_id=req.product_id,
                instruction=f"[SCRIPT GENERATED] {req.content_type} cho {req.product_name} — trigger: {req.trigger_source}",
                status="done",
            ))
            db.commit()

        return {
            "status": "ok",
            "product_id":     req.product_id,
            "product_name":   req.product_name,
            "content_type":   req.content_type,
            "trigger_source": req.trigger_source,
            "usp_used":       usp_list,
            "scripts":        script_data.get("scripts", []),
            "duration_seconds": script_data.get("duration_seconds", duration_sec),
        }

    except json.JSONDecodeError as e:
        raise HTTPException(status_code=502, detail=f"AI trả về JSON không hợp lệ: {e}")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.post("/api/content-agent/trigger-from-task/{task_id}")
async def trigger_content_from_task(task_id: int):
    """
    [Content Agent — Kích hoạt tự động từ CoordinationTask]
    Đọc CoordinationTask target_agent="Content", resolve product_id,
    lấy USP từ catalog và gọi generate-script.

    Dùng để: frontend Content page có nút "Generate Script" kế bên mỗi content task.
    Cũng có thể gọi từ Strategy Agent sau khi tạo task.
    """
    db = SessionLocal()
    try:
        task = db.query(CoordinationTask).filter(
            CoordinationTask.id == task_id,
            CoordinationTask.target_agent == "Content",
        ).first()
        if not task:
            raise HTTPException(status_code=404, detail=f"Không tìm thấy Content task #{task_id}")

        # Lấy thông tin sản phẩm từ catalog
        product_name = PRODUCT_NAMES.get(task.product_id, task.product_id)
        usp_list = []
        description = ""
        try:
            catalog = _load_catalog_with_usp()
            for p in catalog.get("products", []):
                if p["product_id"] == task.product_id:
                    usp_list = p.get("usp", [])
                    description = p.get("name", "")
                    break
        except Exception:
            pass

        req = ContentScriptRequest(
            product_id=task.product_id,
            product_name=product_name,
            product_description=description or task.instruction,
            usp_focus=usp_list,
            content_type="tiktok_30s",  # default — có thể override qua query param
            trigger_source="content_task",
            source_task_id=task_id,
        )

        # Delegate sang endpoint chính
        result = await generate_content_script(req)
        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


# ── DEPRECATED: /api/v1/content-agent/analyze ────────────────────────────────
# Endpoint crawl URL cũ — đã bị thay thế bởi /api/content-agent/intel
# Giữ lại để backward compatibility, trả về lỗi 410 Gone với hướng dẫn migrate.
@app.post("/api/v1/content-agent/analyze")
async def deprecated_crawl_analyze(body: dict):
    """
    [DEPRECATED] Endpoint crawl URL sản phẩm đã bị ngưng hoạt động.
    Thay bằng: POST /api/content-agent/intel với ContentScriptRequest.
    """
    return {
        "error": "deprecated",
        "message": (
            "Tính năng crawl URL sản phẩm đã bị thay thế. "
            "Vui lòng dùng POST /api/content-agent/intel với thông tin sản phẩm trực tiếp. "
            "Xem docs tại /docs#/Content Agent"
        ),
        "migrate_to": "POST /api/content-agent/generate-script",
        "status_code": 410,
    }

@app.post("/api/v1/content-agent/script/generate")
async def deprecated_script_generate(body: dict):
    """[DEPRECATED] Thay bằng POST /api/content-agent/generate-script"""
    return await deprecated_crawl_analyze(body)


@app.post("/system/reset-all")
async def reset_all_data():
    db = SessionLocal()
    try:
        # 1. Xóa toàn bộ SQL (tất cả bảng có thể reset)
        db.query(DB_ChatMessage).delete()
        db.query(ChatLog).delete()
        db.query(CoordinationTask).delete()
        db.query(ReviewLog).delete()
        db.query(ContentSuggestion).delete()
        db.query(CustomerProfile).delete()
        db.query(StrategyProposalLog).delete()
        db.query(LearnedQAEntry).delete()   # Xóa kiến thức học được — đồng bộ với ChromaDB reset bên dưới
        db.query(CrisisAction).delete()    # Xóa actions trước (FK-like dependency trên plan_id)
        db.query(CrisisPlan).delete()
        db.commit()

        # 2. Xóa và tạo lại các Collections trong Vector DB.
        #    QUAN TRỌNG: Phải cập nhật lại module globals sau khi delete để services.py
        #    luôn nhận đúng collection mới, tránh lỗi "Collection đã bị xóa".
        #    strategy_learnings_db cũng được reset để lịch sử phê duyệt đồng bộ với SQL.
        for col_name in ["policy_db", "product_db", "resolved_qa_db", "strategy_learnings_db"]:
            try:
                _cfg.chroma_client.delete_collection(col_name)
            except Exception:
                pass

        _cfg.policy_col      = _cfg.chroma_client.get_or_create_collection(name="policy_db",              embedding_function=_cfg.default_ef)
        _cfg.product_col     = _cfg.chroma_client.get_or_create_collection(name="product_db",             embedding_function=_cfg.default_ef)
        _cfg.resolved_qa_col = _cfg.chroma_client.get_or_create_collection(name="resolved_qa_db",         embedding_function=_cfg.default_ef)
        _cfg.strategy_col    = _cfg.chroma_client.get_or_create_collection(name="strategy_learnings_db",  embedding_function=_cfg.default_ef)

        # 3. Nạp lại toàn bộ dữ liệu nền từ data/mock/
        seed_vector_db(_cfg.policy_col, _cfg.product_col, _cfg.resolved_qa_col)
        seed_sql_db(db)
        seed_content_suggestions(db)
        seed_customer_profiles(db)
        seed_crisis_demo(db)   # Seed tín hiệu khủng hoảng mẫu cho Crisis Center

        return {"status": "success", "message": "Hệ thống đã được reset và nạp lại toàn bộ dữ liệu nền thành công."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.post("/system/seed-crisis-demo")
async def seed_crisis_demo_endpoint():
    """
    Chèn dữ liệu khủng hoảng mẫu (6 review tiêu cực + 2 RiskManager tasks + 3 chat logs)
    cho sản phẩm GIAO FARA thực tế — KHÔNG xóa dữ liệu hiện có.
    Dùng để test Crisis Center mà không cần reset toàn bộ hệ thống.
    """
    db = SessionLocal()
    try:
        seed_crisis_demo(db)
        return {
            "status": "success",
            "message": "Đã chèn dữ liệu crisis demo: 6 review tiêu cực (P011/P002/P003), 2 RiskManager tasks, 3 chat log rủi ro."
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
