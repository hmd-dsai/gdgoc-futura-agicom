from datetime import datetime
import json
import hashlib
import os
import re
from fastapi import FastAPI, HTTPException, Query, Depends, Security
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import APIKeyHeader
from google.genai import types

# Nhập các thành phần từ file khác
from config import client
from models import (
    ProposalApproval, ProductRequest,
    StrategyProposal, ShopProfile, ChatSessionInput, ChatMessage, ReviewData,
    CrisisPlanRequest, ActionStatusUpdate, ContentScriptRequest, ScriptImproveRequest
)
from prompts import (
    STRATEGY_SYSTEM_PROMPT, REVIEW_LEARNING_PROMPT, REVIEW_AUTO_REPLY_PROMPT, CRISIS_PLAN_PROMPT,
    CONTENT_SCRIPT_PROMPT, CONTENT_INTEL_PROMPT, TEXT_POST_PROMPT,
    SCRIPT_IMPROVE_VIDEO_PROMPT, SCRIPT_IMPROVE_TEXT_PROMPT
)
from services import (
    analyze_strategy_slow_track,
    learn_from_human_service,
    chat_with_history_service,
    maybe_summarize_chat,
)
from database import SessionLocal, ChatLog, CoordinationTask, ChatMessage as DB_ChatMessage, save_message, init_db, DailySummaryArchive, ReviewLog, ReviewAutoReply, ContentSuggestion, CustomerProfile, get_or_create_customer_profile, StrategyProposalLog, LearnedQAEntry, CrisisPlan, CrisisAction, ChatSummary
import config as _cfg
from seed_demo import (
    seed_vector_db, seed_sql_db, seed_content_suggestions, seed_customer_profiles,
    seed_crisis_demo, seed_strategy_proposals, seed_review_auto_replies,
    seed_crisis_plans, seed_learned_qa, seed_chat_summaries, seed_daily_archives,
)

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

if not os.getenv("ADMIN_API_KEY"):
    print("[startup] WARNING: ADMIN_API_KEY is not set — all protected endpoints will return 500. Set this env var on Render.")

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

# ---------------------------------------------------------------------------
# API Key authentication
# Protect admin/write endpoints with X-API-Key header.
# Set ADMIN_API_KEY env var on Render (or .env locally).
# If unset the dependency raises 500 so misconfigured deploys fail loudly.
# ---------------------------------------------------------------------------
_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

async def require_api_key(api_key: str = Security(_api_key_header)):
    expected = os.getenv("ADMIN_API_KEY")
    if not expected:
        raise HTTPException(status_code=500, detail="Server misconfiguration: ADMIN_API_KEY env var is not set.")
    if not api_key or api_key != expected:
        raise HTTPException(status_code=401, detail="Unauthorized: invalid or missing X-API-Key header.")

@app.get("/")
async def root():
    """Health check endpoint cho Render"""
    return {"status": "ok", "message": "Agicom Backend đang chạy!", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}

@app.post("/act-and-learn", dependencies=[Depends(require_api_key)])
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

@app.post("/slow-track-strategy", dependencies=[Depends(require_api_key)])
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
                http_options={'timeout': 60000},
            ),
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

@app.post("/learn-feedback", dependencies=[Depends(require_api_key)])
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

@app.post("/export-daily-summary", dependencies=[Depends(require_api_key)])
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


@app.post("/learn-from-review", dependencies=[Depends(require_api_key)])
async def process_and_learn_review(review: ReviewData):
    import asyncio
    try:
        # ── BƯỚC 1: Chuẩn bị CẢ 2 prompt trước khi gọi LLM ──────────────────
        user_prompt = f"Sản phẩm ID: {review.product_id}\nSố sao: {review.rating}/5\nNội dung: '{review.review_text}'"
        reply_prompt = REVIEW_AUTO_REPLY_PROMPT.format(
            customer_name=review.customer_name,
            product_id=review.product_id,
            rating=review.rating,
            review_text=review.review_text,
        )

        # ── BƯỚC 2: Gọi 2 LLM SONG SONG — giảm 50% thời gian chờ ─────────────
        analysis_response, reply_response = await asyncio.gather(
            client.aio.models.generate_content(
                model="gemini-flash-latest",
                contents=[REVIEW_LEARNING_PROMPT, user_prompt],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                ),
            ),
            client.aio.models.generate_content(
                model="gemini-flash-latest",
                contents=[reply_prompt],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                ),
            ),
        )

        # Parse kết quả phân tích sentiment
        raw_analysis_text = analysis_response.text or ""
        clean_text = raw_analysis_text.replace("```json", "").replace("```", "").strip()
        if not clean_text:
            print(f"[review] Cảnh báo: LLM trả về rỗng cho analysis (finish_reason={getattr(analysis_response, 'candidates', [{}])[0].get('finish_reason', '?') if analysis_response.candidates else '?'}). Dùng fallback.")
            clean_text = '{"sentiment": "Bình thường", "key_issue": "Không rõ", "sentiment_tag": "Cần xem lại", "action_needed": false, "qa_knowledge": "None"}'
        try:
            analysis = json.loads(clean_text)
        except json.JSONDecodeError as parse_err:
            print(f"[review] Lỗi parse JSON analysis: {parse_err} — raw: {clean_text[:200]!r}")
            analysis = {"sentiment": "Bình thường", "key_issue": "Không rõ", "sentiment_tag": "Cần xem lại", "action_needed": False, "qa_knowledge": "None"}

        # Parse kết quả auto-reply (có thể lỗi riêng, không làm hỏng luồng chính)
        auto_reply_data: dict = {"public_reply": None, "inbox_message": None}
        try:
            clean_reply = reply_response.text.replace("```json", "").replace("```", "").strip()
            auto_reply_data = json.loads(clean_reply)
        except Exception as parse_reply_err:
            print(f"[auto-reply] Lỗi parse JSON phản hồi: {parse_reply_err}")

        # ── BƯỚC 3: Lưu bài học vào Vector DB ────────────────────────────────
        _qa_doc_id  = None
        _qa_doc_txt = None
        if analysis.get("qa_knowledge") and analysis["qa_knowledge"] != "None":
            _qa_doc_id  = f"rev_{hashlib.md5(review.review_text.encode()).hexdigest()}"
            _qa_doc_txt = f"[Kinh nghiệm từ Review {review.rating} sao]: {analysis['qa_knowledge']}"
            _cfg.resolved_qa_col.upsert(
                documents=[_qa_doc_txt],
                ids=[_qa_doc_id]
            )

        # ── BƯỚC 4: Lưu toàn bộ vào SQL trong 1 session duy nhất ─────────────
        db = SessionLocal()
        try:
            # 4a. Backup Q&A vào SQL (replay khi vector DB bị xóa)
            if _qa_doc_id and _qa_doc_txt:
                db.merge(LearnedQAEntry(doc_id=_qa_doc_id, document=_qa_doc_txt, source="review"))

            # 4b. Lưu ReviewLog với đầy đủ sentiment fields
            new_review_log = ReviewLog(
                product_id=review.product_id,
                rating=review.rating,
                review_text=review.review_text,
                customer_name=review.customer_name,
                ai_insight=analysis.get('qa_knowledge', "Không có insight nổi bật"),
                sentiment=analysis.get('sentiment'),
                key_issue=analysis.get('key_issue'),
                sentiment_tag=analysis.get('sentiment_tag'),
            )
            db.add(new_review_log)
            db.flush()  # lấy new_review_log.id ngay

            # 4c. Lưu ReviewAutoReply
            if auto_reply_data.get("public_reply"):
                reply_type = "positive" if review.rating >= 4 else "negative"
                new_auto_reply = ReviewAutoReply(
                    review_log_id=new_review_log.id,
                    customer_name=review.customer_name,
                    product_id=review.product_id,
                    rating=review.rating,
                    public_reply=auto_reply_data.get("public_reply", ""),
                    inbox_message=auto_reply_data.get("inbox_message"),
                    reply_type=reply_type,
                    status="pending",
                )
                db.add(new_auto_reply)

            # 4d. Với review tiêu cực: tạo ChatMessage trong inbox
            if review.rating <= 3 and auto_reply_data.get("inbox_message"):
                get_or_create_customer_profile(db, review.customer_name)
                db.add(DB_ChatMessage(
                    customer_id=review.customer_name,
                    role="user",
                    content=f"[Review {review.rating}★] {review.review_text}",
                    is_safe=None,
                    confidence_score=None,
                    sentiment="tiêu cực",
                ))
                db.add(DB_ChatMessage(
                    customer_id=review.customer_name,
                    role="assistant",
                    content=auto_reply_data["inbox_message"],
                    is_safe=False,
                    confidence_score=0.88,
                    sentiment="tiêu cực",
                ))

            # 4e. Tạo CoordinationTask nếu review xấu (với deduplication)
            if analysis.get("action_needed") or review.rating <= 3:
                key_issue_val = analysis.get('key_issue', '')
                target_agent = "RiskManager"
                if "giá" in review.review_text.lower():
                    target_agent = "Pricing"
                elif "màu" in review.review_text.lower() and "chất lượng" not in review.review_text.lower():
                    target_agent = "Content"

                issue_type = _classify_issue(key_issue_val, review.review_text)
                existing_task = db.query(CoordinationTask).filter(
                    CoordinationTask.product_id  == review.product_id,
                    CoordinationTask.target_agent == target_agent,
                    CoordinationTask.issue_type   == issue_type,
                    CoordinationTask.status       == "pending"
                ).first()

                if existing_task:
                    existing_task.signal_count = (existing_task.signal_count or 1) + 1
                    count = existing_task.signal_count
                    base_instruction = re.sub(r'^\[\d+ tín hiệu\] ', '', existing_task.instruction)
                    existing_task.instruction = f"[{count} tín hiệu] {base_instruction}"
                else:
                    db.add(CoordinationTask(
                        target_agent  = target_agent,
                        product_id    = review.product_id,
                        instruction   = (
                            f"CẢNH BÁO REVIEW {review.rating} SAO: {key_issue_val}. "
                            f"Nội dung: '{review.review_text[:200]}'"
                        ),
                        status        = "pending",
                        signal_count  = 1,
                        issue_type    = issue_type,
                    ))

            db.commit()
            print(f"[review] Đã xử lý review của {review.customer_name} (rating={review.rating})")
        except Exception as db_e:
            db.rollback()
            print(f"[review] Lỗi Database: {db_e}")
        finally:
            db.close()

        return {
            "status": "success",
            "message": "Đã lưu Review & Cập nhật trí nhớ AI",
            "auto_reply": {
                "public_reply": auto_reply_data.get("public_reply"),
                "inbox_message": auto_reply_data.get("inbox_message"),
                "reply_type": "positive" if review.rating >= 4 else "negative",
                "inbox_queued": review.rating <= 3 and bool(auto_reply_data.get("inbox_message")),
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/review-replies")
async def get_review_replies(status: str = "pending", limit: int = 30):
    """Lấy danh sách phản hồi tự động đã sinh cho review, lọc theo status."""
    db = SessionLocal()
    try:
        query = db.query(ReviewAutoReply)
        if status != "all":
            query = query.filter(ReviewAutoReply.status == status)
        replies = query.order_by(ReviewAutoReply.created_at.desc()).limit(limit).all()
        return {
            "status": "success",
            "total": len(replies),
            "data": [
                {
                    "id": r.id,
                    "review_log_id": r.review_log_id,
                    "customer_name": r.customer_name,
                    "product_id": r.product_id,
                    "rating": r.rating,
                    "public_reply": r.public_reply,
                    "inbox_message": r.inbox_message,
                    "reply_type": r.reply_type,
                    "status": r.status,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
                for r in replies
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.patch("/api/review-replies/{reply_id}/approve", dependencies=[Depends(require_api_key)])
async def approve_review_reply(reply_id: int):
    """Duyệt phản hồi review — đổi status từ pending → approved."""
    db = SessionLocal()
    try:
        reply = db.query(ReviewAutoReply).filter(ReviewAutoReply.id == reply_id).first()
        if not reply:
            raise HTTPException(status_code=404, detail="Không tìm thấy phản hồi")
        reply.status = "approved"
        db.commit()
        return {"status": "success", "message": f"Đã duyệt phản hồi #{reply_id}"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.post("/api/review-replies/generate/{review_id}", dependencies=[Depends(require_api_key)])
async def generate_reply_for_review(review_id: int):
    """
    Sinh phản hồi AI cho một ReviewLog đã tồn tại trong DB.
    Nếu đã có ReviewAutoReply thì trả về cái cũ, không gọi LLM lại.
    """
    db = SessionLocal()
    try:
        review = db.query(ReviewLog).filter(ReviewLog.id == review_id).first()
        if not review:
            raise HTTPException(status_code=404, detail=f"Không tìm thấy review #{review_id}")

        # Trả về reply đã có nếu tồn tại
        existing = db.query(ReviewAutoReply).filter(
            ReviewAutoReply.review_log_id == review_id
        ).first()
        if existing:
            return {
                "status": "existing",
                "review_log_id": review_id,
                "auto_reply": {
                    "id": existing.id,
                    "public_reply": existing.public_reply,
                    "inbox_message": existing.inbox_message,
                    "reply_type": existing.reply_type,
                    "status": existing.status,
                },
            }

        # Gọi LLM để tạo phản hồi mới
        reply_prompt = REVIEW_AUTO_REPLY_PROMPT.format(
            customer_name=review.customer_name,
            product_id=review.product_id,
            rating=review.rating,
            review_text=review.review_text,
        )
        response = await client.aio.models.generate_content(
            model="gemini-flash-latest",
            contents=[reply_prompt],
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        auto_reply_data: dict = {"public_reply": None, "inbox_message": None}
        try:
            clean = response.text.replace("```json", "").replace("```", "").strip()
            auto_reply_data = json.loads(clean)
        except Exception:
            pass

        if not auto_reply_data.get("public_reply"):
            raise HTTPException(status_code=500, detail="LLM không trả về phản hồi hợp lệ")

        reply_type = "positive" if review.rating >= 4 else "negative"
        new_reply = ReviewAutoReply(
            review_log_id=review_id,
            customer_name=review.customer_name,
            product_id=review.product_id,
            rating=review.rating,
            public_reply=auto_reply_data["public_reply"],
            inbox_message=auto_reply_data.get("inbox_message"),
            reply_type=reply_type,
            status="pending",
        )
        db.add(new_reply)
        db.commit()
        db.refresh(new_reply)

        return {
            "status": "generated",
            "review_log_id": review_id,
            "auto_reply": {
                "id": new_reply.id,
                "public_reply": new_reply.public_reply,
                "inbox_message": new_reply.inbox_message,
                "reply_type": new_reply.reply_type,
                "status": new_reply.status,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.get("/api/reviews")
async def get_all_reviews(product_id: str = None, limit: int = 20):
    """
    API dùng để kéo dữ liệu Review từ Database ra cho Frontend hiển thị.
    Nếu truyền product_id thì chỉ lấy review của sản phẩm đó.
    Trả về thêm product_name (tra từ PRODUCT_NAMES catalog) để frontend hiển thị trên card.
    """
    db = SessionLocal()
    try:
        query = db.query(ReviewLog)
        if product_id:
            query = query.filter(ReviewLog.product_id == product_id)
        reviews = query.order_by(ReviewLog.timestamp.desc()).limit(limit).all()

        def _serialize(r):
            return {
                "id": r.id,
                "product_id": r.product_id,
                "product_name": PRODUCT_NAMES.get(r.product_id, r.product_id),
                "rating": r.rating,
                "review_text": r.review_text,
                "customer_name": r.customer_name,
                "ai_insight": r.ai_insight,
                "sentiment": r.sentiment,
                "key_issue": r.key_issue,
                "sentiment_tag": r.sentiment_tag,
                "timestamp": r.timestamp.isoformat() if r.timestamp else None,
            }

        return {
            "total_fetched": len(reviews),
            "data": [_serialize(r) for r in reviews],
        }
    finally:
        db.close()

@app.get("/api/reviews/sentiment-stats")
async def get_sentiment_stats(product_id: str = None):
    """
    Trả về thống kê cảm xúc thực từ ReviewLog:
    - Tỉ lệ % Tích cực / Bình thường / Tiêu cực
    - Top tags theo từng nhóm cảm xúc
    - Tổng số review đã có sentiment data
    """
    from sqlalchemy import func
    db = SessionLocal()
    try:
        query = db.query(ReviewLog).filter(ReviewLog.sentiment.isnot(None))
        if product_id:
            query = query.filter(ReviewLog.product_id == product_id)

        reviews = query.all()
        total = len(reviews)

        # avg_rating uses ALL reviews for the product, not just those with sentiment
        all_query = db.query(ReviewLog)
        if product_id:
            all_query = all_query.filter(ReviewLog.product_id == product_id)
        all_reviews = all_query.all()
        review_count = len(all_reviews)
        avg_rating = round(sum(r.rating for r in all_reviews) / review_count, 1) if review_count else 0

        if total == 0:
            return {
                "total": 0,
                "avg_rating": avg_rating,
                "review_count": review_count,
                "positive_pct": 0,
                "neutral_pct": 0,
                "negative_pct": 0,
                "tags_positive": [],
                "tags_neutral": [],
                "tags_negative": [],
            }

        counts = {"Tích cực": 0, "Bình thường": 0, "Tiêu cực": 0}
        tags = {"Tích cực": {}, "Bình thường": {}, "Tiêu cực": {}}

        for r in reviews:
            s = r.sentiment or "Bình thường"
            if s not in counts:
                s = "Bình thường"
            counts[s] += 1
            if r.sentiment_tag:
                tags[s][r.sentiment_tag] = tags[s].get(r.sentiment_tag, 0) + 1

        def top_tags(tag_dict, n=5):
            return [{"tag": k, "count": v} for k, v in sorted(tag_dict.items(), key=lambda x: -x[1])[:n]]

        return {
            "total": total,
            "avg_rating": avg_rating,
            "review_count": review_count,
            "positive_pct": round(counts["Tích cực"] / total * 100, 1),
            "neutral_pct": round(counts["Bình thường"] / total * 100, 1),
            "negative_pct": round(counts["Tiêu cực"] / total * 100, 1),
            "tags_positive": top_tags(tags["Tích cực"]),
            "tags_neutral": top_tags(tags["Bình thường"]),
            "tags_negative": top_tags(tags["Tiêu cực"]),
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
            config=types.GenerateContentConfig(
                response_mime_type="application/json",

            ),
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


@app.patch("/api/crisis-action/{action_id}", dependencies=[Depends(require_api_key)])
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

        # 4. Kích hoạt tóm tắt hội thoại nền (rolling, mỗi 10 tin nhắn)
        import asyncio
        asyncio.create_task(maybe_summarize_chat(data.customer_id))

        # 5. Trả về cho Frontend
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

@app.get("/api/chat-messages/{customer_id}", dependencies=[Depends(require_api_key)])
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


@app.delete("/chat/{customer_id}", dependencies=[Depends(require_api_key)])
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


@app.get("/api/customer-profile/{customer_id}", dependencies=[Depends(require_api_key)])
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


@app.patch("/api/customer-profile/{customer_id}", dependencies=[Depends(require_api_key)])
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

    CENTRALIZED: Mọi suggestion đều được lưu vào bảng ContentSuggestion trước khi trả về.
    CoordinationTask 'Content' pending được upsert vào bảng với đầy đủ metadata
    (bao gồm source_product_id) để frontend có thể prefill đúng khi nhấn 'Tạo script'.
    """
    db = SessionLocal()
    try:
        # ── Helpers (dùng cho cả upsert và serialize) ───────────────────────
        def _detect_type(text):
            """Return a content_type code matching CONTENT_TYPES in models.py."""
            t = (text or "").lower()
            if "15s" in t or "15 giây" in t:
                return "tiktok_15s"
            if "60s" in t or "60 giây" in t or "dài" in t:
                return "tiktok_60s"
            if any(k in t for k in ["reels", "instagram"]):
                return "reels_30s"
            if any(k in t for k in ["youtube", "yt short"]):
                return "youtube_short"
            if any(k in t for k in ["shopee video", "shopee"]):
                return "shopee_video"
            if any(k in t for k in ["facebook", "fb post", "bài đăng"]):
                return "facebook_post"
            if any(k in t for k in ["caption"]):
                return "caption_instagram"
            if any(k in t for k in ["video", "quay", "tiktok"]):
                return "tiktok_30s"
            return "facebook_post"

        def _platform_for(t):
            return {
                "tiktok_15s": "TikTok", "tiktok_30s": "TikTok", "tiktok_60s": "TikTok",
                "reels_30s": "Instagram", "reels_60s": "Instagram",
                "youtube_short": "YouTube",
                "shopee_video": "Shopee",
                "facebook_post": "Facebook",
                "caption_instagram": "Instagram",
            }.get(t, "TikTok")

        # ── 1. Lấy tín hiệu phụ trợ (reviews + chat) ───────────────────────
        neg_reviews = db.query(ReviewLog).filter(
            ReviewLog.rating <= 3
        ).order_by(ReviewLog.timestamp.desc()).limit(30).all()

        recent_insights = db.query(ChatLog).filter(
            ChatLog.is_archived == False,
            ChatLog.insight.isnot(None)
        ).order_by(ChatLog.timestamp.desc()).limit(20).all()

        neg_by_product: dict = {}
        for r in neg_reviews:
            pid = r.product_id or "unknown"
            neg_by_product.setdefault(pid, []).append(r)

        # ── 2. Upsert CoordinationTask "Content" pending vào DB ─────────────
        # Lấy danh sách suggestion_id đã tồn tại (dạng task-{id}) để tránh duplicate
        content_tasks = db.query(CoordinationTask).filter(
            CoordinationTask.target_agent == "Content",
            CoordinationTask.status == "pending"
        ).order_by(CoordinationTask.id.desc()).all()

        existing_task_sug_ids = set(
            s.suggestion_id for s in
            db.query(ContentSuggestion.suggestion_id).filter(
                ContentSuggestion.suggestion_id.like("task-%")
            ).all()
        )

        upserted = 0
        for task in content_tasks:
            task_sug_id = f"task-{task.id}"
            if task_sug_id in existing_task_sug_ids:
                continue  # đã có trong DB — không upsert lại

            related_neg = neg_by_product.get(task.product_id or "", [])
            sug_type    = _detect_type(task.instruction)
            platform    = _platform_for(sug_type)
            score       = min(99, 65 + len(related_neg) * 8 + (10 if related_neg else 0))
            priority    = "high" if len(related_neg) >= 1 or score >= 80 else "medium"

            sample_qs = json.dumps(
                [log.customer_q[:60] for log in recent_insights[:2]],
                ensure_ascii=False
            )
            sample_rs = json.dumps(
                [(r.review_text or "")[:60] for r in related_neg[:2]],
                ensure_ascii=False
            )

            new_sug = ContentSuggestion(
                suggestion_id     = task_sug_id,
                title             = (task.instruction or "")[:200],
                type              = sug_type,
                platform          = platform,
                priority          = priority,
                status            = "pending",
                source            = "content_task",
                source_product_id = task.product_id or "",      # ← key field cho prefill
                combined_score    = score,
                chatbot_count     = len(recent_insights),
                chatbot_topic     = "Phát hiện từ báo cáo hàng ngày",
                review_count      = len(related_neg),
                review_neg_pct    = 100 if related_neg else 0,
                sample_questions  = sample_qs,
                sample_reviews    = sample_rs,
                angle             = task.instruction or "",
                estimated_impact  = "Giảm câu hỏi lặp lại ~30–50%",
                estimated_production = {"tiktok_15s": "1-2 ngày", "tiktok_30s": "1-2 ngày",
                                        "facebook_post": "2-4 giờ"}.get(sug_type, "1-2 ngày"),
            )
            db.add(new_sug)
            upserted += 1

        if upserted:
            db.commit()
            print(f"[content-suggestions] Upserted {upserted} task-sourced suggestions into DB.")

        # ── 3. Lấy toàn bộ ContentSuggestion từ DB (single source of truth) ─
        all_sugs = db.query(ContentSuggestion).filter(
            ContentSuggestion.status != "ignored"
        ).order_by(ContentSuggestion.combined_score.desc()).all()

        suggestions = []
        for s in all_sugs:
            sq, sr = [], []
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
                "source_product_id": s.source_product_id or "",   # ← prefill product dropdown
                "has_script": bool(s.script_json),                 # ← show "Xem script" button
                "_fromBackend": True,
                "_source": s.source or "db"
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
                "saved_in_db": len(all_sugs),
                "upserted_this_call": upserted,
            }
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()



@app.patch("/api/content-suggestions/{suggestion_id}/status", dependencies=[Depends(require_api_key)])
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


@app.get("/api/customers", dependencies=[Depends(require_api_key)])
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
            config=types.GenerateContentConfig(),
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

        # Phân biệt loại nội dung: video script vs text post
        TEXT_POST_TYPES = {"facebook_post", "caption_instagram"}
        is_text_post = req.content_type in TEXT_POST_TYPES

        # 2. Gọi AI — dùng prompt phù hợp với loại content
        if is_text_post:
            prompt = TEXT_POST_PROMPT.format(
                product_name=req.product_name,
                product_description=req.product_description,
                product_price=catalog_price or "Xem mô tả sản phẩm",
                usp_focus_text=usp_focus_text,
                content_type=req.content_type,
                brand_tone=req.brand_tone,
                target_audience=req.target_audience or "Phụ nữ 18–35 tuổi, yêu thích làm đẹp",
                custom_instructions=req.custom_instructions or "Không có yêu cầu đặc biệt",
            )
        else:
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

        # Text post cần ít token hơn video script (không có timeline chi tiết)
        response = await client.aio.models.generate_content(
            model="gemini-flash-latest",
            contents=prompt,
            config=types.GenerateContentConfig(),
        )
        raw = response.text.strip()
        clean = raw.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        script_data = json.loads(clean)

        # Normalise: text post prompt returns a list directly; video prompt returns {"scripts": [...]}
        if is_text_post:
            scripts_list = script_data if isinstance(script_data, list) else script_data.get("scripts", [])
        else:
            scripts_list = script_data.get("scripts", []) if isinstance(script_data, dict) else script_data

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
            "status":           "ok",
            "product_id":       req.product_id,
            "product_name":     req.product_name,
            "content_type":     req.content_type,
            "is_text_post":     is_text_post,
            "trigger_source":   req.trigger_source,
            "usp_used":         usp_list,
            "scripts":          scripts_list,
            "duration_seconds": duration_sec,
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


# ─── Xem kịch bản đã lưu của đề xuất ────────────────────────────────────────

@app.get("/api/content-suggestions/{suggestion_id}/script")
async def get_suggestion_script(suggestion_id: str):
    """
    Lấy kịch bản đã lưu của ContentSuggestion — dùng khi user nhấn "Xem script".
    Trả về danh sách scripts đã lưu + metadata để frontend restore _ca.scripts.
    """
    db = SessionLocal()
    try:
        sug = db.query(ContentSuggestion).filter(
            ContentSuggestion.suggestion_id == suggestion_id
        ).first()
        if not sug:
            raise HTTPException(status_code=404, detail=f"Không tìm thấy đề xuất {suggestion_id}")
        if not sug.script_json:
            raise HTTPException(status_code=404, detail="Đề xuất này chưa có kịch bản được lưu")

        scripts = json.loads(sug.script_json)
        # Detect is_text_post từ NỘI DUNG script thực tế — KHÔNG dùng sug.type vì có thể là giá trị cũ.
        # Text-post script có field "body"; video script có "timeline" hoặc "scenes".
        first = scripts[0] if scripts else {}
        is_text_post = (
            "body" in first
            and "timeline" not in first
            and "scenes" not in first
        )

        # content_type: ưu tiên từ sug.type nếu là code mới, fallback tiktok_30s
        KNOWN_CONTENT_TYPES = {
            "tiktok_15s","tiktok_30s","tiktok_60s","reels_30s","reels_60s",
            "youtube_short","shopee_video","facebook_post","caption_instagram",
        }
        content_type = sug.type if sug.type in KNOWN_CONTENT_TYPES else "tiktok_30s"

        return {
            "status":           "ok",
            "suggestion_id":    suggestion_id,
            "product_id":       sug.source_product_id or "",
            "product_name":     sug.title or "",
            "content_type":     content_type,
            "is_text_post":     is_text_post,
            "scripts":          scripts,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


# ─── Task #28: Cải thiện kịch bản ────────────────────────────────────────────

@app.post("/api/content-agent/script/improve")
async def improve_content_script(req: ScriptImproveRequest):
    """
    [Content Agent] Cải thiện một phiên bản kịch bản cụ thể dựa trên feedback người dùng.
    Thay thế endpoint /api/v1/content-agent/script/feedback (cũ, không tồn tại).

    Input (ScriptImproveRequest):
      - product_id, product_name, content_type: metadata sản phẩm/content
      - variant: phiên bản cần cải thiện ("emotional" | "informational" | "humor")
      - current_script: object kịch bản hiện tại của variant đó
      - feedback: yêu cầu cải thiện từ người dùng (text tự do)
      - is_text_post: True nếu là bài đăng văn bản (Facebook/Instagram)

    Output:
      - script: object kịch bản đã cải thiện (cùng cấu trúc với current_script)
    """
    try:
        current_script_json = json.dumps(req.current_script, ensure_ascii=False, indent=2)

        if req.is_text_post:
            prompt = SCRIPT_IMPROVE_TEXT_PROMPT.format(
                variant=req.variant,
                current_script_json=current_script_json,
                feedback=req.feedback,
                product_name=req.product_name,
                content_type=req.content_type,
            )
        else:
            prompt = SCRIPT_IMPROVE_VIDEO_PROMPT.format(
                variant=req.variant,
                current_script_json=current_script_json,
                feedback=req.feedback,
                product_name=req.product_name,
                content_type=req.content_type,
            )

        response = await client.aio.models.generate_content(
            model="gemini-flash-latest",
            contents=prompt,
            config=types.GenerateContentConfig(),
        )
        raw = response.text.strip()
        clean = raw.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        improved_script = json.loads(clean)

        return {
            "status":       "ok",
            "variant":      req.variant,
            "is_text_post": req.is_text_post,
            "script":       improved_script,
        }
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=502, detail=f"AI trả về JSON không hợp lệ: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Task #29: Lưu kịch bản vào ContentSuggestion ────────────────────────────

@app.patch("/api/content-suggestions/{suggestion_id}/save-script", dependencies=[Depends(require_api_key)])
async def save_script_to_suggestion(suggestion_id: str, body: dict):
    """
    Lưu JSON kịch bản đã tạo vào ContentSuggestion tương ứng.
    Body: { "script_json": "<JSON string of scripts array>" }
    """
    db = SessionLocal()
    try:
        sug = db.query(ContentSuggestion).filter(
            ContentSuggestion.suggestion_id == suggestion_id
        ).first()
        if not sug:
            raise HTTPException(status_code=404, detail=f"Không tìm thấy đề xuất {suggestion_id}")

        sug.script_json = body.get("script_json", "[]")
        sug.updated_at = datetime.utcnow()
        db.commit()
        return {"status": "ok", "suggestion_id": suggestion_id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


# ─── Task #30: Tạo ContentSuggestion mới từ kịch bản thủ công ────────────────

@app.post("/api/content-suggestions", dependencies=[Depends(require_api_key)])
async def create_content_suggestion(body: dict):
    """
    Tạo ContentSuggestion mới từ kịch bản đã tạo thủ công (nút "Thêm vào Đề xuất AI").
    Body: product_id, product_name, content_type, scripts (list), is_text_post (bool)
    """
    import time
    db = SessionLocal()
    try:
        ts = int(time.time())
        product_id   = body.get("product_id",   "unknown")
        product_name = body.get("product_name", "Sản phẩm")
        content_type = body.get("content_type", "tiktok_30s")
        scripts      = body.get("scripts",      [])

        suggestion_id = f"manual-{product_id}-{ts}"

        # Lưu content_type trực tiếp làm sug_type (không dùng "video"/"blog_faq" nữa)
        platform_map = {
            "tiktok_15s": "TikTok",   "tiktok_30s": "TikTok",   "tiktok_60s": "TikTok",
            "reels_30s":  "Instagram", "reels_60s":  "Instagram",
            "youtube_short": "YouTube",
            "shopee_video":  "Shopee",
            "facebook_post": "Facebook",
            "caption_instagram": "Instagram",
        }
        sug_type = content_type  # store as-is so get_suggestion_script can use KNOWN_CONTENT_TYPES check
        platform = platform_map.get(content_type, "Social Media")

        ct_label = {
            "tiktok_15s": "TikTok 15s", "tiktok_30s": "TikTok 30s", "tiktok_60s": "TikTok 60s",
            "reels_30s": "Reels 30s",   "reels_60s": "Reels 60s",   "youtube_short": "YouTube Short",
            "shopee_video": "Shopee Video",
            "facebook_post": "Facebook Post", "caption_instagram": "Caption Instagram",
        }
        title = f"{ct_label.get(content_type, content_type)} — {product_name}"

        new_sug = ContentSuggestion(
            suggestion_id     = suggestion_id,
            title             = title,
            type              = sug_type,
            platform          = platform,
            priority          = "medium",
            status            = "saved",           # Đã có kịch bản → trạng thái "đã lưu"
            source            = "manual_script",
            source_product_id = product_id,
            script_json       = json.dumps(scripts, ensure_ascii=False),
        )
        db.add(new_sug)
        db.commit()
        db.refresh(new_sug)

        return {
            "status":        "ok",
            "suggestion_id": suggestion_id,
            "title":         title,
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.post("/system/reset-all", dependencies=[Depends(require_api_key)])
async def reset_all_data():
    db = SessionLocal()
    try:
        # 1. Xóa toàn bộ SQL (tất cả bảng có thể reset)
        db.query(DB_ChatMessage).delete()
        db.query(ChatLog).delete()
        db.query(CoordinationTask).delete()
        db.query(ReviewAutoReply).delete()
        db.query(ReviewLog).delete()
        db.query(ContentSuggestion).delete()
        db.query(CustomerProfile).delete()
        db.query(StrategyProposalLog).delete()
        db.query(LearnedQAEntry).delete()
        db.query(CrisisAction).delete()
        db.query(CrisisPlan).delete()
        db.query(ChatSummary).delete()
        db.query(DailySummaryArchive).delete()
        db.commit()

        # 2. Xóa và tạo lại các Collections trong Vector DB.
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
        seed_crisis_demo(db)
        seed_strategy_proposals(db)
        seed_review_auto_replies(db)
        seed_crisis_plans(db)
        seed_learned_qa(db)
        seed_chat_summaries(db)
        seed_daily_archives(db)

        return {"status": "success", "message": "Hệ thống đã được reset và nạp lại toàn bộ dữ liệu nền thành công."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.post("/system/seed-crisis-demo", dependencies=[Depends(require_api_key)])
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
