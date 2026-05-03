import os
from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Boolean, create_engine, Date, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import datetime

# Cấu hình Database chuyển đổi linh hoạt giữa SQLite và PostgreSQL
# Dùng đường dẫn tuyệt đối dựa trên vị trí file này (backend/) thay vì CWD
# để tránh tạo ra 2 file DB khác nhau khi chạy từ thư mục khác nhau.
_DB_DIR = os.path.dirname(os.path.abspath(__file__))
SQLALCHEMY_DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///" + os.path.join(_DB_DIR, "agicom_system.db")
)

# Fix lỗi "postgres://" vs "postgresql://" của SQLAlchemy khi dùng Render Postgres
if SQLALCHEMY_DATABASE_URL and SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

Base = declarative_base()

# Lưu Log Chat để báo cáo cuối ngày
class ChatLog(Base):
    __tablename__ = "chat_logs"
    id = Column(Integer, primary_key=True, index=True)
    customer_q = Column(Text)
    ai_a = Column(Text)
    insight = Column(String) # Ví dụ: "Khách chê đắt"
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    is_archived = Column(Boolean, default=False) # MỚI THÊM: Đánh dấu để ẩn khỏi báo cáo ngày hôm sau

class ReviewLog(Base):
    __tablename__ = "review_logs"
    id = Column(Integer, primary_key=True, index=True)
    product_id    = Column(String, index=True)
    rating        = Column(Integer)
    review_text   = Column(Text)
    customer_name = Column(String, default="Ẩn danh")
    ai_insight    = Column(String)            # Bài học CSKH rút ra để dạy chatbot
    # ── Trường mới: AI điền sau khi phân tích ──────────────────────────────────
    sentiment     = Column(String, nullable=True)  # "Tích cực" | "Bình thường" | "Tiêu cực"
    key_issue     = Column(String, nullable=True)  # Vấn đề cốt lõi ngắn gọn
    sentiment_tag = Column(String, nullable=True)  # Nhãn ngắn ≤ 4 từ để hiển thị tag UI
    timestamp     = Column(DateTime, default=datetime.datetime.utcnow)

# Lưu các Task mà Agent CSKH giao cho Agent khác
class CoordinationTask(Base):
    __tablename__ = "coordination_tasks"
    id = Column(Integer, primary_key=True, index=True)
    target_agent = Column(String) # "RiskManager", "Pricing", "Content"
    product_id = Column(String)
    instruction = Column(Text)
    status = Column(String, default="pending") # pending, completed, archived
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    # Deduplication fields (thêm từ v1.1)
    signal_count = Column(Integer, default=1)   # Số review đã gộp vào task này
    issue_type   = Column(String, nullable=True) # Category: quality/shipping/price/wrong_item/general

# Bảng lưu trữ báo cáo đã xuất
class DailySummaryArchive(Base):
    __tablename__ = "daily_summary_archive"
    
    id = Column(Integer, primary_key=True, index=True)
    report_date = Column(Date, nullable=False, index=True)
    archived_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    risk_status = Column(String(50))
    risk_tasks_json = Column(Text)
    pricing_tasks_json = Column(Text)
    content_tasks_json = Column(Text)
    insights_json = Column(Text)
    
    total_tasks = Column(Integer, default=0)
    total_insights = Column(Integer, default=0)

# Lưu phản hồi tự động do AI soạn cho từng review
# public_reply: phản hồi công khai ngay trên trang review
# inbox_message: tin nhắn riêng gửi trực tiếp cho khách (chỉ có với review tiêu cực)
# status: pending (chờ duyệt) | approved (đã duyệt) | sent (đã gửi)
class ReviewAutoReply(Base):
    __tablename__ = "review_auto_replies"
    id             = Column(Integer, primary_key=True, index=True)
    review_log_id  = Column(Integer, index=True, nullable=False)
    customer_name  = Column(String, default="Ẩn danh")
    product_id     = Column(String, index=True)
    rating         = Column(Integer)
    public_reply   = Column(Text, nullable=False)
    inbox_message  = Column(Text, nullable=True)    # Chỉ có với review 1-3 sao
    reply_type     = Column(String)                 # 'positive' | 'negative'
    status         = Column(String, default="pending")  # pending | approved | sent
    created_at     = Column(DateTime, default=datetime.datetime.utcnow)

# SQLite cần check_same_thread=False, Postgres thì không cần
if "sqlite" in SQLALCHEMY_DATABASE_URL:
    engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(SQLALCHEMY_DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Thêm vào database.py
class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(String, index=True)
    role = Column(String) # 'user' hoặc 'assistant'
    content = Column(Text)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    # Metadata từ AI evaluation (chỉ có ở tin nhắn assistant)
    is_safe = Column(Boolean, nullable=True)
    confidence_score = Column(Float, nullable=True)
    sentiment = Column(String, nullable=True)

def get_chat_history(db, customer_id: str, limit: int = 6):
    from sqlalchemy import desc
    messages = db.query(ChatMessage)\
        .filter(ChatMessage.customer_id == customer_id)\
        .order_by(desc(ChatMessage.timestamp))\
        .limit(limit)\
        .all()
    return messages[::-1] # Trả về thứ tự cũ -> mới

def save_message(db, customer_id: str, role: str, content: str,
                 is_safe=None, confidence_score=None, sentiment=None):
    new_msg = ChatMessage(
        customer_id=customer_id,
        role=role,
        content=content,
        is_safe=is_safe,
        confidence_score=confidence_score,
        sentiment=sentiment,
    )
    db.add(new_msg)
    db.commit()

# Lưu lịch sử đề xuất chiến lược từ AI (slow-track-strategy).
# /act-and-learn tra cứu theo proposal_id để lấy nội dung đề xuất khi duyệt/từ chối.
class StrategyProposalLog(Base):
    __tablename__ = "strategy_proposal_logs"
    id                        = Column(Integer, primary_key=True, index=True)
    proposal_id               = Column(String, unique=True, index=True)  # VD: PROP-P009-001
    product_id                = Column(String, index=True)
    product_name              = Column(String)
    proposed_price            = Column(Float)
    expected_margin_percent   = Column(Float)
    pricing_reasoning         = Column(Text)
    content_update_suggestion = Column(Text)
    urgency_level             = Column(String)
    action_required           = Column(Boolean, default=True)
    status                    = Column(String, default="pending")  # pending | approved | declined
    feedback                  = Column(Text)   # Lý do từ chối (nếu declined)
    created_at                = Column(DateTime, default=datetime.datetime.utcnow)
    resolved_at               = Column(DateTime, nullable=True)   # Thời điểm duyệt/từ chối


# Bảng lưu trữ đề xuất content đã được xác nhận / đang theo dõi
class ContentSuggestion(Base):
    __tablename__ = "content_suggestions"
    id               = Column(Integer, primary_key=True, index=True)
    suggestion_id    = Column(String, index=True, unique=True)          # vd: cs-001, task-3
    title            = Column(Text)
    type             = Column(String)                                   # video | blog_faq | comparison | guide
    platform         = Column(String)
    priority         = Column(String, default="medium")                 # high | medium
    status           = Column(String, default="pending")               # pending | saved | scheduled | ignored
    combined_score   = Column(Integer, default=0)
    chatbot_count    = Column(Integer, default=0)
    chatbot_topic    = Column(String)
    review_count     = Column(Integer, default=0)
    review_neg_pct   = Column(Integer, default=0)
    sample_questions = Column(Text)                                     # JSON list
    sample_reviews   = Column(Text)                                     # JSON list
    angle            = Column(Text)
    estimated_impact = Column(String)
    estimated_production = Column(String)
    source           = Column(String)                                   # content_task | mock_cluster | daily_summary
    source_product_id = Column(String)
    script_json      = Column(Text, nullable=True)                      # JSON của scripts đã tạo (lưu kịch bản)
    created_at       = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at       = Column(DateTime, default=datetime.datetime.utcnow)


# Hồ sơ khách hàng — truy vấn theo customer_id, ghép vào prompt LLM
class CustomerProfile(Base):
    __tablename__ = "customer_profiles"
    id                  = Column(Integer, primary_key=True, index=True)
    customer_id         = Column(String, unique=True, index=True, nullable=False)

    # ── Chỉ số rủi ro ──
    churn_probability   = Column(Float, default=0.1)   # 0.0 – 1.0 (rời bỏ)
    emotion_index       = Column(Float, default=0.5)   # 0.0 – 1.0 (0=rất tiêu cực, 1=rất tích cực)
    customer_segment    = Column(String, default="new") # new | regular | vip | at_risk

    # ── Lịch sử mua hàng ──
    total_orders        = Column(Integer, default=0)
    total_spent         = Column(Float, default=0.0)    # VND
    last_purchase_date  = Column(String)                # ISO date string
    purchase_history    = Column(Text, default="[]")    # JSON list [{date, item, value, status}]

    # ── Ghi chú thêm ──
    notes               = Column(Text)

    created_at          = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at          = Column(DateTime, default=datetime.datetime.utcnow,
                                  onupdate=datetime.datetime.utcnow)


# ── Crisis Management ───────────────────────────────────────────────────────

# Kế hoạch xử lý khủng hoảng do AI sinh ra, lưu per-product.
# Được tạo khi chủ shop bấm "Generate Plan" hoặc lần đầu vào crisis-center.
# Tái tạo được qua nút "Regenerate".
class CrisisPlan(Base):
    __tablename__ = "crisis_plans"
    id                 = Column(Integer, primary_key=True, index=True)
    plan_id            = Column(String, unique=True, index=True)   # vd: "plan_P011_1746200000"
    product_id         = Column(String, index=True)
    root_cause_summary = Column(Text)
    urgency            = Column(String, default="medium")           # critical | high | medium | low
    crisis_snapshot    = Column(Text)                               # JSON của signals dùng để sinh plan
    generated_at       = Column(DateTime, default=datetime.datetime.utcnow)


# Từng hành động trong kế hoạch khủng hoảng — có thể check-off, trạng thái lưu vào DB.
class CrisisAction(Base):
    __tablename__ = "crisis_actions"
    id            = Column(Integer, primary_key=True, index=True)
    action_id     = Column(String, unique=True, index=True)  # vd: "act_P011_0_1746200000"
    plan_id       = Column(String, index=True)
    product_id    = Column(String, index=True)
    type          = Column(String)           # immediate | mid_term
    category      = Column(String)           # apology | escalate | logistics | quality_check | marketing | monitor
    title         = Column(Text)
    detail        = Column(Text)
    draft_message = Column(Text, nullable=True)
    status        = Column(String, default="pending")   # pending | done | skipped
    updated_at    = Column(DateTime, default=datetime.datetime.utcnow,
                           onupdate=datetime.datetime.utcnow)


# Bản sao lưu SQL cho mọi entry được ghi động vào resolved_qa_db (ChromaDB).
# Mục đích: khi Vector DB bị xóa hoặc Render cold start, hệ thống replay lại
# toàn bộ kiến thức đã học được (từ review và từ chat) vào ChromaDB.
# Source values: "review" (từ /learn-from-review) | "chat" (từ /learn-feedback)
class LearnedQAEntry(Base):
    __tablename__ = "learned_qa_entries"
    id         = Column(Integer, primary_key=True, index=True)
    doc_id     = Column(String, unique=True, index=True)   # ID dùng trong ChromaDB (vd: "rev_abc123")
    document   = Column(Text,   nullable=False)             # Nội dung đầy đủ lưu trong ChromaDB
    source     = Column(String, default="review")           # "review" | "chat"
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


# ── Chat Summary ────────────────────────────────────────────────────────────

# Lưu tóm tắt cuộc hội thoại theo customer_id.
# Được tạo/cập nhật mỗi khi tổng số tin nhắn đạt bội số của 10.
# summarized_up_to_id: id của ChatMessage cuối cùng đã được đưa vào summary.
class ChatSummary(Base):
    __tablename__ = "chat_summaries"
    id                    = Column(Integer, primary_key=True, index=True)
    customer_id           = Column(String, unique=True, index=True, nullable=False)
    summary_text          = Column(Text, nullable=False)
    summarized_up_to_id   = Column(Integer, nullable=False)   # ChatMessage.id cuối cùng đã tóm tắt
    total_messages_at_update = Column(Integer, default=0)
    updated_at            = Column(DateTime, default=datetime.datetime.utcnow,
                                   onupdate=datetime.datetime.utcnow)


def get_chat_summary(db, customer_id: str):
    """Trả về ChatSummary hoặc None nếu chưa có."""
    return db.query(ChatSummary).filter(
        ChatSummary.customer_id == customer_id
    ).first()


def upsert_chat_summary(db, customer_id: str, summary_text: str,
                        last_msg_id: int, total_count: int):
    """Tạo mới hoặc cập nhật bản tóm tắt hội thoại cho customer_id."""
    row = db.query(ChatSummary).filter(
        ChatSummary.customer_id == customer_id
    ).first()
    if row:
        row.summary_text = summary_text
        row.summarized_up_to_id = last_msg_id
        row.total_messages_at_update = total_count
        row.updated_at = datetime.datetime.utcnow()
    else:
        row = ChatSummary(
            customer_id=customer_id,
            summary_text=summary_text,
            summarized_up_to_id=last_msg_id,
            total_messages_at_update=total_count,
        )
        db.add(row)
    db.commit()


def get_or_create_customer_profile(db, customer_id: str) -> "CustomerProfile":
    """Lấy hồ sơ khách; tự tạo mới nếu chưa có."""
    profile = db.query(CustomerProfile).filter(
        CustomerProfile.customer_id == customer_id
    ).first()
    if not profile:
        profile = CustomerProfile(customer_id=customer_id)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


def init_db():
    Base.metadata.create_all(bind=engine)
    # Tự động thêm các cột mới nếu DB cũ đang chạy (tránh lỗi khi upgrade schema)
    with engine.begin() as conn:
        migrations = [
            "ALTER TABLE chat_logs ADD COLUMN is_archived BOOLEAN DEFAULT 0",
            "ALTER TABLE chat_messages ADD COLUMN is_safe BOOLEAN",
            "ALTER TABLE chat_messages ADD COLUMN confidence_score FLOAT",
            "ALTER TABLE chat_messages ADD COLUMN sentiment VARCHAR",
            # v1.1 — CoordinationTask deduplication
            "ALTER TABLE coordination_tasks ADD COLUMN signal_count INTEGER DEFAULT 1",
            "ALTER TABLE coordination_tasks ADD COLUMN issue_type VARCHAR",
            # v1.3 — ContentSuggestion script persistence
            "ALTER TABLE content_suggestions ADD COLUMN script_json TEXT",
            # v1.4 — Chat summary (table is created by create_all; migration is a no-op guard)
            # v1.5 — ReviewAutoReply (table is created by create_all; migration is a no-op guard)
            # v1.6 — ReviewLog: thêm cột phân tích cảm xúc do AI điền
            "ALTER TABLE review_logs ADD COLUMN sentiment VARCHAR",
            "ALTER TABLE review_logs ADD COLUMN key_issue VARCHAR",
            "ALTER TABLE review_logs ADD COLUMN sentiment_tag VARCHAR",
        ]
        for sql in migrations:
            try:
                conn.execute(text(sql))
            except Exception:
                pass  # Bỏ qua nếu cột đã tồn tại