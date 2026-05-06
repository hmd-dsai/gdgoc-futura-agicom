import datetime
import json
import os
from database import (
    SessionLocal, ChatLog, CoordinationTask, ChatMessage, ReviewLog,
    ContentSuggestion, CustomerProfile, StrategyProposalLog, ReviewAutoReply,
    CrisisPlan, CrisisAction, LearnedQAEntry, ChatSummary, DailySummaryArchive,
    init_db
)
import config as _cfg

# ── Path resolution ───────────────────────────────────────────────────────────
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
_MOCK_DIR = os.path.normpath(os.path.join(_BACKEND_DIR, "../data/mock"))


def _load(filename: str) -> dict:
    """Load a JSON file from the mock data directory."""
    path = os.path.join(_MOCK_DIR, filename)
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"Mock data file not found: {path}\n"
            f"Make sure data/mock/{filename} exists relative to the repo root."
        )
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def clear_data(db):
    print("[1/9] Đang dọn dẹp dữ liệu cũ...")
    db.query(ChatMessage).delete()
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
    
    # Reset SQLite AUTOINCREMENT sequence so IDs start fresh from 1
    if "sqlite" in str(db.get_bind().url):
        try:
            from sqlalchemy import text
            db.execute(text("DELETE FROM sqlite_sequence"))
        except Exception:
            pass

    db.commit()

    for col_name in ["policy_db", "product_db", "resolved_qa_db", "strategy_learnings_db"]:
        try:
            _cfg.chroma_client.delete_collection(col_name)
        except Exception:
            pass

    _cfg.policy_col      = _cfg.chroma_client.get_or_create_collection(name="policy_db",      embedding_function=_cfg.default_ef)
    _cfg.product_col     = _cfg.chroma_client.get_or_create_collection(name="product_db",     embedding_function=_cfg.default_ef)
    _cfg.resolved_qa_col = _cfg.chroma_client.get_or_create_collection(name="resolved_qa_db", embedding_function=_cfg.default_ef)
    _cfg.strategy_col    = _cfg.chroma_client.get_or_create_collection(name="strategy_learnings_db", embedding_function=_cfg.default_ef)
    return _cfg.policy_col, _cfg.product_col, _cfg.resolved_qa_col


def seed_vector_db(policy_col, product_col, resolved_qa_col):
    print("[2/9] Đang nạp kiến thức vào Vector DB (RAG)...")

    products_data = _load("products.json")
    seen_pids, rag_docs, rag_ids = set(), [], []
    for p in products_data["products"]:
        pid = p["catalog_info"]["product_id"]
        if pid not in seen_pids:
            seen_pids.add(pid)
            rag_text = p["description_for_rag"]
            usps = p.get("usp", [])
            if usps:
                usp_lines = "\n".join(f"• {u}" for u in usps)
                rag_text += f"\n\nĐIỂM BÁN HÀNG NỔI BẬT (USP — dùng cho script quảng cáo & content):\n{usp_lines}"
            rag_docs.append(rag_text)
            rag_ids.append(pid)
    product_col.add(documents=rag_docs, ids=rag_ids)
    print(f"  → {len(rag_ids)} sản phẩm nạp vào product_db ({len(products_data['products'])} variants, {len(rag_ids)} unique product IDs, USP embedded)")

    policies_data = _load("policies.json")
    policy_col.add(
        documents=[p["text"] for p in policies_data["policies"]],
        ids=[p["policy_id"] for p in policies_data["policies"]]
    )
    print(f"  → {len(policies_data['policies'])} chính sách nạp vào policy_db")

    qa_data = _load("resolved_qa.json")
    resolved_qa_col.add(
        documents=[f"Q: {q['question']} A: {q['answer']}" for q in qa_data["qa_pairs"]],
        ids=[q["qa_id"] for q in qa_data["qa_pairs"]]
    )
    print(f"  → {len(qa_data['qa_pairs'])} Q&A pairs nạp vào resolved_qa_db")


def seed_sql_db(db):
    print("[3/9] Đang nạp lịch sử giao dịch và hội thoại (SQL)...")
    now = datetime.datetime.utcnow()

    # 1. Chat Logs
    chat_logs_data = _load("chat_logs.json")
    logs = [
        ChatLog(
            customer_q=item["customer_q"],
            ai_a=item["ai_a"],
            insight=item["insight"],
            timestamp=now - datetime.timedelta(hours=item["hours_ago"])
        )
        for item in chat_logs_data["chat_logs"]
    ]
    db.add_all(logs)
    print(f"  → {len(logs)} chat logs")

    # 2. Review Logs (with sentiment columns)
    review_logs_data = _load("review_logs.json")
    reviews = []
    for product in review_logs_data["review_logs"]:
        pid = product["product_id"]
        for item in product.get("reviews_list", []):
            analysis  = item.get("ai_analysis", {})
            sentiment_raw = analysis.get("sentiment", "")
            aspects   = analysis.get("key_aspects", [])
            ai_insight = f"{sentiment_raw}: {', '.join(aspects)}" if aspects else sentiment_raw
            trigger    = analysis.get("service_trigger_reason", "")
            if analysis.get("requires_customer_service") and trigger:
                ai_insight += f" | CS: {trigger}"
            reviews.append(ReviewLog(
                product_id=pid,
                rating=item["rating"],
                review_text=item["review_text"],
                customer_name=item.get("customer", {}).get("username_masked", "Ẩn danh"),
                ai_insight=ai_insight,
                sentiment=item.get("sentiment"),
                key_issue=item.get("key_issue"),
                sentiment_tag=item.get("sentiment_tag"),
            ))
    db.add_all(reviews)
    print(f"  → {len(reviews)} reviews (with sentiment data)")

    # 3. Chat Messages
    chat_msgs_data = _load("chat_messages.json")
    total_msgs = 0
    for customer in chat_msgs_data["customers"]:
        for msg in customer["messages"]:
            db.add(ChatMessage(
                customer_id=customer["customer_id"],
                role=msg["role"],
                content=msg["content"]
            ))
            total_msgs += 1
    print(f"  → {total_msgs} chat messages ({len(chat_msgs_data['customers'])} khách)")

    # 4. Coordination Tasks (with signal_count, issue_type)
    tasks_data = _load("coordination_tasks.json")
    tasks = [
        CoordinationTask(
            target_agent=item["target_agent"],
            product_id=item["product_id"],
            instruction=item["instruction"],
            status=item["status"],
            signal_count=item.get("signal_count", 1),
            issue_type=item.get("issue_type"),
        )
        for item in tasks_data["tasks"]
    ]
    db.add_all(tasks)
    print(f"  → {len(tasks)} coordination tasks")

    db.commit()


def seed_content_suggestions(db):
    print("[4/9] Đang nạp đề xuất content mẫu...")
    now = datetime.datetime.utcnow()

    data = _load("content_suggestions.json")
    suggestions = [
        ContentSuggestion(
            suggestion_id=item["suggestion_id"],
            title=item["title"],
            type=item["type"],
            platform=item["platform"],
            priority=item["priority"],
            status=item["status"],
            combined_score=item["combined_score"],
            chatbot_count=item["chatbot_count"],
            chatbot_topic=item["chatbot_topic"],
            review_count=item["review_count"],
            review_neg_pct=item["review_neg_pct"],
            sample_questions=json.dumps(item["sample_questions"], ensure_ascii=False),
            sample_reviews=json.dumps(item["sample_reviews"], ensure_ascii=False),
            estimated_impact=item["estimated_impact"],
            estimated_production=item["estimated_production"],
            angle=item["angle"],
            source=item["source"],
            source_product_id=item["source_product_id"],
            script_json=json.dumps(item["script_json"], ensure_ascii=False) if item.get("script_json") else None,
            created_at=now
        )
        for item in data["content_suggestions"]
    ]
    db.add_all(suggestions)
    db.commit()
    print(f"  → {len(suggestions)} content suggestions")


def seed_customer_profiles(db):
    print("[5/9] Đang seed hồ sơ khách hàng (CustomerProfile)...")
    now = datetime.datetime.utcnow()

    db.query(CustomerProfile).delete()
    db.commit()

    data = _load("customer_profiles.json")
    profiles = [
        CustomerProfile(
            customer_id=item["customer_id"],
            churn_probability=item["churn_probability"],
            emotion_index=item["emotion_index"],
            customer_segment=item["customer_segment"],
            total_orders=item["total_orders"],
            total_spent=item["total_spent"],
            last_purchase_date=item["last_purchase_date"],
            purchase_history=json.dumps(item["purchase_history"], ensure_ascii=False),
            notes=item["notes"],
            created_at=now,
            updated_at=now,
        )
        for item in data["customer_profiles"]
    ]
    db.add_all(profiles)
    db.commit()
    print(f"  → {len(profiles)} customer profiles")


def seed_crisis_demo(db):
    """
    Chèn dữ liệu tín hiệu khủng hoảng mẫu vào DB — KHÔNG xóa dữ liệu hiện có.
    Đọc từ data/mock/crisis_signals.json.
    """
    print("[6/9] Seeding crisis demo signals từ crisis_signals.json...")
    now = datetime.datetime.utcnow()
    data = _load("crisis_signals.json")

    crisis_reviews = [
        ReviewLog(
            product_id=item["product_id"],
            rating=item["rating"],
            review_text=item["review_text"],
            customer_name=item.get("customer_name", "Ẩn danh"),
            ai_insight=item.get("ai_insight", ""),
            sentiment="Tiêu cực",
            key_issue=item.get("ai_insight", "").split(":")[0].strip() if item.get("ai_insight") else None,
            sentiment_tag=item.get("ai_insight", "").split(":")[0].replace("Tiêu cực", "").strip() or None,
            timestamp=now - datetime.timedelta(hours=item.get("hours_ago", 24)),
        )
        for item in data.get("review_logs", [])
    ]
    db.add_all(crisis_reviews)

    crisis_tasks = [
        CoordinationTask(
            target_agent=item["target_agent"],
            product_id=item["product_id"],
            instruction=item["instruction"],
            status=item.get("status", "pending"),
            signal_count=item.get("signal_count", 1),
            issue_type=item.get("issue_type", "quality"),
            created_at=now - datetime.timedelta(hours=item.get("hours_ago", 12)),
        )
        for item in data.get("coordination_tasks", [])
    ]
    db.add_all(crisis_tasks)

    crisis_chat_logs = [
        ChatLog(
            customer_q=item["customer_q"],
            ai_a=item["ai_a"],
            insight=item["insight"],
            timestamp=now - datetime.timedelta(hours=item.get("hours_ago", 24)),
            is_archived=False,
        )
        for item in data.get("chat_logs", [])
    ]
    db.add_all(crisis_chat_logs)

    db.commit()
    print(f"  → {len(crisis_reviews)} review tiêu cực, {len(crisis_tasks)} RiskManager tasks, {len(crisis_chat_logs)} chat logs")


def seed_strategy_proposals(db):
    """Seed strategy proposal logs from mock data."""
    print("[7/9] Đang seed đề xuất chiến lược (StrategyProposalLog)...")
    now = datetime.datetime.utcnow()

    data = _load("strategy_proposals.json")
    proposals = [
        StrategyProposalLog(
            proposal_id=item["proposal_id"],
            product_id=item["product_id"],
            product_name=item["product_name"],
            proposed_price=item["proposed_price"],
            expected_margin_percent=item["expected_margin_percent"],
            pricing_reasoning=item["pricing_reasoning"],
            content_update_suggestion=item["content_update_suggestion"],
            urgency_level=item["urgency_level"],
            action_required=item["action_required"],
            status=item["status"],
            created_at=now - datetime.timedelta(hours=item.get("hours_ago", 24)),
        )
        for item in data["strategy_proposals"]
    ]
    db.add_all(proposals)
    db.commit()
    print(f"  → {len(proposals)} strategy proposals")


def seed_review_auto_replies(db):
    """Seed review auto-reply drafts from mock data.

    review_log_id in the JSON is a 1-based positional index into the seeded
    ReviewLog rows (ordered by id ascending). We resolve it to the real DB id
    here so references are always correct regardless of auto-increment state.
    """
    print("[8/9] Đang seed phản hồi review tự động (ReviewAutoReply)...")
    now = datetime.datetime.utcnow()

    # Build positional index: position 1 → first ReviewLog.id inserted, etc.
    seeded_reviews = db.query(ReviewLog).order_by(ReviewLog.id.asc()).all()
    id_map = {i + 1: r.id for i, r in enumerate(seeded_reviews)}

    data = _load("review_auto_replies.json")
    replies = []
    for item in data["review_auto_replies"]:
        pos = item["review_log_id"]
        real_id = id_map.get(pos, pos)  # fallback to raw value if out of range
        replies.append(ReviewAutoReply(
            review_log_id=real_id,
            customer_name=item["customer_name"],
            product_id=item["product_id"],
            rating=item["rating"],
            public_reply=item["public_reply"],
            inbox_message=item.get("inbox_message"),
            reply_type=item["reply_type"],
            status=item["status"],
            created_at=now - datetime.timedelta(hours=item.get("hours_ago", 12)),
        ))
    db.add_all(replies)
    db.commit()
    print(f"  → {len(replies)} review auto-replies")


def seed_crisis_plans(db):
    """Seed pre-generated crisis plans with actions."""
    print("[+] Đang seed kế hoạch khủng hoảng (CrisisPlan + CrisisAction)...")
    now = datetime.datetime.utcnow()

    data = _load("crisis_plans.json")
    for plan_data in data["crisis_plans"]:
        plan = CrisisPlan(
            plan_id=plan_data["plan_id"],
            product_id=plan_data["product_id"],
            root_cause_summary=plan_data["root_cause_summary"],
            urgency=plan_data["urgency"],
            crisis_snapshot=plan_data["crisis_snapshot"],
            generated_at=now - datetime.timedelta(hours=2),
        )
        db.add(plan)
        db.flush()

        for act_data in plan_data.get("actions", []):
            action = CrisisAction(
                action_id=act_data["action_id"],
                plan_id=plan_data["plan_id"],
                product_id=plan_data["product_id"],
                type=act_data["type"],
                category=act_data["category"],
                title=act_data["title"],
                detail=act_data["detail"],
                draft_message=act_data.get("draft_message"),
                status=act_data["status"],
            )
            db.add(action)

    db.commit()
    total_actions = sum(len(p.get("actions", [])) for p in data["crisis_plans"])
    print(f"  → {len(data['crisis_plans'])} crisis plans, {total_actions} actions")


def seed_learned_qa(db):
    """Seed learned QA entries into SQL + ChromaDB."""
    print("[+] Đang seed kiến thức đã học (LearnedQAEntry)...")

    data = _load("learned_qa_entries.json")
    entries = []
    for item in data["learned_qa_entries"]:
        entries.append(LearnedQAEntry(
            doc_id=item["doc_id"],
            document=item["document"],
            source=item["source"],
        ))
        # Also add to ChromaDB resolved_qa_col
        try:
            _cfg.resolved_qa_col.add(
                documents=[item["document"]],
                ids=[item["doc_id"]]
            )
        except Exception:
            pass

    db.add_all(entries)
    db.commit()
    print(f"  → {len(entries)} learned QA entries (SQL + ChromaDB)")


def seed_chat_summaries(db):
    """Seed chat conversation summaries."""
    print("[+] Đang seed tóm tắt hội thoại (ChatSummary)...")
    now = datetime.datetime.utcnow()

    data = _load("chat_summaries.json")
    summaries = [
        ChatSummary(
            customer_id=item["customer_id"],
            summary_text=item["summary_text"],
            summarized_up_to_id=item["summarized_up_to_id"],
            total_messages_at_update=item["total_messages_at_update"],
            updated_at=now,
        )
        for item in data["chat_summaries"]
    ]
    db.add_all(summaries)
    db.commit()
    print(f"  → {len(summaries)} chat summaries")


def seed_daily_archives(db):
    """Seed daily summary archives for historical reports."""
    print("[+] Đang seed báo cáo lưu trữ (DailySummaryArchive)...")
    now = datetime.datetime.utcnow()

    data = _load("daily_summary_archives.json")
    archives = [
        DailySummaryArchive(
            report_date=datetime.date.fromisoformat(item["report_date"]),
            archived_at=now,
            risk_status=item["risk_status"],
            risk_tasks_json=json.dumps(item["risk_tasks_json"], ensure_ascii=False),
            pricing_tasks_json=json.dumps(item["pricing_tasks_json"], ensure_ascii=False),
            content_tasks_json=json.dumps(item["content_tasks_json"], ensure_ascii=False),
            insights_json=json.dumps(item["insights_json"], ensure_ascii=False),
            total_tasks=item["total_tasks"],
            total_insights=item["total_insights"],
        )
        for item in data["daily_summary_archives"]
    ]
    db.add_all(archives)
    db.commit()
    print(f"  → {len(archives)} daily summary archives")


def main():
    print("=== AGICOM DEMO SEEDER ===")
    print(f"Đọc dữ liệu từ: {_MOCK_DIR}\n")
    init_db()
    db = SessionLocal()

    try:
        p_col, pr_col, qa_col = clear_data(db)
        seed_vector_db(p_col, pr_col, qa_col)
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

        products_count = len(_load("products.json")["products"])
        policies_count = len(_load("policies.json")["policies"])
        qa_count       = len(_load("resolved_qa.json")["qa_pairs"])

        print("\n[SUCCESS] Hệ thống đã sẵn sàng cho Demo!")
        print(f"- Vector DB: {products_count} Sản phẩm, {policies_count} Chính sách, {qa_count} QA pairs.")
        print("- SQL DB: Chat Logs, Reviews, Chat Messages, Tasks, Content Suggestions,")
        print("  Customer Profiles, Strategy Proposals, Review Auto-Replies,")
        print("  Crisis Plans + Actions, Learned QA, Chat Summaries, Daily Archives.")
    except FileNotFoundError as e:
        print(f"\n[ERROR] Không tìm thấy file mock data:\n{e}")
    except Exception as e:
        import traceback
        print(f"\n[ERROR] Lỗi trong quá trình seed: {e}")
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    main()
