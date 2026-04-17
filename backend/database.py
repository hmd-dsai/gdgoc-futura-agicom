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
    is_archived = Column(Boolean, default=False) # Đánh dấu để ẩn khỏi báo cáo ngày hôm sau

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

# Lịch sử hội thoại đầy đủ (mỗi tin nhắn là 1 row)
class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(String, index=True)
    role = Column(String) # 'user' hoặc 'assistant'
    content = Column(Text)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

# ============================================================
# BẢNG MỚI: Tin nhắn AI đề xuất đang chờ chủ shop duyệt
# - Khi AI bị guardrail chặn, record được tạo ở đây
# - Sau khi chủ shop approve/override/reject → mới lưu vào
#   ChatMessage và ChatLog thật sự
# ============================================================
class PendingChatMessage(Base):
    __tablename__ = "pending_chat_messages"
    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(String, index=True)

    # Tin nhắn gốc của khách
    user_message = Column(Text)

    # Đề xuất của AI (chưa được gửi)
    ai_suggestion = Column(Text)

    # Metadata từ AI evaluation
    confidence_score = Column(Float, default=0.0)
    is_safe = Column(Boolean, default=True)
    flag_reason = Column(Text, default="")
    sensor_insight = Column(Text, default="")

    # Trạng thái xử lý của chủ shop:
    # "pending"   → Chưa xử lý
    # "approved"  → Chủ shop duyệt đề xuất AI
    # "overridden"→ Chủ shop tự điền nội dung thay thế
    # "rejected"  → Chủ shop hủy, không gửi gì cả
    status = Column(String, default="pending")

    # Tin nhắn cuối cùng đã gửi (sau khi override hoặc approve)
    final_reply = Column(Text, default="")

    # Lý do từ chối (khi reject/override, dùng để AI học)
    rejection_reason = Column(Text, default="")

    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)


# SQLite cần check_same_thread=False, Postgres thì không cần
if "sqlite" in SQLALCHEMY_DATABASE_URL:
    engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(SQLALCHEMY_DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


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

def init_db():
    Base.metadata.create_all(bind=engine)
    # Tự động thêm cột mới vào DB cũ (migration thủ công, an toàn)
    with engine.begin() as conn:
        _safe_add_column(conn, "ALTER TABLE chat_logs ADD COLUMN is_archived BOOLEAN DEFAULT 0")
        # Migration cho bảng pending_chat_messages
        _safe_add_column(conn, "ALTER TABLE pending_chat_messages ADD COLUMN final_reply TEXT DEFAULT ''")
        _safe_add_column(conn, "ALTER TABLE pending_chat_messages ADD COLUMN rejection_reason TEXT DEFAULT ''")
        _safe_add_column(conn, "ALTER TABLE pending_chat_messages ADD COLUMN resolved_at DATETIME")
        # Migration cho bảng crisis_alerts (phòng khi DB cũ không có)
        _safe_add_column(conn, "ALTER TABLE crisis_alerts ADD COLUMN resolution_note TEXT DEFAULT ''")
        _safe_add_column(conn, "ALTER TABLE crisis_alerts ADD COLUMN resolved_at DATETIME")
        _safe_add_column(conn, "ALTER TABLE crisis_alerts ADD COLUMN last_updated DATETIME")

# ============================================================
# BẢNG MỚI: Cảnh báo khủng hoảng được phát hiện tự động
#
# Mỗi record = 1 sự kiện khủng hoảng được phát hiện cho
# một sản phẩm trong một khoảng thời gian nhất định.
#
# crisis_level:
#   "theo_doi"    → 1-3 điểm rủi ro  (Monitoring 🟡)
#   "canh_bao"    → 4-7 điểm rủi ro  (Warning 🟠)
#   "nghiem_trong"→ 8+ điểm rủi ro   (Critical 🔴)
#
# status:
#   "active"     → Đang xảy ra, cần xử lý
#   "monitoring" → Đang theo dõi, chưa cần can thiệp
#   "resolved"   → Đã xử lý xong
# ============================================================
class CrisisAlert(Base):
    __tablename__ = "crisis_alerts"
    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(String, index=True)

    # Mức độ khủng hoảng
    crisis_level = Column(String, default="theo_doi")
    crisis_category = Column(String, default="None")  # Category chủ đạo

    # Số lượng tín hiệu thu thập được
    negative_review_count = Column(Integer, default=0)
    risk_task_count = Column(Integer, default=0)
    crisis_score = Column(Float, default=0.0)

    # Khoảng thời gian quét (ngày)
    lookback_days = Column(Integer, default=7)

    # Dữ liệu thô — JSON array chứa các tín hiệu cụ thể
    signals_summary_json = Column(Text, default="[]")

    # Kế hoạch xử lý do AI tổng hợp — JSON object
    crisis_plan_json = Column(Text, default="{}")

    # Trạng thái xử lý
    status = Column(String, default="active")
    resolution_note = Column(Text, default="")

    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    last_updated = Column(DateTime, default=datetime.datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)


def _safe_add_column(conn, alter_sql: str):
    """Chạy ALTER TABLE nhưng bỏ qua nếu cột đã tồn tại."""
    try:
        conn.execute(text(alter_sql))
    except Exception:
        pass