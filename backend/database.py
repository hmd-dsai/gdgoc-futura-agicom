import os
from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Boolean, create_engine, Date, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "agicom_system.db")
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"
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
# Mở database.py và chèn đoạn này vào dưới class ChatLog
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

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)
    # Tự động thêm cột is_archived nếu DB cũ đang chạy để tránh lỗi
    with engine.begin() as conn:
        try:
            conn.execute(text("ALTER TABLE chat_logs ADD COLUMN is_archived BOOLEAN DEFAULT 0"))
        except Exception:
            pass # Bỏ qua nếu cột đã tồn tại