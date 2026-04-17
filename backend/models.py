from pydantic import BaseModel, Field
from typing import List, Literal, Optional

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

class MarketInsight(BaseModel):
    competitor_min_price: float
    competitor_avg_price: float
    market_trend: str
    overall_sentiment: str
    customer_pain_points: List[str]
    top_frequent_questions: List[str]
    analyst_summary: str

class CustomerContext(BaseModel):
    recent_sentiment: str
    frequent_question: str

class IncomingData(BaseModel):
    data_type: str
    payload: dict

class ProposalApproval(BaseModel):
    proposal_id: str
    status: str
    feedback: str = ""

class ChatMessageRequest(BaseModel):
    shop_policy: str = ""
    customer_text: str

class ChatMessage(BaseModel):
    shop_policy: str = "Đổi trả trong 7 ngày. Phí ship khách chịu."
    customer_text: str

class GuardrailResponse(BaseModel):
    suggested_reply: str
    confidence_score: float
    is_safe: bool
    flag_reason: str

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

class ReviewExtractedInsight(BaseModel):
    sentiment: str       # Tiêu cực, Tích cực, Bình thường
    key_issue: str       # Vấn đề cốt lõi (vd: "Giao hàng chậm", "Lỗi móp méo")
    action_needed: bool  # Có cần agent khác xử lý không?
    qa_knowledge: str    # Bài học rút ra (ví dụ: "Nếu khách hỏi về móp méo, hãy báo do vận chuyển và xin lỗi")

# ============================================================
# MODEL MỚI: Chủ shop duyệt / ghi đè / từ chối đề xuất AI
# ============================================================
class ChatApprovalRequest(BaseModel):
    pending_id: int = Field(..., description="ID của bản ghi PendingChatMessage")

    action: Literal["approve", "override", "reject"] = Field(
        ...,
        description=(
            "'approve'  → Dùng đúng câu AI đề xuất, lưu lịch sử\n"
            "'override' → Chủ shop tự điền nội dung thay thế, AI học từ đó\n"
            "'reject'   → Hủy hoàn toàn, không gửi gì, AI học lý do từ chối"
        )
    )

    # Bắt buộc khi action = "override"
    custom_message: str = Field(
        default="",
        description="Nội dung tin nhắn tự điền của chủ shop (bắt buộc khi action='override')"
    )

    # Tuỳ chọn — cung cấp thêm context để AI học tốt hơn
    rejection_reason: str = Field(
        default="",
        description="Lý do từ chối / chỉnh sửa (AI sẽ dùng để cải thiện bản thân)"
    )

# ============================================================
# MODELS MỚI: Quản trị khủng hoảng
# ============================================================

class CrisisDetectionRequest(BaseModel):
    """
    Yêu cầu quét và phát hiện khủng hoảng.
    - Nếu product_id được cung cấp: chỉ quét sản phẩm đó.
    - Nếu để trống: quét TẤT CẢ sản phẩm có tín hiệu rủi ro gần đây.
    """
    product_id: Optional[str] = Field(
        default=None,
        description="ID sản phẩm cần quét. Để trống = quét tất cả sản phẩm."
    )
    lookback_days: int = Field(
        default=7,
        ge=1, le=90,
        description="Số ngày nhìn lại để thu thập tín hiệu (mặc định 7 ngày)"
    )
    force_regenerate: bool = Field(
        default=False,
        description="True = tái tạo kế hoạch AI dù alert đã tồn tại"
    )

class CrisisResolveRequest(BaseModel):
    """Chủ shop đánh dấu khủng hoảng đã được xử lý."""
    resolution_note: str = Field(
        default="",
        description="Ghi chú về cách xử lý (để học cho lần sau)"
    )
