import os
from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Boolean, create_engine, Date, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import datetime

# Cấu hình Database chuyển đổi linh hoạt giữa SQLite và PostgreSQL
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./agicom_system.db")

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
    product_id = Column(String, index=True)
    rating = Column(Integer)
    review_text = Column(Text)
    customer_name = Column(String, default="Ẩn danh")
    ai_insight = Column(String) # Bài học mà AI rút ra được từ review này
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

# Lưu các Task mà Agent CSKH giao cho Agent khác
class CoordinationTask(Base):
    __tablename__ = "coordination_tasks"
    id = Column(Integer, primary_key=True, index=True)
    target_agent = Column(String) # "Pricing" hoặc "Content"
    product_id = Column(String)
    instruction = Column(Text)
    status = Column(String, default="pending") # pending, completed, archived
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

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

def get_chat_history(db, customer_id: str, limit: int = 6):
    from sqlalchemy import desc
    messages = db.query(ChatMessage)\
        .filter(ChatMessage.customer_id == customer_id)\
        .order_by(desc(ChatMessage.timestamp))\
        .limit(limit)\
        .all()
    return messages[::-1] # Trả về thứ tự cũ -> mới

def save_message(db, customer_id: str, role: str, content: str):
    new_msg = ChatMessage(customer_id=customer_id, role=role, content=content)
    db.add(new_msg)
    db.commit()

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
    # Tự động thêm cột is_archived nếu DB cũ đang chạy để tránh lỗi
    with engine.begin() as conn:
        try:
            conn.execute(text("ALTER TABLE chat_logs ADD COLUMN is_archived BOOLEAN DEFAULT 0"))
        except Exception:
            pass # Bỏ qua nếu cột đã tồn tại