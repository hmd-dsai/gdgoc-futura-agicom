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
    rating: int
    review_text: str
    customer_name: str = "Khách hàng Ẩn danh"

class ReviewExtractedInsight(BaseModel):
    sentiment: str
    key_issue: str
    action_needed: bool
    qa_knowledge: str


# ── Content Agent Models ──────────────────────────────────────────────────────

class ContentAgentRequest(BaseModel):
    """Input cho pipeline phân tích sản phẩm từ link."""
    product_url: str
    platform: str = "shopee"           # shopee | lazada | tiktok
    shop_context: Optional[dict] = None
    content_goal: str = "viral"         # viral | review | demo
    product_data_override: Optional[dict] = None  # Tự nhập nếu scrape thất bại


class USPItem(BaseModel):
    rank: int
    point: str      # Điểm bán nổi bật
    evidence: str   # Bằng chứng từ review / spec


class AudiencePersona(BaseModel):
    persona_id: str
    persona: str
    age_range: str
    pain_point: str
    buying_trigger: str
    preferred_content: str


class ScriptScene(BaseModel):
    scene_no: int
    time_range: str    # "0-3s"
    type: str          # hook | body | proof | cta
    voiceover: str
    caption: str
    visual_note: str


class VideoScript(BaseModel):
    variant: str           # emotional | informational | humor
    total_duration: int
    hook_text: str
    scenes: List[ScriptScene]
    cta: str
    hashtags: List[str]
    caption_post: str


class ScriptGenerateRequest(BaseModel):
    product_intel_id: str
    video_length: int = 30
    variants: List[str] = ["emotional", "informational", "humor"]
    language: str = "vi"
    persona_id: Optional[str] = None


class FilmingGuideRequest(BaseModel):
    script_id: str
    variant: str = "emotional"
    equipment: str = "phone"   # phone | camera
    location: str = "home"     # home | outdoor | studio


class FilmingScene(BaseModel):
    scene_no: int
    duration: str
    setup: str
    lighting: str
    angle: str
    props: List[str]
    tip: str


class ScriptFeedbackRequest(BaseModel):
    script_id: str
    variant: str
    feedback: str
