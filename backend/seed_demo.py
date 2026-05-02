import datetime
import json
import os
from database import SessionLocal, ChatLog, CoordinationTask, ChatMessage, ReviewLog, ContentSuggestion, CustomerProfile, init_db
import config as _cfg

# ── Path resolution ───────────────────────────────────────────────────────────
# seed_demo.py lives at: gdgoc-futura-agicom/backend/seed_demo.py
# Mock data lives at:    gdgoc-futura-agicom/data/mock/
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
    print("[1/5] Đang dọn dẹp dữ liệu cũ...")
    # Xóa SQL
    db.query(ChatMessage).delete()
    db.query(ChatLog).delete()
    db.query(CoordinationTask).delete()
    db.query(ReviewLog).delete()
    db.query(ContentSuggestion).delete()
    db.commit()

    # Xóa Vector DB và recreate
    for col_name in ["policy_db", "product_db", "resolved_qa_db"]:
        try:
            _cfg.chroma_client.delete_collection(col_name)
        except Exception:
            pass

    _cfg.policy_col      = _cfg.chroma_client.get_or_create_collection(name="policy_db",      embedding_function=_cfg.default_ef)
    _cfg.product_col     = _cfg.chroma_client.get_or_create_collection(name="product_db",     embedding_function=_cfg.default_ef)
    _cfg.resolved_qa_col = _cfg.chroma_client.get_or_create_collection(name="resolved_qa_db", embedding_function=_cfg.default_ef)
    return _cfg.policy_col, _cfg.product_col, _cfg.resolved_qa_col


def seed_vector_db(policy_col, product_col, resolved_qa_col):
    print("[2/5] Đang nạp kiến thức vào Vector DB (RAG)...")

    # 1. Products — description_for_rag + usp field, deduplicated by product_id.
    # Multiple variants share the same product_id (e.g. P001 has V00101 and V00104).
    # ChromaDB requires unique IDs, so we only insert one RAG doc per logical product.
    # USPs (Unique Selling Points) are appended to the RAG document so the AI can
    # reference them when generating content scripts, chatbot replies, and ad copy.
    products_data = _load("products.json")
    seen_pids, rag_docs, rag_ids = set(), [], []
    for p in products_data["products"]:
        pid = p["catalog_info"]["product_id"]
        if pid not in seen_pids:
            seen_pids.add(pid)
            rag_text = p["description_for_rag"]
            # Ghép USP vào RAG document để AI truy xuất được khi generate content/script
            usps = p.get("usp", [])
            if usps:
                usp_lines = "\n".join(f"• {u}" for u in usps)
                rag_text += f"\n\nĐIỂM BÁN HÀNG NỔI BẬT (USP — dùng cho script quảng cáo & content):\n{usp_lines}"
            rag_docs.append(rag_text)
            rag_ids.append(pid)
    product_col.add(documents=rag_docs, ids=rag_ids)
    print(f"  → {len(rag_ids)} sản phẩm nạp vào product_db ({len(products_data['products'])} variants, {len(rag_ids)} unique product IDs, USP embedded)")

    # 2. Policies
    policies_data = _load("policies.json")
    policy_col.add(
        documents=[p["text"] for p in policies_data["policies"]],
        ids=[p["policy_id"] for p in policies_data["policies"]]
    )
    print(f"  → {len(policies_data['policies'])} chính sách nạp vào policy_db")

    # 3. Resolved Q&A (learned knowledge)
    qa_data = _load("resolved_qa.json")
    resolved_qa_col.add(
        documents=[f"Q: {q['question']} A: {q['answer']}" for q in qa_data["qa_pairs"]],
        ids=[q["qa_id"] for q in qa_data["qa_pairs"]]
    )
    print(f"  → {len(qa_data['qa_pairs'])} Q&A pairs nạp vào resolved_qa_db")


def seed_sql_db(db):
    print("[3/5] Đang nạp lịch sử giao dịch và hội thoại (SQL)...")
    now = datetime.datetime.utcnow()

    # 1. Chat Logs (Daily Summary & Sensor Insight)
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

    # 2. Review Logs (Crisis detection & content engine)
    # review_logs.json is grouped by product (teammate's format):
    #   { "review_logs": [ { "product_id": ..., "reviews_list": [ {...}, ... ] } ] }
    # Flatten into individual ReviewLog rows, mapping the richer ai_analysis
    # fields onto the existing ReviewLog.ai_insight column.
    review_logs_data = _load("review_logs.json")
    reviews = []
    for product in review_logs_data["review_logs"]:
        pid = product["product_id"]
        for item in product.get("reviews_list", []):
            analysis  = item.get("ai_analysis", {})
            sentiment = analysis.get("sentiment", "")
            aspects   = analysis.get("key_aspects", [])
            ai_insight = f"{sentiment}: {', '.join(aspects)}" if aspects else sentiment
            trigger    = analysis.get("service_trigger_reason", "")
            if analysis.get("requires_customer_service") and trigger:
                ai_insight += f" | CS: {trigger}"
            reviews.append(ReviewLog(
                product_id=pid,
                rating=item["rating"],
                review_text=item["review_text"],
                customer_name=item.get("customer", {}).get("username_masked", "Ẩn danh"),
                ai_insight=ai_insight,
            ))
    db.add_all(reviews)
    print(f"  → {len(reviews)} reviews")

    # 3. Chat Messages (Per-customer conversation history for RAG context)
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

    # 4. Coordination Tasks (AI-to-human task handoffs)
    tasks_data = _load("coordination_tasks.json")
    tasks = [
        CoordinationTask(
            target_agent=item["target_agent"],
            product_id=item["product_id"],
            instruction=item["instruction"],
            status=item["status"]
        )
        for item in tasks_data["tasks"]
    ]
    db.add_all(tasks)
    print(f"  → {len(tasks)} coordination tasks")

    db.commit()


def seed_content_suggestions(db):
    print("[4/5] Đang nạp đề xuất content mẫu...")
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
            created_at=now
        )
        for item in data["content_suggestions"]
    ]
    db.add_all(suggestions)
    db.commit()
    print(f"  → {len(suggestions)} content suggestions")


def seed_customer_profiles(db):
    print("[5/5] Đang seed hồ sơ khách hàng (CustomerProfile)...")
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
    Đọc từ data/mock/crisis_signals.json (cùng thư mục với các file mock khác).

    Tín hiệu được chèn:
      • ReviewLog tiêu cực (rating ≤ 3) cho các sản phẩm GIAO FARA
      • CoordinationTask target_agent="RiskManager"
      • ChatLog có risk keywords trong insight
    """
    print("[+] Seeding crisis demo signals từ crisis_signals.json...")
    now = datetime.datetime.utcnow()
    data = _load("crisis_signals.json")

    # ── 1. Review tiêu cực ───────────────────────────────────────────────
    crisis_reviews = [
        ReviewLog(
            product_id=item["product_id"],
            rating=item["rating"],
            review_text=item["review_text"],
            customer_name=item.get("customer_name", "Ẩn danh"),
            ai_insight=item.get("ai_insight", ""),
            timestamp=now - datetime.timedelta(hours=item.get("hours_ago", 24)),
        )
        for item in data.get("review_logs", [])
    ]
    db.add_all(crisis_reviews)

    # ── 2. Coordination Tasks gửi cho RiskManager ────────────────────────
    crisis_tasks = [
        CoordinationTask(
            target_agent=item["target_agent"],
            product_id=item["product_id"],
            instruction=item["instruction"],
            status=item.get("status", "pending"),
            created_at=now - datetime.timedelta(hours=item.get("hours_ago", 12)),
        )
        for item in data.get("coordination_tasks", [])
    ]
    db.add_all(crisis_tasks)

    # ── 3. Chat Logs có tín hiệu rủi ro ──────────────────────────────────
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

        # Load counts for summary
        products_count = len(_load("products.json")["products"])
        policies_count = len(_load("policies.json")["policies"])
        qa_count       = len(_load("resolved_qa.json")["qa_pairs"])

        print("\n[SUCCESS] Hệ thống đã sẵn sàng cho Demo!")
        print(f"- Vector DB: {products_count} Sản phẩm, {policies_count} Chính sách, {qa_count} QA pairs.")
        print("- SQL DB: Chat Logs, Reviews, Chat Messages, Tasks, Content Suggestions, Customer Profiles.")
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
