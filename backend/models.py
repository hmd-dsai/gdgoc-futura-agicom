from pydantic import BaseModel
from typing import List, Optional

class ShopProfile(BaseModel):
    target_customers: str = "Khách hàng phổ thông"
    strategic_vision: str = "Tối ưu lợi nhuận dài hạn"
    brand_tone: str = "Chuyên nghiệp, nhiệt tình"

class InternalData(BaseModel):
    current_price: float
    stock_level: int
    cost_price: float
    min_margin_percent: float
    conversion_rate: float = 0.05

class MarketData(BaseModel):
    competitor_min_price: float
    market_trend: str
    competitor_name: str
    competitor_rating: float = 4.5
    our_rating: float = 4.8
    platform_campaign: str = "None"

class CustomerContext(BaseModel):
    recent_sentiment: str
    frequent_question: str

class ProposalApproval(BaseModel):
    proposal_id: str
    status: str
    feedback: str = ""

class ChatMessage(BaseModel):
    shop_policy: str = "Đổi trả trong 7 ngày. Phí ship khách chịu."
    customer_text: str

class StrategyProposal(BaseModel):
    action_required: bool
    proposed_price: float
    expected_margin_percent: float
    pricing_reasoning: str
    content_update_suggestion: str
    urgency_level: str

class ProductRequest(BaseModel):
    product_id: str
    product_name: str
    internal_data: InternalData
    market_data: MarketData
    customer_context: CustomerContext
    shop_profile: ShopProfile
    manager_directive: str = "Không có chỉ thị đặc biệt"

class ChatSessionInput(BaseModel):
    customer_id: str
    message: str
    brand_tone: str = "Chuyên nghiệp, nhiệt tình"

class ReviewData(BaseModel):
    product_id: str
    rating: int          # Số sao (1-5)
    review_text: str     # Nội dung đánh giá
    customer_name: str = "Khách hàng Ẩn danh"

class CrisisPlanRequest(BaseModel):
    product_id:        str
    product_name:      str = "Sản phẩm"
    neg_review_count:  int = 0
    risk_task_count:   int = 0
    chat_signal_count: int = 0
    reviews:           List[dict] = []
    risk_tasks:        List[str]  = []
    chat_signals:      List[str]  = []
    force_regenerate:  bool = False   # True = bỏ qua cache, sinh plan mới


class ActionStatusUpdate(BaseModel):
    status: str   # pending | done | skipped


class ReviewExtractedInsight(BaseModel):
    sentiment: str       # "Tích cực" | "Bình thường" | "Tiêu cực"
    key_issue: str       # Vấn đề cốt lõi (vd: "Giao hàng chậm") hoặc "Không có vấn đề"
    sentiment_tag: str   # Nhãn ngắn ≤ 4 từ để hiển thị tag UI (vd: "Giao hàng nhanh", "Hộp bị móp")
    action_needed: bool  # Có cần agent khác xử lý không?
    qa_knowledge: str    # Bài học rút ra (ví dụ: "Nếu khách hỏi về móp méo, hãy báo do vận chuyển và xin lỗi")


# ── Content Agent ──────────────────────────────────────────────────────────────

CONTENT_TYPES = [
    "tiktok_15s", "tiktok_30s", "tiktok_60s",
    "reels_30s", "reels_60s",
    "youtube_short",
    "shopee_video",
    "facebook_post",
    "caption_instagram",
]

class ScriptImproveRequest(BaseModel):
    """Input cho endpoint cải thiện một phiên bản kịch bản cụ thể."""
    product_id: str
    product_name: str
    content_type: str = "tiktok_30s"
    variant: str = "emotional"      # Phong cách muốn cải thiện
    current_script: dict = {}       # Object kịch bản hiện tại của variant này
    feedback: str                   # Yêu cầu cải thiện từ người dùng
    is_text_post: bool = False


class ContentScriptRequest(BaseModel):
    """
    Input cho Content Agent generate-script endpoint.
    Thay thế hoàn toàn luồng crawl URL cũ.
    """
    product_id: str                          # VD: "P001" — dùng để tra USP từ catalog
    product_name: str                        # Tên đầy đủ để AI hiển thị trong script
    product_description: str                 # Mô tả sản phẩm (tự điền hoặc lấy từ catalog)
    usp_focus: List[str] = []               # Các USP muốn nhấn mạnh (subset của usp[] trong catalog)
    content_type: str = "tiktok_30s"        # Xem CONTENT_TYPES
    target_audience: str = ""               # VD: "Học sinh cấp 3, thích makeup nhẹ"
    custom_instructions: str = ""           # Hướng dẫn tuỳ chỉnh thêm từ người dùng
    brand_tone: str = "Trẻ trung, vui vẻ, gần gũi"  # Tông giọng muốn dùng
    trigger_source: str = "manual"          # "manual" | "content_task" | "crisis_signal" | "strategy_agent"
    source_task_id: Optional[int] = None    # ID của CoordinationTask gốc nếu kích hoạt tự động