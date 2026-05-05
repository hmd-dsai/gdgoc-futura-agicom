/* =====================================================================
   Agicom Dashboard v2.0 - Complete App Logic
   Multi-Agent E-commerce Assistant for Vietnamese SMEs
   ===================================================================== */

/* =====================================================================
   0. PRODUCT CATALOG — 11 SKU đầy đủ (dùng cho search filter + form review)
   ===================================================================== */
const PRODUCT_CATALOG = [
  { id: 'P001', sku: 'GF-LGLOSS-M01',       name: 'Son Bóng GIAO FARA (Mã 01-08)',                      category: 'Son môi',       price: 39000  },
  { id: 'P001', sku: 'GF-LGLOSS-M04',       name: 'Son Bóng GIAO FARA (Mã 04)',                         category: 'Son môi',       price: 39000  },
  { id: 'P002', sku: 'GF-MLIPSTICK-M09',    name: 'Son Kem Lì GIAO FARA Siêu Lì Mịn (Mã 09-16)',        category: 'Son môi',       price: 39000  },
  { id: 'P003', sku: 'GF-SPOWDER-TN',       name: 'Phấn Phủ Bột GIAO FARA Kềm Dầu Tự Nhiên',           category: 'Phấn phủ',      price: 129000 },
  { id: 'P004', sku: 'GF-CO1-ML-SPOWDER',   name: 'Combo Kem Lì GIAO FARA và Phấn Phủ Bột',            category: 'Combo',         price: 159000 },
  { id: 'P006', sku: 'GF-POWDER-18K',       name: 'Phấn Phủ Bột GIAO FARA Kềm Dầu (Mini)',             category: 'Phấn phủ',      price: 18000  },
  { id: 'P007', sku: 'GF-LIPSET-06',        name: 'Set Son Kem Lì 6 Thỏi',                              category: 'Set / Bundle',  price: 114000 },
  { id: 'P008', sku: 'GF-MKP-COMBO6',       name: 'Bộ Trang Điểm 6 Món Cơ Bản',                        category: 'Set / Bundle',  price: 74000  },
  { id: 'P009', sku: 'GF-TOOL-BRUSH13',     name: 'Bộ Cọ Trang Điểm 13 Món Lông Mềm',                  category: 'Phụ kiện',      price: 87000  },
  { id: 'P010', sku: 'GF-TOOL-CURLER',      name: 'Kẹp Bấm Mi Chuyên Dụng Tự Nhiên',                   category: 'Phụ kiện',      price: 54000  },
  { id: 'P011', sku: 'HL-CLEANSER-80G',     name: 'Kem Rửa Mặt Hada Labo Advanced Nourish 80g',         category: 'Chăm sóc da',   price: 180000 },
];

// State cho review product filter
let _reviewProductFilter = null; // null = tất cả | { id, name } = lọc theo sản phẩm

/* =====================================================================
   1. MOCK DATA
   ===================================================================== */
const MOCK = {
  shop: {
    name: 'Shop Mỹ phẩm GIAO FARA',
    plan: 'Premium AI',
    id: '#88902',
    target_revenue_month: 3200000000, // 3.2 tỷ
    current_revenue_month: 2120000000,
    margin_floor: 15, // % — mỹ phẩm margin cao hơn điện tử
    roas_floor: 3.0
  },

  // KPIs with sparkline data (last 7 days)
  kpis: {
    revenue: { value: 120500000, trend: 15, sparkline: [40, 60, 50, 80, 70, 100, 90], target: 120000000, current: 102000000 },
    orders: { value: 450, trend: 5, sparkline: [55, 62, 58, 70, 65, 80, 75] },
    cr: { value: 3.2, trend: -0.5, sparkline: [3.5, 3.6, 3.4, 3.3, 3.4, 3.2, 3.2], warning: true },
    aov: { value: 266000, trend: 2, sparkline: [250, 255, 260, 258, 262, 268, 266] }
  },

  platforms: [
    { id: 'shopee', name: 'Shopee Mall', share: 65, revenue: 78325000, target_pct: 85, color: '#10b981', connected: true, sku_synced: 234, connected_date: '12/01/2026' },
    { id: 'tiki', name: 'Tiki Trading', share: 15, revenue: 18075000, target_pct: 60, color: '#f59e0b', connected: true, sku_synced: 89, connected_date: '20/02/2026' },
    { id: 'tiktok', name: 'TikTok Shop', share: 0, revenue: 0, target_pct: 0, color: '#0ea5e9', connected: false, sku_synced: 0 },
    { id: 'website', name: 'Website', share: 20, revenue: 24100000, target_pct: 45, color: '#0ea5e9', connected: true, sku_synced: 234, connected_date: '01/01/2026' }
  ],

  // Critical alerts shown on dashboard
  alerts: [
    { level: 'critical', icon: '🔴', text: 'Kem Rửa Mặt Hada Labo: 3 review 1★ về kích ứng da trong 24h — nguy cơ khủng hoảng', cta: 'Xử lý ngay', cta_page: 'crisis-center' },
    { level: 'warning', icon: '🟡', text: 'Phấn Phủ Bột GIAO FARA còn 11 hộp — dự kiến hết trong 6 ngày', cta: 'Đặt hàng ngay', cta_page: 'inventory' },
    { level: 'warning', icon: '🟡', text: '15 khách hỏi về độ bền màu Son Kem Lì P002 trong 7 ngày — đề xuất video demo', cta: 'Xem chi tiết', cta_page: 'reviews' },
    { level: 'info', icon: '🔵', text: 'Tỷ lệ chuyển đổi giảm 0.5% — AI đang phân tích nguyên nhân', cta: 'Xem báo cáo', cta_page: 'ai-performance' },
    { level: 'info', icon: '🔵', text: 'Son Kem Lì P002: 5 khiếu nại giao sai màu — kiểm tra listing ảnh sản phẩm', cta: 'Trả lời ngay', cta_page: 'reviews' }
  ],

  // AI agent activity today
  ai_today: {
    suggestions_created: 12,
    suggestions_approved: 8,
    suggestions_pending: 3,
    suggestions_rejected: 1,
    chats_handled: 47,
    chats_auto: 43,
    chats_escalated: 4,
    revenue_from_ai: 18500000 // 18.5M
  },

  // Revenue by day (7 days, stacked by platform)
  revenue_7d: [
    { day: 'T2', shopee: 26, tiki: 6, website: 8 },
    { day: 'T3', shopee: 38, tiki: 10, website: 12 },
    { day: 'T4', shopee: 32, tiki: 8, website: 10 },
    { day: 'T5', shopee: 52, tiki: 12, website: 16 },
    { day: 'T6', shopee: 45, tiki: 10, website: 15 },
    { day: 'T7', shopee: 65, tiki: 15, website: 20 },
    { day: 'CN', shopee: 58, tiki: 13, website: 19 }
  ],

  // P&L
  pnl: [
    { label: '1. Doanh thu gộp', value: 850000000, change: 5, trend: 'up' },
    { label: '2. Giá vốn hàng bán (COGS)', value: 610000000, change: 3, trend: 'neutral' },
    { label: '3. Phí Sàn (Shopee + TikTok)', value: 59500000, change: 7, trend: 'down' },
    { label: '4. Phí Quảng Cáo & Media', value: 42000000, change: 5, trend: 'neutral' },
    { label: '5. Phí Vận hành (Hộp, Băng keo)', value: 8500000, change: 1, trend: 'neutral' },
    { label: 'LỢI NHUẬN RÒNG (NET)', value: 130000000, change: 8, trend: 'up', highlight: true, margin: 15.3 },
    { label: 'Break-even point (cần đạt/ngày)', value: 23300000, change: 0, trend: 'neutral', italic: true }
  ],

  margin_by_product: [
    { name: 'Phấn Phủ Bột GIAO FARA', margin: 62, color: '#10b981' },
    { name: 'Son Kem Lì GIAO FARA', margin: 55, color: '#10b981' },
    { name: 'Bộ Cọ Trang Điểm 13 Món', margin: 48, color: '#f59e0b' },
    { name: 'Kem Rửa Mặt Hada Labo 80g', margin: 22, color: '#ef4444' }
  ],

  // Inventory
  inventory_kpis: {
    total: 2450,
    value: 1800000000,
    low_stock: 5,
    slow_moving: 12,
    turnover_days: 18
  },

  inventory_low: [
    { sku: 'Son Kem Lì GIAO FARA (Mã 12)', qty: 6, days: 3, ai_action: 'Đặt 200 thỏi — đang viral TikTok' },
    { sku: 'Phấn Phủ Bột GIAO FARA', qty: 11, days: 6, ai_action: 'Đặt 150 hộp — review 4.9★, sắp hết' },
    { sku: 'Kem Rửa Mặt Hada Labo 80g', qty: 14, days: 8, ai_action: 'Đặt 100 tuýp — bestseller dưỡng da' }
  ],

  inventory_slow: [
    { sku: 'Son Bóng GIAO FARA (Mã 04)', qty: 38, days: 72, ai_reason: 'Màu 04 ít được chọn — màu hồng nude đang trending hơn', ai_action: 'Giảm 15% + bundle với Son Kem Lì' },
    { sku: 'Phấn Phủ Mini GIAO FARA (lô cũ)', qty: 85, days: 60, ai_reason: 'Lô cũ có 3 review phản hồi bột hơi thô, lô mới đã cải tiến', ai_action: 'Flash sale 20% + ghi rõ "Lô mới cải tiến"' }
  ],

  // Competitors
  competitors: [
    { name: 'Hasaki Beauty', activity: 'Vừa chạy Flash Sale son MAC giảm 20% — bundle deal hút khách', time: '15 phút trước', color: '#ef4444' },
    { name: 'Beauty Skin Store', activity: 'Ra mắt Set Son + Phấn 189k (so P004: 159k)', time: '2 giờ trước', color: '#f59e0b' },
    { name: 'Guardian', activity: 'Hada Labo 80g hết hàng trên Shopee — cơ hội chiếm market share', time: 'Hôm qua', color: '#10b981' }
  ],

  competitor_products: ['Son Kem Lì GIAO FARA', 'Phấn Phủ Bột GIAO FARA', 'Kem Rửa Mặt Hada Labo 80g', 'Set Son 6 Thỏi', 'Bộ Cọ 13 Món'],

  competitor_prices: {
    'Son Kem Lì GIAO FARA': {
      history: [39000, 39000, 38000, 39000, 39000, 37000, 39000],
      shops: [
        { name: 'Shop Của Bạn (GIAO FARA)', old: null, new: 39000, gap: 0 },
        { name: 'Beauty Skin Store', old: 42000, new: 37000, gap: -5.1 },
        { name: 'Shop Mỹ Phẩm Linh', old: 40000, new: 38000, gap: -2.6 },
        { name: 'Hasaki', old: 45000, new: 43000, gap: +10.3 }
      ]
    },
    'Phấn Phủ Bột GIAO FARA': {
      history: [129000, 129000, 125000, 129000, 129000, 129000, 129000],
      shops: [
        { name: 'Shop Của Bạn (GIAO FARA)', old: null, new: 129000, gap: 0 },
        { name: 'Beauty Skin Store', old: 135000, new: 125000, gap: -3.1 },
        { name: 'Shop Mỹ Phẩm Linh', old: 130000, new: 128000, gap: -0.8 },
        { name: 'Hasaki', old: 140000, new: 135000, gap: +4.7 }
      ]
    },
    'Kem Rửa Mặt Hada Labo 80g': {
      history: [175000, 178000, 175000, 180000, 180000, 180000, 180000],
      shops: [
        { name: 'Shop Của Bạn (GIAO FARA)', old: null, new: 180000, gap: 0 },
        { name: 'Guardian', old: 185000, new: 183000, gap: +1.7 },
        { name: 'Hasaki', old: 182000, new: 179000, gap: -0.6 },
        { name: 'Shopee Mall chính hãng', old: 190000, new: 185000, gap: +2.8 }
      ]
    },
    'Set Son 6 Thỏi': {
      history: [114000, 114000, 110000, 114000, 114000, 112000, 114000],
      shops: [
        { name: 'Shop Của Bạn (GIAO FARA)', old: null, new: 114000, gap: 0 },
        { name: 'Beauty Skin Store', old: 120000, new: 115000, gap: +0.9 },
        { name: 'Shop Mỹ Phẩm Linh', old: 118000, new: 110000, gap: -3.5 },
        { name: 'Lazada Mall', old: 125000, new: 118000, gap: +3.5 }
      ]
    },
    'Bộ Cọ 13 Món': {
      history: [87000, 87000, 85000, 87000, 87000, 87000, 87000],
      shops: [
        { name: 'Shop Của Bạn (GIAO FARA)', old: null, new: 87000, gap: 0 },
        { name: 'Beauty Skin Store', old: 92000, new: 88000, gap: +1.1 },
        { name: 'Shop Mỹ Phẩm Linh', old: 90000, new: 85000, gap: -2.3 },
        { name: 'Shopee Mall khác', old: 95000, new: 90000, gap: +3.4 }
      ]
    }
  },

  // Reviews
  reviews_kpi: { rating: 4.85, count: 12450, positive: 85, neutral: 10, negative: 5, trend_pos: 3 },

  review_tags_pos: ['Giao siêu nhanh', 'Màu đẹp chuẩn ảnh', 'Tư vấn nhiệt tình'],
  review_tags_neg: ['Hộp bị móp khi ship', 'Giao sai màu son', 'Da hơi khô sau dùng'],

  reviews: [],  // Được load từ DB qua loadReviewsFromAPI() khi khởi động

  // Media & Ads
  ads_kpi: { budget_week: 15000000, spent: 8200000, revenue: 64000000, roas: 7.8 },

  ads_campaigns: [
    { name: 'Phấn Phủ Bột GIAO FARA — Shopee Search', channel: 'Shopee Search', cost: 1800000, conv: 68, roas: 9.4, action: 'scale', ai_reason: 'ROAS 9.4x > ngưỡng 8x → đề xuất tăng budget 25%' },
    { name: 'Son Kem Lì GIAO FARA — TikTok Video', channel: 'TikTok Video', cost: 1200000, conv: 145, roas: 12.1, action: 'scale', ai_reason: 'ROAS 12.1x xuất sắc — scale budget tối đa trong mùa sale' },
    { name: 'Set Son 6 Thỏi — Facebook Ads', channel: 'Facebook Ads', cost: 900000, conv: 28, roas: 3.9, action: 'maintain', ai_reason: 'ROAS 3.9x vừa qua ngưỡng 3x — duy trì, theo dõi thêm 3 ngày' },
    { name: 'Bộ Trang Điểm 6 Món — Shopee Discovery', channel: 'Shopee Discovery', cost: 700000, conv: 4, roas: 0.6, action: 'cut', ai_reason: 'ROAS 0.6x < 3.0x — tắt ngay, redirect budget sang Son Kem Lì' }
  ],

  // AI Suggestions
  suggestions: [
    {
      id: 'sug-001', type: 'price', status: 'pending', time: '5 phút trước',
      title: 'Định giá cao hơn đối thủ 5% — Son Kem Lì GIAO FARA rating 4.8★ vs 4.2★',
      reason: 'Rating của shop cao hơn Beauty Skin Store 0.6★. Review 4.8★ + 145 đơn/ngày cho thấy khách sẵn sàng trả giá cao hơn để có chất lượng. Margin hiện tại 55% — còn dư địa tăng giá mà không mất khách.',
      metrics: [{label: 'Doanh thu dự kiến', value: '+8M/tháng'}, {label: 'Margin mới', value: '58%'}, {label: 'Giá đề xuất', value: '41.000đ'}],
      confidence: 84
    },
    {
      id: 'sug-002', type: 'content', status: 'pending', time: '12 phút trước',
      title: 'Video swatches màu son trên 3 tone da — giảm 60% câu hỏi màu',
      reason: '18 khách/7 ngày hỏi "màu son phù hợp tone da nào?" — tỷ lệ chốt sau hỏi màu chỉ 22% (thấp hơn TB 35%). Video swatches trực tiếp giải quyết điểm nghẽn này.',
      metrics: [{label: 'CR dự kiến tăng', value: '+13%'}, {label: 'Câu hỏi giảm', value: '-60%'}, {label: 'Thời gian tư vấn', value: '-40%'}],
      confidence: 91
    },
    {
      id: 'sug-003', type: 'promo', status: 'pending', time: '1 giờ trước',
      title: 'Flash Sale Son Bóng Mã 04 + 07 — xả tồn 38 cái trong 72h',
      reason: 'Mã 04 và 07 tồn 72 ngày — xu hướng màu nude và đỏ đô đang chiếm ưu thế. Giảm 15% + bundle với Son Kem Lì giúp xả kho mà vẫn bảo vệ margin tổng.',
      metrics: [{label: 'Thu hồi vốn', value: '~2.5M'}, {label: 'Margin gộp', value: '42%'}, {label: 'SKU xả', value: '38 thỏi'}],
      confidence: 79
    },
    {
      id: 'sug-004', type: 'ads', status: 'approved', time: '2 giờ trước',
      title: 'Tăng budget Son Kem Lì TikTok Video +35%',
      reason: 'ROAS 12.1x duy trì 5 ngày liên tiếp — đang trong mùa mua sắm 5/5. Scale ngay trước khi hết thời điểm vàng.',
      metrics: [{label: 'Doanh thu dự kiến', value: '+15M'}, {label: 'ROAS dự báo', value: '10.8x'}],
      confidence: 93
    },
    {
      id: 'sug-005', type: 'cs', status: 'approved', time: '3 giờ trước',
      title: 'Proactive outreach 5 khách VIP quan tâm Combo P004',
      reason: '5 khách VIP đã xem Combo P004 (Son + Phấn) > 3 lần nhưng chưa chốt. Gửi voucher 15k kèm swatch video — tỷ lệ chốt dự kiến 45%.',
      metrics: [{label: 'Khách target', value: '5 VIP'}, {label: 'CR dự kiến', value: '45%'}, {label: 'Doanh thu tiềm năng', value: '~800k'}],
      confidence: 83
    },
    {
      id: 'sug-006', type: 'price', status: 'rejected', time: 'Hôm qua',
      title: 'Giảm giá Kem Rửa Mặt Hada Labo xuống 165k để cạnh tranh Hasaki',
      reason: 'Hasaki đang bán 179k — giảm xuống 165k có thể tăng volume.',
      metrics: [{label: 'Doanh thu', value: '+3M'}, {label: 'Margin', value: '8%'}],
      confidence: 58,
      rejection_reason: 'Margin 8% sau giảm quá thấp. Hada Labo là hàng chính hãng — giữ định vị chất lượng, không phá giá.'
    }
  ],

  // Chat conversations — populated at runtime by api_integration.js (loadChatInboxFromBackend)
  conversations: [],

  // Issue clusters from AI pattern detection
  chat_clusters: [
    { icon: '🔴', label: 'Kem Rửa Mặt Hada Labo gây kích ứng da', count: 5, product_id: 'P011', impact: 'Cao — rủi ro khủng hoảng', action: 'Liên hệ khách + kiểm tra lô hàng', urgent: true },
    { icon: '🟡', label: 'Son Kem Lì giao sai màu / khô môi', count: 7, product_id: 'P002', impact: 'Trung bình — ảnh hưởng rating', action: 'Kiểm tra listing ảnh + xử lý khiếu nại', urgent: true },
    { icon: '🟡', label: 'Hỏi màu son phù hợp với tone da', count: 18, product_id: 'P001', impact: 'Mất ~25% cơ hội chốt đơn', action: 'Làm video swatches so sánh màu da', urgent: false },
    { icon: '🔵', label: 'Hỏi Phấn Phủ có hợp da dầu không', count: 12, product_id: 'P003', impact: 'Thấp — cần nội dung giải thích', action: 'Cập nhật mô tả cho từng loại da', urgent: false },
    { icon: '🔵', label: 'Hỏi giá sỉ từ 5 máy trở lên', count: 12, impact: 'Cơ hội B2B mới', action: 'Tạo bảng giá sỉ chính thức', urgent: false },
    { icon: '🔵', label: 'Phàn nàn hộp bị móp khi ship', count: 8, impact: 'Ảnh hưởng review', action: 'Đổi thùng carton 5 lớp (+2k/đơn)', urgent: false }
  ],

  // Proactive targets — khách cần chủ động nhắn
  proactive_targets: [
    { name: 'Nguyễn Thị Bình', reason: 'Đã hỏi Combo P004 (Son + Phấn) 3 lần trong 7 ngày — chưa chốt', value: '159k tiềm năng · VIP repeat buyer', action: 'Gửi voucher 15k' },
    { name: 'Trần Thị Mai', reason: 'Mua Son Kem Lì màu 12 tháng trước — màu 12 đang flash sale -10%', value: 'Upsell tiềm năng · 35k/đơn', action: 'Gửi thông báo sale' },
    { name: 'Lê Văn Thành', reason: 'Đơn hàng #GF-2241 giao 4 ngày chưa nhận — rủi ro khiếu nại', value: 'Phòng ngừa review xấu', action: 'Chủ động hỏi thăm' }
  ],

  // Crisis data — dữ liệu mẫu cho GIAO FARA (dùng khi backend offline).
  // Khi backend online, Crisis Center tự động dùng /api/crisis-overview.
  // _buildCrisisFromMockData() đọc MOCK.reviews + MOCK.conversations bên dưới.
  crises: [
    {
      id: 'cr-p011',
      product: 'Kem Rửa Mặt Hada Labo 80g',
      product_id: 'P011',
      severity: 'critical',
      status: 'active',
      severity_score: 75,
      neg_review_count: 3,
      risk_task_count: 1,
      chat_signal_count: 2,
    },
    {
      id: 'cr-p002',
      product: 'Son Kem Lì GIAO FARA Siêu Lì Mịn',
      product_id: 'P002',
      severity: 'warning',
      status: 'active',
      severity_score: 45,
      neg_review_count: 2,
      risk_task_count: 1,
      chat_signal_count: 1,
    },
  ],

  // Chat messages — populated at runtime by api_integration.js
  chat_messages: {},

  // Insight reports (auto-generated from chat data)
  insights: [
    { icon: '📊', title: '412 tin nhắn xử lý tuần này', detail: '88% tự động, 8% chờ duyệt, 4% cần xử lý cá nhân', cta: null },
    { icon: '🎨', title: 'Câu hỏi phổ biến nhất: "Màu son phù hợp với tone da nào?" (68 lần)', detail: 'Đề xuất: Quay video swatches 3 tone da — dự kiến giảm 60% câu hỏi màu sắc', cta: 'Tạo content brief' },
    { icon: '✅', title: '22 khách hỏi "Son có an toàn không, có chứng nhận không?"', detail: 'Đề xuất: Thêm ảnh chứng nhận an toàn + thành phần vào listing — tăng trust score', cta: 'Xem chi tiết' },
    { icon: '📦', title: '9 khách phàn nàn hộp móp / nắp son bị nứt khi nhận', detail: 'Đề xuất: Bổ sung mút xốp đệm bên trong túi ship — chi phí +1.5k/đơn, giảm 80% complaint', cta: 'Xem báo giá' },
    { icon: '💼', title: '8 khách hỏi giá sỉ từ 10 thỏi trở lên', detail: 'Insight: Có nhu cầu B2B rõ ràng (spa, salon) — cân nhắc tạo bảng giá sỉ chính thức', cta: 'Tạo bảng giá B2B' }
  ],

  // AI Performance metrics
  ai_perf: {
    total_executed: 142,
    approval_rate: 76,
    revenue_added: 87500000,
    response_time_before: 480, // 8 phút
    response_time_after: 12 // 12 giây
  },

  ai_perf_by_agent: [
    { name: 'Pricing Agent', icon: '💰', total: 32, approved: 78, result: '+34M doanh thu', trend: 'up' },
    { name: 'Content Agent', icon: '📝', total: 18, approved: 89, result: '+12% CR trung bình', trend: 'up' },
    { name: 'Promotion Agent', icon: '🎁', total: 24, approved: 71, result: '+18M doanh thu', trend: 'up' },
    { name: 'Customer Service Agent', icon: '💬', total: 47, approved: 94, result: '4.85★ rating', trend: 'up' },
    { name: 'Ads Agent', icon: '📢', total: 21, approved: 67, result: 'ROAS 7.8x', trend: 'neutral' }
  ],

  // Settings - team members
  team_members: [
    { name: 'Nguyễn Thị Hương', email: 'owner@giaofara.vn', role: 'Admin' },
    { name: 'Lê Thị Minh Ngọc', email: 'ngoc.le@giaofara.vn', role: 'Vận hành' },
    { name: 'Trần Văn An', email: 'an.tran@giaofara.vn', role: 'Chỉ xem' }
  ],

  recent_activity: [
    { time: '5 phút', user: 'AI Agent', action: 'Đề xuất tăng giá Son Kem Lì 5% (rating cao hơn đối thủ)', status: 'pending' },
    { time: '18 phút', user: 'Nguyễn Thị Hương', action: 'Duyệt: Tăng budget Son Kem Lì TikTok +35%', status: 'approved' },
    { time: '1 giờ', user: 'AI Agent', action: 'Phản hồi khách Trần Thị Mai về màu son (auto)', status: 'approved' },
    { time: '2 giờ', user: 'Lê Thị Minh Ngọc', action: 'Từ chối: Giảm giá Hada Labo xuống 165k', status: 'rejected' },
    { time: 'Hôm qua', user: 'AI Agent', action: 'Tạo báo cáo insight tuần — 5 cơ hội content mới', status: 'approved' }
  ]
};

/* =====================================================================
   1b. EXTENDED MOCK DATA — for feature pages
   ===================================================================== */

MOCK.content_inventory = [
  { id: 'cnt-001', type: 'video', title: 'Swatches Son Kem Lì GIAO FARA — 8 màu trên 3 tone da', topic: 'màu sắc/tone da', published: '01/03/2026', views: 38500, questions_reduced: 62, product: 'Son Kem Lì GIAO FARA (P002)' },
  { id: 'cnt-002', type: 'blog', title: 'Review chi tiết Kem Rửa Mặt Hada Labo 80g — có phù hợp da nhạy cảm?', topic: 'dưỡng da/thành phần', published: '15/02/2026', views: 12400, questions_reduced: 45, product: 'Kem Rửa Mặt Hada Labo (P011)' },
  { id: 'cnt-003', type: 'faq', title: 'FAQ: Phấn Phủ GIAO FARA — da dầu có dùng được không?', topic: 'loại da/cách dùng', published: '10/01/2026', views: 5600, questions_reduced: 34, product: 'Phấn Phủ Bột GIAO FARA (P003)' }
];

MOCK.products_detail = [
  {
    sku: 'GF-MLIPSTICK-M09', name: 'Son Kem Lì GIAO FARA Siêu Lì Mịn (Mã 09-16)', category: 'Son môi', price: 39000,
    description_current: 'Son Kem Lì GIAO FARA Siêu Lì Mịn. Màu 09-16. Finish velvet matte. Bám màu 6-8 tiếng. Khô nhanh trong 30 giây. Chất son mịn không tạo vảy. Giá 39.000đ.',
    description_key_points: ['velvet matte', 'bám màu 6-8 tiếng', 'khô 30 giây', 'không tạo vảy', '8 màu'],
    usp: [
      'Lì mịn velvet chuẩn studio — bám màu 6–8 tiếng, ăn uống vẫn còn màu, không lem khẩu trang',
      'Khô trong 30 giây, không dính, không tạo vảy — hoàn hảo cho ngày bận rộn cần makeup nhanh',
      '8 màu từ nude thanh lịch đến đỏ đô quyến rũ — 1 thỏi đủ mọi mood cả tuần',
      'Chất son siêu mịn, không tạo vân khô hay bong tróc dù môi hơi thiếu nước',
      'Giá chỉ 39.000đ — tiết kiệm 70% so với son lì ngoại nhập, chất lượng không thua kém'
    ],
    chatbot_questions: [
      { topic: 'Màu sắc / tone da', count: 18, sample: 'Màu nào phù hợp với da ngăm tối?', sentiment: 'neutral' },
      { topic: 'Độ bền màu', count: 15, sample: 'Son có bị bay màu sau khi ăn không?', sentiment: 'neutral' },
      { topic: 'Thành phần / an toàn', count: 12, sample: 'Son có paraben không? Có an toàn không?', sentiment: 'neutral' },
      { topic: 'Da khô / môi khô', count: 9, sample: 'Môi khô hay bị bong tróc, dùng son lì có ổn không?', sentiment: 'neutral' },
      { topic: 'Giá sỉ / số lượng lớn', count: 8, sample: 'Lấy 10 thỏi có giảm không?', sentiment: 'neutral' }
    ],
    review_features: [
      { feature: 'Độ bền màu', mentions: 42, positive: 35, negative: 7, sample_neg: 'Ăn xong bay màu khá nhanh' },
      { feature: 'Chất son / độ mịn', mentions: 38, positive: 34, negative: 4, sample_pos: 'Chất mịn như nhung, không bông tróc' },
      { feature: 'Màu sắc chuẩn ảnh', mentions: 29, positive: 22, negative: 7, sample_neg: 'Màu thực nhạt hơn ảnh một chút' },
      { feature: 'Đóng gói / giao hàng', mentions: 14, positive: 10, negative: 4, sample_neg: 'Nắp son hơi lỏng khi nhận' },
      { feature: 'Giá trị / giá tiền', mentions: 22, positive: 22, negative: 0, sample_pos: 'Giá rẻ mà chất xịn, mua thêm ngay' }
    ]
  },
  {
    sku: 'GF-SPOWDER-TN', name: 'Phấn Phủ Bột GIAO FARA Kềm Dầu Tự Nhiên', category: 'Phấn phủ', price: 129000,
    description_current: 'Phấn Phủ Bột GIAO FARA Kềm Dầu Tự Nhiên. Kiềm dầu 6-8 tiếng. Tông tự nhiên phù hợp da vàng ấm. Không paraben. Che phủ lỗ chân lông nhẹ. Giá 129.000đ.',
    description_key_points: ['kiềm dầu 6-8 tiếng', 'tông tự nhiên', 'không paraben', 'che lỗ chân lông', 'da dầu/hỗn hợp'],
    usp: [
      'Kiềm dầu cực đỉnh 6–8 tiếng — da luôn mịn như plastic skin, không cần dặm lại giữa ngày',
      'Tông Tự Nhiên pha chuẩn cho da vàng ấm người Việt — mặc lên không bị trắng bệch hay xám xịt',
      'Không chứa paraben — an toàn cho da nhạy cảm, da dầu, da hỗn hợp dùng lâu dài',
      'Che phủ lỗ chân lông và vết thâm nhẹ mà không cần thêm kem nền — tiết kiệm bước makeup',
      '129.000đ dùng được 3–4 tháng — tính ra chưa đến 1.500đ/ngày cho da đẹp hoàn hảo'
    ],
    chatbot_questions: [
      { topic: 'Da dầu / da hỗn hợp', count: 12, sample: 'Da dầu nhiều có dùng được không? Kềm dầu tốt không?', sentiment: 'neutral' },
      { topic: 'Tone màu phù hợp', count: 10, sample: 'Da ngăm tối dùng tông gì cho phù hợp?', sentiment: 'neutral' },
      { topic: 'Thành phần an toàn', count: 9, sample: 'Phấn có paraben không? Mang thai dùng được không?', sentiment: 'neutral' },
      { topic: 'Cách dùng + cọ', count: 7, sample: 'Dùng cọ nào đánh phấn này đẹp nhất?', sentiment: 'neutral' },
      { topic: 'Thời gian sử dụng', count: 5, sample: 'Hộp 129k dùng được bao lâu?', sentiment: 'neutral' }
    ],
    review_features: [
      { feature: 'Kiềm dầu', mentions: 48, positive: 38, negative: 10, sample_neg: 'Da dầu cực nhiều kiềm chỉ được 4 tiếng' },
      { feature: 'Tone màu tự nhiên', mentions: 35, positive: 30, negative: 5, sample_pos: 'Màu vừa vặn da vàng ấm, không trắng bệch' },
      { feature: 'Độ mịn / che phủ', mentions: 28, positive: 24, negative: 4, sample_pos: 'Đánh xong mịn kinh, che khuyết điểm nhẹ ổn' },
      { feature: 'An toàn / thành phần', mentions: 18, positive: 18, negative: 0, sample_pos: 'Da nhạy cảm dùng không bị dị ứng' },
      { feature: 'Đóng gói / giao hàng', mentions: 11, positive: 7, negative: 4, sample_neg: 'Hộp phấn bị vỡ góc khi nhận' }
    ]
  },
  {
    sku: 'HL-CLEANSER-80G', name: 'Kem Rửa Mặt Hada Labo Advanced Nourish 80g', category: 'Chăm sóc da', price: 180000,
    description_current: 'Kem Rửa Mặt Dưỡng Ẩm Hada Labo Advanced Nourish 80g. Hyaluronic Acid. Không cồn, không paraben. Bọt mịn sạch sâu. Hàng chính hãng nhập khẩu có hoá đơn Guardian. Giá 180.000đ.',
    description_key_points: ['Hyaluronic Acid', 'không cồn/paraben', 'bọt mịn', 'hàng chính hãng', 'da nhạy cảm'],
    usp: [
      'Hyaluronic Acid Nhật Bản giữ ẩm 24/7 — rửa mặt xong da vẫn mềm mịn căng mướt, không khô căng',
      'Hàng chính hãng nhập khẩu, có hoá đơn Guardian — date xa, nguồn gốc 100% rõ ràng, không lo hàng giả',
      'Không chứa cồn, không paraben — êm dịu an toàn cho da nhạy cảm, da khô, da mang thai đều dùng được',
      'Bọt mịn sạch sâu không gây kích ứng — nền skincare vững chắc để serum và kem dưỡng thẩm thấu tốt hơn',
      '180.000đ/80g dùng được 2–3 tháng — đầu tư thông minh nhất cho bước làm sạch nền tảng skincare'
    ],
    chatbot_questions: [
      { topic: 'Da nhạy cảm / kích ứng', count: 14, sample: 'Da mình nhạy cảm hay bị nổi mụn dùng được không?', sentiment: 'neutral' },
      { topic: 'Nguồn gốc / hàng thật', count: 11, sample: 'Hàng có chính hãng không? Date bao lâu?', sentiment: 'neutral' },
      { topic: 'Da khô / dưỡng ẩm', count: 9, sample: 'Rửa mặt xong có bị khô căng không?', sentiment: 'neutral' },
      { topic: 'Mang thai / cho con bú', count: 7, sample: 'Đang mang thai dùng được không?', sentiment: 'neutral' },
      { topic: 'Cách dùng / kết hợp', count: 6, sample: 'Dùng kết hợp với toner/serum nào tốt?', sentiment: 'neutral' }
    ],
    review_features: [
      { feature: 'Dưỡng ẩm / không khô', mentions: 52, positive: 42, negative: 10, sample_neg: 'Da khô mình thấy vẫn hơi khô căng sau rửa' },
      { feature: 'Nguồn gốc / chính hãng', mentions: 28, positive: 28, negative: 0, sample_pos: 'Có bill Guardian, date còn 18 tháng, yên tâm' },
      { feature: 'An toàn / thành phần', mentions: 24, positive: 20, negative: 4, sample_neg: 'Dùng 3 ngày mặt nổi mụn nhỏ li ti, có thể do purging' },
      { feature: 'Bọt / tạo bọt', mentions: 19, positive: 16, negative: 3, sample_pos: 'Bọt mịn dày, rửa sạch mà không thấy chật mặt' },
      { feature: 'Đóng gói / giao hàng', mentions: 12, positive: 8, negative: 4, sample_neg: 'Hộp kem bị móp khi nhận, lo lắng về vệ sinh' }
    ]
  }
];

MOCK.content_suggestions_generated = [
  {
    id: 'cs-001', priority: 'high', status: 'pending', type: 'tiktok_30s',
    title: 'Video swatches Son Kem Lì GIAO FARA — 8 màu trên 3 tone da thực tế',
    platform: 'TikTok + Shopee Video',
    source_product_id: 'P002',
    chatbot_signal: { count: 18, topic: 'Hỏi màu son phù hợp tone da', sample_questions: ['Màu nào hợp da ngăm tối?', 'Màu 12 có hợp da trắng không?', 'Màu nào dùng được đi học đi làm?'] },
    review_signal: { count: 7, neg_pct: 71, sample_reviews: ['Màu thực nhạt hơn ảnh một chút', 'Không biết màu nào phù hợp da mình'] },
    combined_score: 94,
    estimated_impact: 'Giảm ~60% câu hỏi màu sắc, tăng CR 10-15%',
    estimated_production: '2-3 giờ quay + editing nhẹ',
    angle: 'Test thực tế: 3 người mẫu tone da sáng / vàng trung / ngăm tối — quẹt trực tiếp, quay cận chi tiết để khách chọn màu không sai'
  },
  {
    id: 'cs-002', priority: 'high', status: 'pending', type: 'tiktok_60s',
    title: '"Phấn Phủ GIAO FARA da dầu dùng được không?" — FAQ + Video test 8 tiếng',
    platform: 'Blog + TikTok',
    source_product_id: 'P003',
    chatbot_signal: { count: 12, topic: 'Hỏi phấn có hợp da dầu không', sample_questions: ['Da dầu nhiều dùng có bị trôi không?', 'Kềm dầu được mấy tiếng?', 'Dùng xong có bóng nhờn không?'] },
    review_signal: { count: 10, neg_pct: 60, sample_reviews: ['Da dầu cực nhiều kiềm chỉ được 4 tiếng', 'Kềm dầu không tốt bằng kỳ vọng'] },
    combined_score: 88,
    estimated_impact: 'Giảm 50% câu hỏi về da dầu, set expectations đúng tăng satisfaction',
    estimated_production: '1-2 giờ viết + 1 ngày test',
    angle: 'Test thực tế: đánh phấn 8h sáng, check da lúc 12h và 4h chiều — chụp ảnh macro và video gần để khách thấy thực tế'
  },
  {
    id: 'cs-003', priority: 'high', status: 'pending', type: 'tiktok_60s',
    title: '"Kem Rửa Mặt Hada Labo có purging không?" — Giải thích khoa học + timeline',
    platform: 'Blog + TikTok',
    source_product_id: 'P011',
    chatbot_signal: { count: 9, topic: 'Hỏi kích ứng / nổi mụn sau dùng', sample_questions: ['Dùng 3 ngày mặt nổi mụn có phải lỗi sản phẩm?', 'Purging là gì? Bao lâu thì hết?', 'Da nhạy cảm dùng có sao không?'] },
    review_signal: { count: 10, neg_pct: 40, sample_reviews: ['Dùng 3 ngày mặt nổi mụn li ti', 'Da mình không hợp sản phẩm này'] },
    combined_score: 82,
    estimated_impact: 'Giảm lo ngại purging, giảm tỷ lệ đổi trả 30%, tăng trust',
    estimated_production: '2-3 giờ nghiên cứu + viết',
    angle: 'Giải thích rõ purging vs dị ứng thật: timeline, triệu chứng, cách phân biệt — đính kèm thành phần an toàn của Hada Labo'
  },
  {
    id: 'cs-004', priority: 'medium', status: 'pending', type: 'facebook_post',
    title: '"Bảng giá sỉ GIAO FARA chính thức" — Dành cho spa, salon, đại lý',
    platform: 'Website + Zalo OA',
    source_product_id: '',
    chatbot_signal: { count: 8, topic: 'Hỏi giá sỉ từ 10 thỏi trở lên', sample_questions: ['Lấy 20 thỏi son có giảm không?', 'Bảng giá sỉ của shop?', 'Mua sỉ cho salon được không?'] },
    review_signal: { count: 0, neg_pct: 0, sample_reviews: [] },
    combined_score: 67,
    estimated_impact: 'Mở kênh B2B spa/salon, dự kiến +8-12 đơn sỉ/tháng',
    estimated_production: '2-3 giờ thiết kế page + bảng giá',
    angle: 'Tạo landing page riêng với bảng giá sỉ theo bậc (10/20/50 thỏi), form đặt hàng và hotline Zalo riêng cho đại lý'
  },
  {
    id: 'cs-005', priority: 'medium', status: 'saved', type: 'tiktok_30s',
    title: '"Son GIAO FARA có an toàn không?" — Video review thành phần + chứng nhận',
    platform: 'TikTok + Shopee Video',
    source_product_id: 'P001',
    chatbot_signal: { count: 11, topic: 'Hỏi thành phần an toàn / không paraben', sample_questions: ['Son có paraben không?', 'Mang thai dùng son này được không?', 'Thành phần có hóa chất độc hại không?'] },
    review_signal: { count: 5, neg_pct: 20, sample_reviews: ['Da nhạy cảm dùng không bị gì', 'Yên tâm vì không chứa hóa chất độc'] },
    combined_score: 72,
    estimated_impact: 'Tăng trust score, giảm 40% câu hỏi về thành phần',
    estimated_production: '2-3 giờ quay',
    angle: 'Đọc từng thành phần trực tiếp trên camera, giải thích công dụng, chỉ chứng nhận an toàn — ngắn 60 giây, thẳng vào vấn đề'
  }
];

MOCK.market_trends = [
  {
    topic: 'Màu sắc / Tone da phù hợp',
    chatbot_count: 42, review_count: 18, total_signals: 60,
    sentiment_pct: { positive: 15, neutral: 55, negative: 30 },
    trend_direction: 'up', trend_pct: 24,
    competitor_note: 'Hasaki đăng video swatches son MAC đạt 280k views tuần này',
    opportunity: 'Video swatches 3 tone da — giải quyết trực tiếp 42 câu hỏi màu sắc, tăng CR 10-15%'
  },
  {
    topic: 'Thành phần an toàn / Không hóa chất',
    chatbot_count: 22, review_count: 14, total_signals: 36,
    sentiment_pct: { positive: 70, neutral: 20, negative: 10 },
    trend_direction: 'up', trend_pct: 38,
    competitor_note: null,
    opportunity: 'Xu hướng clean beauty đang tăng mạnh — amplify điểm mạnh "không paraben" của GIAO FARA'
  },
  {
    topic: 'Kích ứng da / Purging sau dùng',
    chatbot_count: 18, review_count: 24, total_signals: 42,
    sentiment_pct: { positive: 20, neutral: 30, negative: 50 },
    trend_direction: 'up', trend_pct: 35,
    competitor_note: 'Hada Labo chính hãng có FAQ về purging trên website — cần làm tương tự',
    opportunity: 'Nội dung giải thích purging vs dị ứng thật — giảm lo ngại, giảm đổi trả 30%'
  },
  {
    topic: 'Độ bền màu / Son trôi sau ăn uống',
    chatbot_count: 15, review_count: 28, total_signals: 43,
    sentiment_pct: { positive: 25, neutral: 40, negative: 35 },
    trend_direction: 'stable', trend_pct: 8,
    competitor_note: null,
    opportunity: 'Video test bền màu 8 tiếng + sau ăn — kết hợp để xử lý cả câu hỏi lẫn review tiêu cực'
  },
  {
    topic: 'Giá sỉ & Đặt số lượng lớn (B2B spa/salon)',
    chatbot_count: 8, review_count: 0, total_signals: 8,
    sentiment_pct: { positive: 0, neutral: 100, negative: 0 },
    trend_direction: 'up', trend_pct: 52,
    competitor_note: 'Nhiều shop mỹ phẩm đã có bảng giá sỉ B2B riêng cho spa/salon',
    opportunity: 'Cơ hội B2B chưa khai thác: 8 khách hỏi sỉ, tiềm năng +10-15 đơn sỉ/tháng'
  }
];

MOCK.competitor_gaps = [
  { feature: 'Video swatches màu son đa tone da', competitor: 'Hasaki', impact: 'Khách xem Hasaki để quyết định màu trước khi về mua GIAO FARA', chatbot_count: 18, gap_type: 'content' },
  { feature: 'FAQ trang đích về purging/kích ứng', competitor: 'Hada Labo chính hãng', impact: '18 khách lo ngại kích ứng, một số đổi trả sau 3 ngày dùng', chatbot_count: 9, gap_type: 'content' },
  { feature: 'Bảng giá sỉ B2B cho spa/salon', competitor: 'Beauty Skin Store + Hasaki', impact: '8 khách hỏi sỉ không có kênh chính thức để phục vụ', chatbot_count: 8, gap_type: 'business' },
  { feature: 'Chứng nhận thành phần an toàn rõ ràng', competitor: 'Innisfree / The Face Shop', impact: 'Khách hỏi an toàn ngày càng nhiều theo xu hướng clean beauty', chatbot_count: 11, gap_type: 'trust' }
];

let currentProductDescSku = 'GF-MLIPSTICK-M09';


/* =====================================================================
   2. HELPERS
   ===================================================================== */
const fmt = {
  currency: (v) => {
    if (v >= 1e9) return (v/1e9).toFixed(1).replace('.0','') + 'B';
    if (v >= 1e6) return (v/1e6).toFixed(1).replace('.0','') + 'M';
    if (v >= 1e3) return (v/1e3).toFixed(0) + 'K';
    return v.toString();
  },
  vnd: (v) => v.toLocaleString('vi-VN') + 'đ',
  percent: (v, sign=true) => (sign && v > 0 ? '+' : '') + v + '%'
};

const ICON = {
  arrowUp: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>',
  arrowDown: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
  warning: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  brain: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M13 2L3 14h7v8l10-12h-7z"/></svg>'
};

function sparkline(data, color='#eab308') {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  return '<div class="sparkline">' + data.map(v => {
    const h = Math.max(4, Math.round(((v - min) / range) * 32) + 8);
    return '<div class="sparkline-bar" style="height:' + h + 'px;background:' + color + ';opacity:' + (0.5 + h/80).toFixed(2) + ';"></div>';
  }).join('') + '</div>';
}

function trendBadge(v) {
  const up = v >= 0;
  const color = up ? 'var(--accent-emerald)' : 'var(--accent-rose)';
  const bg = up ? 'var(--accent-emerald-bg)' : 'var(--accent-rose-bg)';
  return `<span class="stat-card-trend" style="color:${color};background:${bg};">${up ? ICON.arrowUp : ICON.arrowDown} ${Math.abs(v)}% vs kỳ trước</span>`;
}

function confBar(pct) {
  return `<div class="conf-progress"><div class="conf-fill" style="width:${pct}%"></div></div>`;
}

/* =====================================================================
   3. TOAST / MODAL / SLIDEOVER / SCAN
   ===================================================================== */
function showToast(msg, type='success') {
  const c = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  const icons = { success: '✅', warning: '⚠️', info: 'ℹ️', danger: '🚫' };
  el.innerHTML = `<span class="toast-icon">${icons[type] || '✅'}</span><span class="toast-message">${msg}</span>`;
  c.appendChild(el);
  setTimeout(() => { el.classList.add('removing'); setTimeout(()=>el.remove(), 300); }, 3500);
}

let pendingFeedbackId = null;
function openFeedbackModal(sugId) {
  pendingFeedbackId = sugId;
  document.getElementById('feedbackText').value = '';
  document.getElementById('modalSubmitBtn').disabled = true;
  document.getElementById('feedbackModal').classList.add('show');
}
function closeFeedbackModal() {
  document.getElementById('feedbackModal').classList.remove('show');
  pendingFeedbackId = null;
}

function openSlideover(sug) {
  // Build slideover dynamically
  let panel = document.getElementById('slideoverPanel');
  if (!panel) {
    const html = `
      <div class="slideover-backdrop" id="slideoverBackdrop"></div>
      <aside class="slideover-panel" id="slideoverPanel">
        <div class="slideover-header">
          <h3 id="slideoverTitle"></h3>
          <button class="modal-close-btn" id="slideoverClose">✕</button>
        </div>
        <div class="slideover-body" id="slideoverBody"></div>
      </aside>`;
    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('slideoverClose').onclick = closeSlideover;
    document.getElementById('slideoverBackdrop').onclick = closeSlideover;
    panel = document.getElementById('slideoverPanel');
  }
  document.getElementById('slideoverTitle').textContent = sug.title;
  document.getElementById('slideoverBody').innerHTML = `
    <div class="slideover-section">
      <div class="section-title" style="margin-bottom:8px;">${ICON.brain} Lý do AI đề xuất</div>
      <p style="color:var(--text-secondary); font-size:0.9rem;">${sug.reason}</p>
    </div>
    <div class="slideover-section">
      <div class="section-title" style="margin-bottom:8px;">📊 Số liệu dự kiến</div>
      <div class="sug-metrics">
        ${sug.metrics.map(m => `<div class="sug-metric"><div class="sug-metric-label">${m.label}</div><div class="sug-metric-value">${m.value}</div></div>`).join('')}
      </div>
    </div>
    <div class="slideover-section">
      <div class="section-title" style="margin-bottom:8px;">🎯 Độ tin cậy AI</div>
      <div class="confidence-row">
        <span class="confidence-label">Confidence Score</span>
        <span class="confidence-value">${sug.confidence}%</span>
      </div>
      ${confBar(sug.confidence)}
    </div>
    <div class="slideover-section">
      <div class="section-title" style="margin-bottom:8px;">⚙️ Logic suy luận</div>
      <ul style="font-size:0.85rem; color:var(--text-secondary); padding-left:18px; line-height:1.8;">
        <li>Quan sát: Crawl giá đối thủ (Market Agent)</li>
        <li>Phân tích: Đánh giá biên lợi nhuận, tồn kho (Pricing Agent)</li>
        <li>Đối chiếu: Lịch sử mua hàng + LTV khách (Customer DB)</li>
        <li>Quyết định: Tính toán optimal price giữ margin ≥ ${MOCK.shop.margin_floor}%</li>
        <li>Học hỏi: Lưu vào ChromaDB → cải thiện đề xuất tương lai</li>
      </ul>
    </div>
    <div class="slideover-section">
      <div class="section-title" style="margin-bottom:8px;">📜 Đề xuất tương tự trước đó</div>
      <div class="slideover-history-item">
        <div style="font-size:0.85rem; font-weight:600;">Tăng giá Son Kem Lì 5% (12/3)</div>
        <div style="font-size:0.75rem; color:var(--text-muted);">Kết quả: +8M doanh thu, margin tăng lên 58%, không giảm đơn</div>
      </div>
      <div class="slideover-history-item">
        <div style="font-size:0.85rem; font-weight:600;">Flash Sale Phấn Phủ Mini 20% (28/2)</div>
        <div style="font-size:0.75rem; color:var(--text-muted);">Kết quả: +5M doanh thu, xả 85 hộp tồn kho thành công</div>
      </div>
    </div>
  `;
  panel.classList.add('show');
  document.getElementById('slideoverBackdrop').classList.add('show');
}
function closeSlideover() {
  const p = document.getElementById('slideoverPanel');
  const b = document.getElementById('slideoverBackdrop');
  if (p) p.classList.remove('show');
  if (b) b.classList.remove('show');
}

function runScan() {
  const overlay = document.getElementById('scanOverlay');
  const btn = document.getElementById('btnScan');
  overlay.classList.add('show');
  btn.classList.add('scanning');
  setTimeout(() => {
    overlay.classList.remove('show');
    btn.classList.remove('scanning');
    showToast('Quét hoàn tất! AI đã phát hiện 3 cơ hội mới — xem trang Đề xuất AI', 'success');
  }, 2800);
}

/* =====================================================================
   4. PAGE RENDERERS
   ===================================================================== */


// ===== Crisis Banner Helper (string concat, avoids nested template literal issues) =====
function renderCrisisBannerHTML() {
  const active = MOCK.crises.filter(c => c.status === 'active');
  if (!active.length) return '';
  return active.map(cr => {
    const signals = cr.signals.map(s =>
      '<span style="font-size:0.75rem;color:#fca5a5;">' + s.icon + ' <b style="color:#fecaca;">' + s.agent + ':</b> ' + s.title + '</span>'
    ).join('');
    return '<div style="display:flex;align-items:center;gap:14px;padding:10px 16px;margin-bottom:16px;'
      + 'background:linear-gradient(90deg,#7f1d1d,#991b1b);border-radius:12px;border:1px solid #ef4444;'
      + 'box-shadow:0 0 20px rgba(239,68,68,0.25);">'
      + '<div style="font-size:1.4rem;flex-shrink:0;">🚨</div>'
      + '<div style="flex:1;min-width:0;">'
      +   '<div style="color:#fca5a5;font-size:0.65rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Orchestrator · MỨC ĐỎ · ' + cr.detected_at + '</div>'
      +   '<div style="color:#fff;font-weight:800;font-size:0.92rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'
      +     cr.product + ' — ' + cr.affected_customers + ' khách · Severity <span style="color:#f87171;">' + cr.severity_score + '/100</span>'
      +     ' · Rủi ro <span style="color:#f87171;">' + fmt.currency(cr.revenue_at_risk) + 'đ</span>'
      +   '</div>'
      +   '<div style="display:flex;gap:12px;margin-top:4px;flex-wrap:wrap;">' + signals + '</div>'
      + '</div>'
      + '<button class="btn-crisis-view" data-crisis="' + cr.id + '" '
      +   'style="flex-shrink:0;background:#ef4444;color:white;border:none;padding:8px 16px;'
      +   'border-radius:8px;font-weight:700;cursor:pointer;font-size:0.8rem;white-space:nowrap;">'
      +   '🔥 Xử lý →'
      + '</button>'
      + '</div>';
  }).join('');
}

// ===== Dashboard =====
function renderDashboard() {
  const k = MOCK.kpis;
  return `

    <!-- 🚨 Crisis Banner — được điền bởi api_integration.js sau khi tải /api/crisis-overview -->
    <div id="dashCrisisBanner"></div>

    <!-- Filter Tabs -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;flex-wrap:wrap;gap:12px;">
      <div class="filter-tabs">
        <button class="filter-tab active">Tất cả sàn</button>
        <button class="filter-tab">Shopee</button>
        <button class="filter-tab">Tiki</button>
        <button class="filter-tab">Website</button>
      </div>
      <div class="filter-tabs">
        <button class="filter-tab">Hôm nay</button>
        <button class="filter-tab active">7 Ngày qua</button>
        <button class="filter-tab">30 Ngày qua</button>
      </div>
    </div>

    <!-- KPI Cards with Sparklines (dữ liệu minh họa) -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-card-header">
          <div>
            <div class="stat-card-label">Doanh thu</div>
            <div class="stat-card-value">${fmt.currency(k.revenue.value)}đ</div>
          </div>
          <div class="stat-card-icon" style="background:var(--accent-amber-bg);color:var(--accent-amber);">💰</div>
        </div>
        ${sparkline(k.revenue.sparkline)}
        ${trendBadge(k.revenue.trend)}
      </div>

      <div class="stat-card">
        <div class="stat-card-header">
          <div>
            <div class="stat-card-label">Tổng Đơn Hàng</div>
            <div class="stat-card-value">${k.orders.value}</div>
          </div>
          <div class="stat-card-icon" style="background:var(--accent-emerald-bg);color:var(--accent-emerald);">📦</div>
        </div>
        ${sparkline(k.orders.sparkline, '#10b981')}
        ${trendBadge(k.orders.trend)}
      </div>

      <div class="stat-card" style="${k.cr.warning ? 'border-color:var(--accent-rose);' : ''}">
        <div class="stat-card-header">
          <div>
            <div class="stat-card-label">Tỷ Lệ Chuyển Đổi (CR) ${k.cr.warning ? `<span style="color:var(--accent-rose);">${ICON.warning}</span>` : ''}</div>
            <div class="stat-card-value">${k.cr.value}%</div>
          </div>
          <div class="stat-card-icon" style="background:var(--accent-rose-bg);color:var(--accent-rose);">🎯</div>
        </div>
        ${sparkline(k.cr.sparkline, '#f43f5e')}
        ${trendBadge(k.cr.trend)}
        ${k.cr.warning ? '<div style="margin-top:8px;font-size:0.75rem;color:var(--accent-rose);font-style:italic;">⚠ AI đang phân tích nguyên nhân</div>' : ''}
      </div>

      <div class="stat-card">
        <div class="stat-card-header">
          <div>
            <div class="stat-card-label">AOV (Giỏ hàng)</div>
            <div class="stat-card-value">${fmt.currency(k.aov.value)}đ</div>
          </div>
          <div class="stat-card-icon" style="background:var(--accent-indigo-bg);color:var(--accent-indigo);">🛒</div>
        </div>
        ${sparkline(k.aov.sparkline)}
        ${trendBadge(k.aov.trend)}
      </div>
    </div>

    <!-- 🤖 AI Agent Performance — được điền bởi api_integration.js sau khi tải /api/dashboard/ai-stats -->
    <div id="dashAIPerf" style="margin-top:20px;"></div>

    <!-- 🚨 Cảnh báo & Hành động ngay -->
    <div class="content-card" style="margin-top:20px;">
      <div class="content-card-title">🚨 Cảnh báo & Hành động ngay (${MOCK.alerts.length})</div>
      <div class="alert-list">
        ${MOCK.alerts.map(a => `
          <div class="alert-item">
            <div class="alert-icon">${a.icon}</div>
            <div class="alert-content"><div class="alert-text">${a.text}</div></div>
            <button class="alert-cta" data-nav="${a.cta_page}">${a.cta} →</button>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Donut + Doanh thu vs Mục tiêu -->
    <div class="grid-2" style="margin-top:20px;">
      <div class="content-card">
        <div class="content-card-title">Cơ Cấu Doanh Thu</div>
        <div class="donut-chart">
          <svg viewBox="0 0 36 36" width="180" height="180">
            <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#e5e7eb" stroke-width="3.5"/>
            <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#10b981" stroke-width="3.5" stroke-dasharray="65 35" stroke-dashoffset="0"/>
            <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#0ea5e9" stroke-width="3.5" stroke-dasharray="20 80" stroke-dashoffset="-65"/>
            <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#f59e0b" stroke-width="3.5" stroke-dasharray="15 85" stroke-dashoffset="-85"/>
          </svg>
          <div class="donut-center">
            <div class="donut-center-value">3</div>
            <div class="donut-center-label">Nền tảng</div>
          </div>
        </div>
        <div class="donut-legend">
          ${MOCK.platforms.filter(p=>p.connected).map(p => `
            <div class="donut-legend-item">
              <span class="legend-dot" style="background:${p.color};"></span>
              <span>${p.name}</span><strong>${p.share}%</strong>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="content-card">
        <div class="content-card-title">Doanh Thu vs Mục Tiêu (Tháng này)</div>
        <div class="h-bars">
          ${MOCK.platforms.filter(p=>p.connected).map(p => `
            <div class="h-bar-item">
              <div class="h-bar-label">${p.name}</div>
              <div class="h-bar-track"><div class="h-bar-fill" style="width:${p.target_pct}%; background:${p.color};"></div></div>
              <div class="h-bar-value">${p.target_pct}%</div>
            </div>
          `).join('')}
        </div>
        <div style="margin-top:16px; padding:12px; background:var(--bg-glass); border-radius:var(--radius-sm); font-size:0.8rem; color:var(--text-secondary);">
          📈 <strong>AI dự báo cuối tháng:</strong> Đạt 3.05B / 3.2B mục tiêu (95%) — cần đẩy thêm 150M trong 12 ngày còn lại
        </div>
      </div>
    </div>
  `;
}

// ===== AI Suggestions Page =====
let currentSugTab = 'pending';
let currentSugType = 'all';

function renderAISuggestions() {
  return `
    <div class="ai-sug-tabs">
      <button class="ai-sug-tab ${currentSugTab==='all'?'active':''}" data-tab="all">Tất cả <span class="ai-sug-tab-count">${MOCK.suggestions.length}</span></button>
      <button class="ai-sug-tab ${currentSugTab==='pending'?'active':''}" data-tab="pending">⏳ Chờ duyệt <span class="ai-sug-tab-count" style="background:var(--accent-amber-bg);color:var(--accent-amber);">${MOCK.suggestions.filter(s=>s.status==='pending').length}</span></button>
      <button class="ai-sug-tab ${currentSugTab==='approved'?'active':''}" data-tab="approved">✅ Đã duyệt <span class="ai-sug-tab-count" style="background:var(--accent-emerald-bg);color:var(--accent-emerald);">${MOCK.suggestions.filter(s=>s.status==='approved').length}</span></button>
      <button class="ai-sug-tab ${currentSugTab==='rejected'?'active':''}" data-tab="rejected">❌ Đã từ chối <span class="ai-sug-tab-count" style="background:var(--accent-rose-bg);color:var(--accent-rose);">${MOCK.suggestions.filter(s=>s.status==='rejected').length}</span></button>
    </div>

    <div class="ai-sug-sub-filters">
      <span style="font-size:0.8rem;color:var(--text-muted);font-weight:600;">Loại:</span>
      <button class="ai-sug-tab small ${currentSugType==='all'?'active':''}" data-type="all">Tất cả</button>
      <button class="ai-sug-tab small ${currentSugType==='price'?'active':''}" data-type="price">💰 Giá</button>
      <button class="ai-sug-tab small ${currentSugType==='content'?'active':''}" data-type="content">📝 Nội dung</button>
      <button class="ai-sug-tab small ${currentSugType==='promo'?'active':''}" data-type="promo">🎁 Khuyến mãi</button>
      <button class="ai-sug-tab small ${currentSugType==='cs'?'active':''}" data-type="cs">💬 CSKH</button>
      <button class="ai-sug-tab small ${currentSugType==='ads'?'active':''}" data-type="ads">📢 Quảng cáo</button>
    </div>

    <div class="ai-sug-list">
      ${MOCK.suggestions.filter(s => {
        if (currentSugTab !== 'all' && s.status !== currentSugTab) return false;
        if (currentSugType !== 'all' && s.type !== currentSugType) return false;
        return true;
      }).map(s => renderSugCard(s)).join('') || `<div style="padding:40px;text-align:center;color:var(--text-muted);">Không có đề xuất nào trong mục này.</div>`}
    </div>
  `;
}

function renderSugCard(s) {
  const typeMeta = {
    price: { label: 'Giá', color: '#eab308' },
    content: { label: 'Nội dung', color: '#0ea5e9' },
    promo: { label: 'Khuyến mãi', color: '#f43f5e' },
    cs: { label: 'CSKH', color: '#10b981' },
    ads: { label: 'Quảng cáo', color: '#f59e0b' }
  }[s.type];

  return `
    <div class="sug-card" data-id="${s.id}">
      <div class="sug-card-header">
        <span class="sug-type-badge" style="background:${typeMeta.color}22; color:${typeMeta.color};">${typeMeta.label}</span>
        <span class="sug-time">${s.time}</span>
        ${s.status !== 'pending' ? `<span class="sug-status" style="color:${s.status==='approved'?'var(--accent-emerald)':'var(--accent-rose)'};margin-left:auto;">${s.status==='approved'?'✅ Đã duyệt':'❌ Đã từ chối'}</span>` : ''}
      </div>
      <div class="sug-title">${s.title}</div>
      <div class="sug-reason">${s.reason}</div>
      <div class="sug-metrics">
        ${s.metrics.map(m => `<div class="sug-metric"><div class="sug-metric-label">${m.label}</div><div class="sug-metric-value">${m.value}</div></div>`).join('')}
      </div>
      <div class="confidence-row" style="margin:12px 0 4px;">
        <span class="confidence-label">Độ tin cậy AI</span>
        <span class="confidence-value">${s.confidence}%</span>
      </div>
      ${confBar(s.confidence)}
      ${s.rejection_reason ? `<div style="margin-top:10px;padding:10px;background:var(--accent-rose-bg);border-radius:var(--radius-sm);font-size:0.8rem;color:var(--accent-rose);"><strong>Lý do từ chối:</strong> ${s.rejection_reason}</div>` : ''}
      ${s.status === 'pending' ? `
        <div class="sug-actions" style="margin-top:14px;">
          <button class="btn-sug-detail" data-action="detail" data-id="${s.id}">Xem chi tiết</button>
          <button class="btn-sug-approve" data-action="approve" data-id="${s.id}">✅ Duyệt</button>
          <button class="btn-sug-deny" data-action="deny" data-id="${s.id}">❌ Từ chối</button>
        </div>
      ` : ''}
    </div>
  `;
}

// ===== Revenue Page =====
function renderRevenue() {
  const max = Math.max(...MOCK.revenue_7d.map(d => d.shopee + d.tiki + d.website));
  return `
    <div class="grid-2">
      <div class="content-card">
        <div class="content-card-title">Doanh Thu 7 Ngày Qua (theo sàn)</div>
        <div class="bar-chart" style="display:flex;gap:12px;align-items:flex-end;height:240px;padding:20px 8px 8px;">
          ${MOCK.revenue_7d.map(d => {
            const total = d.shopee + d.tiki + d.website;
            const totalH = (total/max)*100;
            const sH = (d.shopee/total)*totalH;
            const tH = (d.tiki/total)*totalH;
            const wH = (d.website/total)*totalH;
            return `
              <div class="bar-col" style="flex:1;display:flex;flex-direction:column;align-items:center;height:100%;justify-content:flex-end;">
                <div class="bar-value" style="font-size:0.7rem;color:var(--text-muted);margin-bottom:4px;font-weight:700;">${total}M</div>
                <div style="width:100%;height:${totalH}%;display:flex;flex-direction:column;border-radius:6px 6px 0 0;overflow:hidden;">
                  <div style="background:#10b981;height:${(d.shopee/total)*100}%;" title="Shopee: ${d.shopee}M"></div>
                  <div style="background:#f59e0b;height:${(d.tiki/total)*100}%;" title="Tiki: ${d.tiki}M"></div>
                  <div style="background:#0ea5e9;height:${(d.website/total)*100}%;" title="Website: ${d.website}M"></div>
                </div>
                <div class="bar-label" style="font-size:0.75rem;color:var(--text-muted);margin-top:6px;">${d.day}</div>
              </div>
            `;
          }).join('')}
        </div>
        <div style="display:flex;gap:16px;justify-content:center;margin-top:12px;font-size:0.75rem;">
          <span><span class="legend-dot" style="background:#10b981;"></span> Shopee</span>
          <span><span class="legend-dot" style="background:#f59e0b;"></span> Tiki</span>
          <span><span class="legend-dot" style="background:#0ea5e9;"></span> Website</span>
        </div>
      </div>

      <div class="content-card">
        <div class="content-card-title">Báo Cáo Lợi Nhuận (P&L)</div>
        <table class="data-table" style="width:100%;font-size:0.85rem;">
          <thead><tr><th style="text-align:left;">Hạng mục</th><th style="text-align:right;">Giá trị</th><th style="text-align:right;">Trend</th></tr></thead>
          <tbody>
            ${MOCK.pnl.map(p => {
              const trendColor = p.trend==='up'?'var(--accent-emerald)':p.trend==='down'?'var(--accent-rose)':'var(--text-muted)';
              const trendLabel = p.trend==='up'?`↑${p.change}%`:p.trend==='down'?`~${p.change}%`:p.change>0?`~${p.change}%`:'-';
              return `<tr ${p.highlight?'style="background:var(--accent-emerald-bg);font-weight:700;"':p.italic?'style="font-style:italic;color:var(--text-muted);"':''}>
                <td>${p.label}${p.margin?` <span style="color:var(--accent-emerald);font-size:0.75rem;">(Margin ${p.margin}%)</span>`:''}</td>
                <td style="text-align:right;">${fmt.vnd(p.value)}</td>
                <td style="text-align:right;color:${trendColor};">${trendLabel}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="content-card" style="margin-top:20px;">
      <div class="content-card-title">Biên Lợi Nhuận Gộp Theo Sản Phẩm</div>
      <div class="h-bars">
        ${MOCK.margin_by_product.map(p => `
          <div class="h-bar-item">
            <div class="h-bar-label">${p.name}</div>
            <div class="h-bar-track"><div class="h-bar-fill" style="width:${p.margin}%;background:${p.color};"></div></div>
            <div class="h-bar-value">${p.margin}%</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ===== Inventory Page =====
function renderInventory() {
  const k = MOCK.inventory_kpis;
  return `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-card-label">Tổng Kho</div><div class="stat-card-value">${k.total.toLocaleString()}</div></div>
      <div class="stat-card"><div class="stat-card-label">Giá Trị Kho</div><div class="stat-card-value">${fmt.currency(k.value)}đ</div></div>
      <div class="stat-card" style="border-color:var(--accent-amber);"><div class="stat-card-label">Sắp Hết Cần Nhập</div><div class="stat-card-value" style="color:var(--accent-amber);">${k.low_stock} SKU</div></div>
      <div class="stat-card" style="border-color:var(--accent-rose);"><div class="stat-card-label">Tồn Lâu (Khó bán)</div><div class="stat-card-value" style="color:var(--accent-rose);">${k.slow_moving} SKU</div></div>
    </div>

    <div style="margin-top:16px;background:var(--bg-glass);padding:12px 16px;border-radius:var(--radius-sm);font-size:0.85rem;">
      📊 <strong>Vòng quay tồn kho trung bình:</strong> ${k.turnover_days} ngày &nbsp;·&nbsp; <strong>ABC Analysis:</strong> 23 SKU loại A (78% doanh thu), 89 SKU loại B, 122 SKU loại C
    </div>

    <div class="grid-2" style="margin-top:20px;">
      <div class="content-card">
        <div class="content-card-title">⚠️ Cảnh Báo Sắp Hết Hàng</div>
        <table class="data-table" style="width:100%;font-size:0.85rem;">
          <thead><tr><th>Sản phẩm</th><th>SL</th><th>Turnover</th></tr></thead>
          <tbody>
            ${MOCK.inventory_low.map(i => `
              <tr><td>${i.sku}</td><td style="color:var(--accent-rose);font-weight:700;">${i.qty}</td><td style="color:${i.days<=4?'var(--accent-rose)':'var(--accent-amber)'};">${i.days} ngày</td></tr>
            `).join('')}
          </tbody>
        </table>
        <button class="btn-approve" style="margin-top:12px;width:100%;" id="btnRestock">🤖 AI Soạn Yêu Cầu Nhập Hàng</button>
      </div>

      <div class="content-card">
        <div class="content-card-title">📦 Cảnh Báo Tồn Lâu (Cần Đẩy)</div>
        ${MOCK.inventory_slow.map(i => `
          <div style="padding:12px;border:1px solid var(--border-primary);border-radius:var(--radius-sm);margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <strong>${i.sku}</strong>
              <span style="color:var(--accent-rose);font-weight:700;">${i.days} ngày</span>
            </div>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">Tồn: ${i.qty} cái</div>
            <div style="margin-top:8px;padding:8px;background:var(--accent-amber-bg);border-radius:4px;font-size:0.8rem;">
              <strong>${ICON.brain} AI lý giải:</strong> ${i.ai_reason}<br>
              <strong>Đề xuất:</strong> ${i.ai_action}
            </div>
          </div>
        `).join('')}
        <button class="btn-approve" style="width:100%;">🛒 AI Lên Kế Hoạch Xả Kho</button>
      </div>
    </div>
  `;
}

// ===== Competitor Page =====
let currentCompetitorProduct = 'Son Kem Lì GIAO FARA';
function renderCompetitor() {
  const data = MOCK.competitor_prices[currentCompetitorProduct] || MOCK.competitor_prices['Son Kem Lì GIAO FARA'];
  const max = Math.max(...data.history);
  const min = Math.min(...data.history);
  const range = max - min || 1;
  const points = data.history.map((v, i) => `${(i/(data.history.length-1))*100},${100 - ((v-min)/range)*80 - 10}`).join(' ');

  return `
    <div style="margin-bottom:16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
      <label style="font-size:0.85rem;font-weight:600;">📦 Chọn sản phẩm theo dõi:</label>
      <select id="compProductSelect" class="settings-input" style="max-width:280px;">
        ${MOCK.competitor_products.map(p => `<option ${p===currentCompetitorProduct?'selected':''}>${p}</option>`).join('')}
      </select>
      <button class="btn-approve" style="margin-left:auto;">+ Theo dõi đối thủ mới</button>
    </div>

    <div class="grid-2">
      <div class="content-card">
        <div class="content-card-title">⚡ Hoạt động đối thủ — Live</div>
        <div class="activity-timeline">
          ${MOCK.competitors.map(c => `
            <div class="activity-item">
              <div class="activity-dot" style="background:${c.color};"></div>
              <div style="flex:1;">
                <div style="font-weight:700;">${c.name}</div>
                <div class="activity-text">${c.activity}</div>
                <div class="activity-time">${c.time}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="content-card">
        <div class="content-card-title">📈 Lịch sử giá 7 ngày — ${currentCompetitorProduct}</div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:160px;background:var(--bg-glass);border-radius:8px;padding:8px;box-sizing:border-box;">
          <polyline fill="none" stroke="#eab308" stroke-width="1.2" points="${points}"/>
          ${data.history.map((v,i) => `<circle cx="${(i/(data.history.length-1))*100}" cy="${100 - ((v-min)/range)*80 - 10}" r="1.2" fill="#eab308"/>`).join('')}
        </svg>
        <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--text-muted);margin-top:6px;">
          <span>7 ngày trước (${fmt.vnd(data.history[0])})</span>
          <span>Hôm nay (${fmt.vnd(data.history[data.history.length-1])})</span>
        </div>
      </div>
    </div>

    <div class="content-card" style="margin-top:20px;">
      <div class="content-card-title">💱 So sánh giá hiện tại — ${currentCompetitorProduct}</div>
      <table class="data-table" style="width:100%;font-size:0.85rem;">
        <thead><tr><th>Shop</th><th style="text-align:right;">Giá cũ</th><th style="text-align:right;">Giá mới</th><th style="text-align:right;">Khoảng cách với bạn</th><th>AI Đánh giá</th></tr></thead>
        <tbody>
          ${data.shops.map((s, i) => {
            const isMe = i === 0;
            const gapColor = s.gap < -3 ? 'var(--accent-rose)' : s.gap < 0 ? 'var(--accent-amber)' : 'var(--accent-emerald)';
            return `<tr ${isMe?'style="background:var(--accent-amber-bg);font-weight:700;"':''}>
              <td>${isMe?'⭐ ':''}${s.name}</td>
              <td style="text-align:right;">${s.old?fmt.vnd(s.old):'-'}</td>
              <td style="text-align:right;font-weight:700;">${fmt.vnd(s.new)}</td>
              <td style="text-align:right;color:${isMe?'var(--text-muted)':gapColor};">${isMe?'-':(s.gap>0?'+':'')+s.gap+'%'}</td>
              <td>${isMe?'<em>Shop của bạn</em>':s.gap < -3?'<span style="color:var(--accent-rose);">⚠ Cạnh tranh mạnh</span>':s.gap < 0?'<span style="color:var(--accent-amber);">Theo dõi</span>':'<span style="color:var(--accent-emerald);">An toàn</span>'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      <div style="margin-top:12px;padding:12px;background:var(--accent-amber-bg);border-radius:8px;font-size:0.85rem;">
        ${ICON.brain} <strong>AI khuyến nghị:</strong> Hoàng Hà đang bán rẻ hơn 5%. Đề xuất giảm 4% + tặng kèm ốp Spigen để giữ margin 11%. → <a href="#" data-nav="ai-suggestions" style="color:var(--accent-indigo);font-weight:700;">Xem đề xuất chi tiết</a>
      </div>
    </div>
  `;
}

// ===== Reviews Page =====
function renderReviews() {
  const k = MOCK.reviews_kpi;

  // Lọc reviews theo sản phẩm đang chọn
  const filteredReviews = _reviewProductFilter
    ? MOCK.reviews.filter(r => r.product_id === _reviewProductFilter.id)
    : MOCK.reviews;

  const filterLabel = _reviewProductFilter ? _reviewProductFilter.name : '';

  return `
    <!-- ── Search bar lọc sản phẩm ── -->
    <div style="margin-bottom:16px;position:relative;">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <label style="font-size:0.85rem;font-weight:600;white-space:nowrap;">🔍 Lọc theo sản phẩm:</label>
        <div style="position:relative;flex:1;max-width:380px;">
          <input
            id="reviewProductSearch"
            type="text"
            class="settings-input"
            placeholder="Gõ tên hoặc mã SKU để tìm sản phẩm..."
            value="${filterLabel}"
            autocomplete="off"
            oninput="_onReviewSearchInput(this.value)"
            onfocus="_onReviewSearchFocus(this.value)"
            onblur="_onReviewSearchBlur()"
            style="width:100%;padding-right:32px;"
          />
          ${_reviewProductFilter ? `
          <button onclick="_clearReviewFilter()" title="Xóa bộ lọc"
            style="position:absolute;right:8px;top:50%;transform:translateY(-50%);
                   background:none;border:none;cursor:pointer;font-size:1rem;color:var(--text-muted);line-height:1;">✕</button>
          ` : `
          <span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:0.8rem;color:var(--text-muted);pointer-events:none;">▾</span>
          `}
          <!-- Suggestion dropdown -->
          <div id="reviewProductSuggestions"
            style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:999;
                   background:var(--bg-card);border:1.5px solid var(--accent-indigo);border-radius:10px;
                   box-shadow:0 8px 24px rgba(0,0,0,0.15);overflow:hidden;max-height:280px;overflow-y:auto;">
          </div>
        </div>
        ${_reviewProductFilter ? `
        <span style="font-size:0.78rem;color:var(--accent-indigo);background:var(--accent-indigo-bg,#eef2ff);
              padding:4px 10px;border-radius:10px;font-weight:600;">
          ${filteredReviews.length} review · ${_reviewProductFilter.id}
        </span>` : `
        <span style="font-size:0.78rem;color:var(--text-muted);">Tất cả ${MOCK.reviews.length} reviews</span>
        `}
      </div>
    </div>

    <div class="grid-2">
      <div class="content-card" style="text-align:center;">
        <div style="font-size:3.5rem;font-weight:800;color:var(--text-heading);margin:8px 0;">${k.rating}</div>
        <div style="color:var(--accent-amber);font-size:1.2rem;letter-spacing:4px;">★★★★★</div>
        <div style="color:var(--text-muted);margin-top:8px;font-size:0.85rem;">${k.count.toLocaleString()} Đánh giá</div>
        <div style="margin-top:12px;padding:8px;background:var(--accent-emerald-bg);border-radius:6px;font-size:0.8rem;color:var(--accent-emerald);">
          ↑ Tăng ${k.trend_pos}% sentiment tích cực so với tháng trước
        </div>
      </div>

      <div class="content-card">
        <div class="content-card-title">${ICON.brain} Phân tích Cảm xúc (AI Sentiment)</div>
        <div class="rating-bars">
          <div class="rating-bar-row"><div class="rating-bar-label">😊</div><div class="rating-bar-track"><div class="rating-bar-fill" style="width:${k.positive}%;background:#10b981;"></div></div><div class="rating-bar-count">${k.positive}%</div></div>
          <div class="rating-bar-row"><div class="rating-bar-label">😐</div><div class="rating-bar-track"><div class="rating-bar-fill" style="width:${k.neutral}%;background:#f59e0b;"></div></div><div class="rating-bar-count">${k.neutral}%</div></div>
          <div class="rating-bar-row"><div class="rating-bar-label">😡</div><div class="rating-bar-track"><div class="rating-bar-fill" style="width:${k.negative}%;background:#ef4444;"></div></div><div class="rating-bar-count">${k.negative}%</div></div>
        </div>
        <div data-sentiment-tags style="margin-top:14px;display:flex;gap:6px;flex-wrap:wrap;">
          ${MOCK.review_tags_pos.map(t => `<span class="tag-item" style="background:var(--accent-emerald-bg);color:var(--accent-emerald);">✅ ${t}</span>`).join('')}
          ${MOCK.review_tags_neg.map(t => `<span class="tag-item" style="background:var(--accent-rose-bg);color:var(--accent-rose);">❌ ${t}</span>`).join('')}
        </div>
      </div>
    </div>

    <div class="content-card" style="margin-top:20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <div class="content-card-title" style="margin:0;">⭐ Reviews Nổi Bật</div>
        <div style="display:flex;align-items:center;gap:8px;font-size:0.78rem;color:var(--text-muted);">
          <span style="width:8px;height:8px;border-radius:50%;background:#10b981;display:inline-block;"></span>Đã phản hồi
          <span style="width:8px;height:8px;border-radius:50%;background:#f59e0b;display:inline-block;margin-left:6px;"></span>Chờ duyệt
          <span style="width:8px;height:8px;border-radius:50%;background:#94a3b8;display:inline-block;margin-left:6px;"></span>Chưa có
        </div>
      </div>
      ${filteredReviews.length === 0 ? `
        <div style="text-align:center;padding:40px 20px;color:var(--text-muted);">
          <div style="font-size:2rem;margin-bottom:8px;">📭</div>
          <div style="font-weight:600;">Không có review nào cho sản phẩm này</div>
          <div style="font-size:0.8rem;margin-top:4px;">Thử chọn sản phẩm khác hoặc xóa bộ lọc</div>
        </div>` : ''}
      <div class="grid-2" style="gap:14px;">
        ${filteredReviews.map(r => {
          const ar = r.auto_reply;
          // Xác định trạng thái auto-reply
          const replyStatus = ar
            ? (ar.status === 'approved' || ar.reply_type === 'positive' ? 'done'
               : ar.status === 'pending' ? 'pending' : 'none')
            : 'none';
          const replyStatusBadge = replyStatus === 'done'
            ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:0.7rem;font-weight:700;color:#10b981;background:rgba(16,185,129,0.1);padding:2px 8px;border-radius:10px;">✅ Đã phản hồi</span>`
            : replyStatus === 'pending'
            ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:0.7rem;font-weight:700;color:#f59e0b;background:rgba(245,158,11,0.1);padding:2px 8px;border-radius:10px;">⏳ Chờ duyệt</span>`
            : `<span style="font-size:0.7rem;color:var(--text-muted);">—</span>`;

          // Nội dung phần auto-reply mở rộng bên dưới review card
          const autoReplySection = ar ? `
            <div class="review-auto-reply-panel" style="margin-top:12px;border-top:1px solid var(--border-primary);padding-top:10px;">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;cursor:pointer;" onclick="this.parentElement.querySelector('.review-reply-body').classList.toggle('hidden')">
                <span style="font-size:0.72rem;font-weight:700;color:var(--accent-indigo);">💬 Phản hồi AI đã soạn</span>
                <span style="font-size:0.65rem;color:var(--text-muted);">(nhấn để xem/ẩn)</span>
              </div>
              <div class="review-reply-body">
                <div style="background:var(--bg-glass);border-radius:8px;padding:10px;font-size:0.78rem;color:var(--text-secondary);line-height:1.6;margin-bottom:6px;border-left:3px solid ${ar.reply_type==='positive'?'#10b981':'#f59e0b'};">
                  <div style="font-size:0.67rem;font-weight:700;color:var(--text-muted);margin-bottom:4px;">📢 PHẢN HỒI CÔNG KHAI (Review section)</div>
                  "${ar.public_reply}"
                </div>
                ${ar.inbox_message ? `
                <div style="background:rgba(99,102,241,0.06);border-radius:8px;padding:10px;font-size:0.78rem;color:var(--text-secondary);line-height:1.6;border-left:3px solid var(--accent-indigo);">
                  <div style="font-size:0.67rem;font-weight:700;color:var(--accent-indigo);margin-bottom:4px;">📬 TIN NHẮN RIÊNG (Inbox → Tin nhắn cần duyệt)</div>
                  "${ar.inbox_message}"
                  ${ar.inbox_queued ? `<div style="margin-top:6px;font-size:0.67rem;color:var(--accent-indigo);font-weight:700;">✓ Đã đưa vào Hộp Thư · ID: ${r.author}</div>` : ''}
                </div>` : ''}
                ${replyStatus === 'pending' ? `
                <div style="display:flex;gap:6px;margin-top:8px;">
                  <button class="btn-approve" style="font-size:0.72rem;padding:5px 12px;flex:1;" data-action="approve-review-reply" data-author="${r.author}">✅ Duyệt & Gửi</button>
                  <button class="btn-sug-detail" style="font-size:0.72rem;padding:5px 12px;" data-action="edit-review-reply" data-author="${r.author}">✏️ Sửa</button>
                </div>` : ''}
              </div>
            </div>` : '';

          return `
          <div class="review-card">
            <div class="review-card-header">
              <strong class="review-card-author">${r.author}</strong>
              <span class="review-card-date">${r.date}</span>
            </div>
            ${r.product_name ? `<div style="font-size:0.72rem;color:var(--accent-indigo);font-weight:600;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${r.product_name}">📦 ${r.product_name}</div>` : ''}
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
              <div class="star-display" style="color:var(--accent-amber);">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div>
              ${replyStatusBadge}
            </div>
            <p class="review-card-text">${r.text}</p>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
              <span class="tag-item" style="background:${r.tag.type==='pos'?'var(--accent-emerald-bg)':'var(--accent-rose-bg)'};color:${r.tag.type==='pos'?'var(--accent-emerald)':'var(--accent-rose)'};">
                ${r.tag.type==='pos'?'Điểm khen':'Vấn đề'}: ${r.tag.label}
              </span>
              ${!ar ? `<button class="btn-sug-detail" data-action="ai-reply" data-author="${r.author}" data-db-id="${r.db_id || ''}">${ICON.brain} AI soạn phản hồi</button>` : ''}
            </div>
            ${autoReplySection}
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

// ===== Review Product Search Logic =====
let _reviewSearchBlurTimer = null;

function _onReviewSearchInput(query) {
  _showReviewSuggestions(query);
}

function _onReviewSearchFocus(query) {
  _showReviewSuggestions(query);
}

function _onReviewSearchBlur() {
  // Delay để click suggestion kịp kích hoạt trước khi ẩn
  _reviewSearchBlurTimer = setTimeout(() => {
    const el = document.getElementById('reviewProductSuggestions');
    if (el) el.style.display = 'none';
  }, 200);
}

function _showReviewSuggestions(query) {
  const el = document.getElementById('reviewProductSuggestions');
  if (!el) return;

  const kw = (query || '').toLowerCase().trim();

  // Deduplicate theo product_id để không hiện 2 dòng cho cùng 1 sản phẩm
  const seen = new Set();
  const matches = PRODUCT_CATALOG.filter(p => {
    if (seen.has(p.id)) return false;
    const hit = !kw
      || p.name.toLowerCase().includes(kw)
      || p.id.toLowerCase().includes(kw)
      || p.sku.toLowerCase().includes(kw)
      || p.category.toLowerCase().includes(kw);
    if (hit) { seen.add(p.id); return true; }
    return false;
  });

  if (!matches.length) {
    el.innerHTML = `<div style="padding:12px 16px;font-size:0.82rem;color:var(--text-muted);">Không tìm thấy sản phẩm phù hợp</div>`;
    el.style.display = 'block';
    return;
  }

  // Thêm dòng "Tất cả sản phẩm" ở đầu nếu đang có filter
  const allRow = _reviewProductFilter
    ? `<div onclick="_selectReviewProduct(null)" style="
          padding:10px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;
          border-bottom:1px solid var(--border-primary);font-size:0.82rem;color:var(--text-muted);
          transition:background 0.15s;" onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background=''">
        ✕ Xóa bộ lọc — hiện tất cả sản phẩm
      </div>` : '';

  el.innerHTML = allRow + matches.map(p => {
    const reviewCount = MOCK.reviews.filter(r => r.product_id === p.id).length;
    const isActive = _reviewProductFilter && _reviewProductFilter.id === p.id;
    return `
      <div onclick="_selectReviewProduct('${p.id}', '${p.name.replace(/'/g, "\\'")}')"
        style="padding:10px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;
               border-bottom:1px solid var(--border-primary);
               background:${isActive ? 'var(--accent-indigo-bg,#eef2ff)' : ''};
               transition:background 0.15s;"
        onmouseover="this.style.background='var(--bg-secondary)'"
        onmouseout="this.style.background='${isActive ? 'var(--accent-indigo-bg,#eef2ff)' : ''}'">
        <div style="flex:1;min-width:0;">
          <div style="font-size:0.83rem;font-weight:${isActive ? '700' : '600'};
                      color:${isActive ? 'var(--accent-indigo)' : 'var(--text-primary)'};
                      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${isActive ? '✓ ' : ''}${p.name}
          </div>
          <div style="font-size:0.7rem;color:var(--text-muted);margin-top:1px;">${p.id} · ${p.category} · ${p.sku}</div>
        </div>
        ${reviewCount > 0 ? `<span style="font-size:0.7rem;background:var(--accent-rose-bg);color:var(--accent-rose);
          padding:2px 7px;border-radius:8px;white-space:nowrap;flex-shrink:0;">${reviewCount} review</span>` : ''}
      </div>`;
  }).join('');

  el.style.display = 'block';
}

function _selectReviewProduct(productId, productName) {
  clearTimeout(_reviewSearchBlurTimer);
  // Ẩn dropdown
  const el = document.getElementById('reviewProductSuggestions');
  if (el) el.style.display = 'none';

  if (!productId) {
    _reviewProductFilter = null;
  } else {
    _reviewProductFilter = { id: productId, name: productName };
  }

  // Re-render trang reviews
  if (typeof _origNavigate === 'function') {
    _origNavigate('reviews');
  } else if (typeof navigate === 'function') {
    navigate('reviews');
  }

  // Cập nhật stats (rating, count, sentiment bars) cho sản phẩm đang chọn
  if (typeof loadReviewSentimentStats === 'function') {
    loadReviewSentimentStats(productId || null);
  }

  // Đặt lại focus + giá trị input sau re-render
  requestAnimationFrame(() => {
    const inp = document.getElementById('reviewProductSearch');
    if (inp) {
      inp.value = _reviewProductFilter ? _reviewProductFilter.name : '';
      inp.focus();
    }
    if (typeof injectReviewForm === 'function') injectReviewForm();
  });
}

function _clearReviewFilter() {
  _selectReviewProduct(null);
}

// ===== Media & Ads Page =====
function renderMedia() {
  const k = MOCK.ads_kpi;
  return `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-card-label">Ngân sách Tuần</div><div class="stat-card-value">${fmt.currency(k.budget_week)}đ</div></div>
      <div class="stat-card"><div class="stat-card-label">Đã Tiêu</div><div class="stat-card-value">${fmt.currency(k.spent)}đ</div></div>
      <div class="stat-card"><div class="stat-card-label">Doanh thu mang về</div><div class="stat-card-value" style="color:var(--accent-emerald);">${fmt.currency(k.revenue)}đ</div></div>
      <div class="stat-card"><div class="stat-card-label">ROAS</div><div class="stat-card-value" style="color:var(--accent-amber);">${k.roas}x</div></div>
    </div>

    <div class="content-card" style="margin-top:20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <div class="content-card-title" style="margin:0;">📈 Hiệu Suất Quảng Cáo</div>
        <button class="btn-approve">${ICON.brain} AI Phân bổ lại ngân sách tối ưu</button>
      </div>
      <table class="data-table" style="width:100%;font-size:0.85rem;">
        <thead><tr><th>Campaign</th><th>Kênh</th><th style="text-align:right;">Chi phí</th><th style="text-align:right;">Chuyển đổi</th><th style="text-align:right;">ROAS</th><th>AI Action</th></tr></thead>
        <tbody>
          ${MOCK.ads_campaigns.map(c => {
            const aMap = {
              scale: { color:'#10b981', bg:'var(--accent-emerald-bg)', label:'⬆ Tự Build Scale budget' },
              maintain: { color:'#0ea5e9', bg:'rgba(14,165,233,0.15)', label:'→ Duy trì' },
              cut: { color:'#ef4444', bg:'var(--accent-rose-bg)', label:'⬇ Tự Cắt giảm' }
            }[c.action];
            return `<tr>
              <td><strong>${c.name}</strong></td>
              <td>${c.channel}</td>
              <td style="text-align:right;">${fmt.vnd(c.cost)}</td>
              <td style="text-align:right;">${c.conv} đơn</td>
              <td style="text-align:right;font-weight:700;color:${c.roas>=3?'var(--accent-emerald)':'var(--accent-rose)'};">${c.roas}x</td>
              <td>
                <span class="table-badge" style="background:${aMap.bg};color:${aMap.color};cursor:help;" title="${c.ai_reason}">${aMap.label}</span>
                <div style="font-size:0.7rem;color:var(--text-muted);margin-top:4px;">${c.ai_reason}</div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>

    <div class="content-card" style="margin-top:16px;">
      <div class="content-card-title">📊 Dự báo nếu phân bổ lại</div>
      <p style="font-size:0.9rem;color:var(--text-secondary);">Nếu chuyển 1.7M ngân sách từ "Son Bóng Mã 04" (ROAS 0.8x) sang "Son Kem Lì GIAO FARA" (ROAS 12.5x), AI dự báo:</p>
      <div class="grid-3" style="margin-top:12px;">
        <div class="big-metric"><div class="big-metric-value" style="color:var(--accent-emerald);">+8.2M</div><div class="big-metric-label">Doanh thu thêm/tuần</div></div>
        <div class="big-metric"><div class="big-metric-value" style="color:var(--accent-emerald);">9.1x</div><div class="big-metric-label">ROAS trung bình mới</div></div>
        <div class="big-metric"><div class="big-metric-value" style="color:var(--accent-emerald);">+12 đơn</div><div class="big-metric-label">Số đơn dự kiến/tuần</div></div>
      </div>
    </div>
  `;
}

// ===== Chat Page (Smart Multi-Agent Demo) =====
let currentChatId = null;   // set to first real customer after backend loads
let chatFilter = 'all';
let chatDraftEditMode = false;  // true khi đang ở chế độ chỉnh sửa nháp

function sentimentBar(score) {
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';
  const label = score >= 70 ? '😊' : score >= 40 ? '😐' : '😡';
  return `<div style="display:flex;align-items:center;gap:6px;">
    <span>${label}</span>
    <div style="flex:1;height:4px;background:#e5e7eb;border-radius:2px;">
      <div style="width:${score}%;height:100%;background:${color};border-radius:2px;"></div>
    </div>
    <span style="font-size:0.7rem;font-weight:700;color:${color};">${score}</span>
  </div>`;
}

function priorityDot(p) {
  const map = {0:'#ef4444',1:'#f59e0b',2:'#10b981',3:'#0ea5e9'};
  const lbl = {0:'Khẩn',1:'Cao',2:'TB',3:'Thấp'};
  return `<span style="display:inline-flex;align-items:center;gap:3px;font-size:0.65rem;font-weight:700;color:${map[p]};">
    <span style="width:6px;height:6px;border-radius:50%;background:${map[p]};display:inline-block;"></span>${lbl[p]}
  </span>`;
}

function renderChat() {
  // Nếu chưa có conversation nào (backend chưa load xong) → hiển thị skeleton
  if (!MOCK.conversations.length) {
    return `
      <div style="display:flex;align-items:center;justify-content:center;height:400px;flex-direction:column;gap:16px;color:var(--text-muted);">
        <div style="font-size:2rem;">📬</div>
        <div style="font-size:1rem;font-weight:700;">Đang tải hộp thư...</div>
        <div style="font-size:0.8rem;">Đang kết nối backend và tải danh sách khách hàng</div>
      </div>`;
  }

  // Ensure currentChatId points to a valid conversation
  if (!currentChatId || !MOCK.conversations.find(c => c.id === currentChatId)) {
    currentChatId = MOCK.conversations[0].id;
  }

  const conv = MOCK.conversations.find(c => c.id === currentChatId);
  const messages = MOCK.chat_messages[currentChatId] || [];
  const filtered = chatFilter === 'all' ? MOCK.conversations
    : chatFilter === 'pending' ? MOCK.conversations.filter(c => c.status === 'pending')
    : chatFilter === 'escalate' ? MOCK.conversations.filter(c => c.status === 'escalate')
    : MOCK.conversations.filter(c => c.status === 'auto');

  return `
    <!-- ── Top KPI Strip ── -->
    <div class="stats-grid" style="margin-bottom:16px;">
      <div class="stat-card" style="padding:14px 18px;">
        <div class="stat-card-label">Tin nhắn hôm nay</div>
        <div class="stat-card-value" style="font-size:1.4rem;">847</div>
        <span class="stat-card-trend" style="color:var(--accent-emerald);background:var(--accent-emerald-bg);">↑ 91% tự động</span>
      </div>
      <div class="stat-card" style="padding:14px 18px;">
        <div class="stat-card-label">Thời gian phản hồi TB</div>
        <div class="stat-card-value" style="font-size:1.4rem;color:var(--accent-emerald);">12s</div>
        <span style="font-size:0.72rem;color:var(--text-muted);">↓ từ 8 phút trước khi dùng AI</span>
      </div>
      <div class="stat-card" style="padding:14px 18px;border-color:var(--accent-rose);">
        <div class="stat-card-label">⚠ Chờ xử lý khẩn</div>
        <div class="stat-card-value" style="font-size:1.4rem;color:var(--accent-rose);">2</div>
        <span style="font-size:0.72rem;color:var(--accent-rose);">Lê C: 51p · Hoàng Mạnh: 71p</span>
      </div>
      <div class="stat-card" style="padding:14px 18px;">
        <div class="stat-card-label">Doanh thu từ chat hôm nay</div>
        <div class="stat-card-value" style="font-size:1.4rem;color:var(--accent-amber);">+18.5M</div>
        <span style="font-size:0.72rem;color:var(--text-muted);">từ 43 cuộc hội thoại AI chốt đơn</span>
      </div>
    </div>

    <!-- ── 3-Panel Layout ── -->
    <div style="display:grid;grid-template-columns:300px 1fr 280px;gap:16px;min-height:620px;">

      <!-- Panel 1: Conversation List -->
      <div class="content-card" style="padding:0;overflow:hidden;display:flex;flex-direction:column;">
        <div style="padding:14px 16px;border-bottom:1px solid var(--border-primary);">
          <div style="font-weight:700;font-size:0.9rem;margin-bottom:10px;">Hộp Thư — Smart AI</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            ${['all','escalate','pending','auto'].map(f => {
              const lMap = {all:'Tất cả',escalate:'🔴 Khẩn',pending:'🟡 Chờ duyệt',auto:'✅ Tự động'};
              const cnt = f==='all'?MOCK.conversations.length:MOCK.conversations.filter(c=>c.status===f).length;
              return `<button class="ai-sug-tab small ${chatFilter===f?'active':''}" data-chatfilter="${f}" style="font-size:0.7rem;padding:4px 8px;">${lMap[f]} ${cnt}</button>`;
            }).join('')}
          </div>
        </div>
        <div style="overflow-y:auto;flex:1;">
          ${filtered.map(c => {
            const urgentColor = c.priority===0?'var(--accent-rose)':c.priority===1?'var(--accent-amber)':'transparent';
            return `
            <div class="chat-conv-item ${c.id===currentChatId?'active':''}" data-conv="${c.id}"
                 style="border-left:3px solid ${urgentColor};padding:12px 12px 10px;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;width:100%;">
                <div style="display:flex;gap:8px;align-items:flex-start;flex:1;min-width:0;">
                  <div class="chat-conv-avatar" style="flex-shrink:0;width:34px;height:34px;font-size:0.85rem;">${c.avatar}</div>
                  <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
                      <span style="font-weight:700;font-size:0.83rem;">${c.name}</span>
                      ${c.vip?'<span title="VIP" style="color:var(--accent-amber);font-size:0.7rem;">⭐</span>':''}
                      ${c.returning?'<span title="Khách quen" style="font-size:0.65rem;color:var(--accent-blue);background:rgba(14,165,233,0.1);padding:1px 4px;border-radius:3px;">QUEN</span>':''}
                    </div>
                    <div style="font-size:0.75rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px;">${c.preview}</div>
                    <div style="display:flex;gap:6px;align-items:center;margin-top:4px;flex-wrap:wrap;">
                      ${priorityDot(c.priority)}
                      <span style="font-size:0.65rem;color:var(--text-muted);">${c.category}</span>
                    </div>
                  </div>
                </div>
                <div style="text-align:right;flex-shrink:0;margin-left:6px;">
                  <div style="font-size:0.7rem;color:var(--text-muted);">${c.time}</div>
                  ${c.wait_min>0?`<div style="font-size:0.65rem;font-weight:700;color:${c.wait_min>45?'var(--accent-rose)':'var(--accent-amber)'};">⏱ ${c.wait_min}p</div>`:''}
                  ${c.unread?`<div style="width:8px;height:8px;border-radius:50%;background:var(--accent-rose);margin:4px 0 0 auto;"></div>`:''}
                </div>
              </div>
              <div style="margin-top:6px;">${sentimentBar(c.sentiment)}</div>
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- Panel 2: Chat Detail -->
      <div class="content-card" style="padding:0;overflow:hidden;display:flex;flex-direction:column;">
        <!-- Header -->
        <div style="padding:12px 16px;border-bottom:1px solid var(--border-primary);background:var(--bg-glass);">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-weight:700;font-size:0.95rem;">${conv.name}
                ${conv.vip?'<span style="color:var(--accent-amber);font-size:0.75rem;">⭐ VIP</span>':''}
                ${conv.angry?'<span style="color:var(--accent-rose);font-size:0.75rem;">😡 Cảm xúc tiêu cực</span>':''}
              </div>
              <div style="display:flex;gap:12px;margin-top:2px;font-size:0.72rem;color:var(--text-muted);">
                <span>📦 ${conv.platform}</span>
                <span>🏷 ${conv.category}</span>
                ${conv.wait_min>0?`<span style="color:${conv.wait_min>45?'var(--accent-rose)':'var(--accent-amber)'};">⏱ Chờ ${conv.wait_min} phút</span>`:'<span style="color:var(--accent-emerald);">✅ Đã phản hồi</span>'}
              </div>
            </div>
            <div style="display:flex;gap:6px;">
              <button class="btn-chat-action" style="font-size:0.75rem;padding:6px 10px;">✅ Đóng</button>
              <button class="btn-chat-action" style="font-size:0.75rem;padding:6px 10px;">🏷 Gắn tag</button>
            </div>
          </div>
        </div>

        <!-- Messages -->
        <div class="chat-detail-messages" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;">
          ${messages.map(m => {
            if (m.from === 'customer') {
              return `<div style="align-self:flex-start;max-width:85%;">
                <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:4px;">${conv.name} · ${m.time}</div>
                <div class="chat-bubble" style="background:#f1f5f9;padding:10px 14px;border-radius:0 12px 12px 12px;">${m.text}</div>
              </div>`;
            }
            if (m.from === 'ai_thinking') {
              return `<div style="background:linear-gradient(135deg,rgba(234,179,8,0.08),rgba(234,179,8,0.03));padding:12px 14px;border-radius:10px;border-left:3px solid var(--accent-amber);">
                <div style="font-weight:700;color:var(--accent-indigo);font-size:0.8rem;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
                  ${ICON.brain} <span>Context AI đang phân tích</span>
                </div>
                ${m.context?`<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">
                  ${m.context.map(cx=>`<div style="font-size:0.72rem;color:var(--text-secondary);padding:3px 6px;background:rgba(255,255,255,0.6);border-radius:4px;">${cx}</div>`).join('')}
                </div>`:''}
              </div>`;
            }
            if (m.from === 'ai_draft') {
              if (chatDraftEditMode) {
                // ── CHẾ ĐỘ CHỈNH SỬA ──
                return `<div style="background:rgba(99,102,241,0.07);padding:14px;border-radius:10px;border-left:3px solid var(--accent-indigo);">
                  <div style="font-weight:700;font-size:0.78rem;color:var(--accent-indigo);margin-bottom:8px;">
                    ✏️ Đang chỉnh sửa nháp AI — Sửa xong nhấn Gửi
                  </div>
                  <textarea id="chatDraftEditArea" style="width:100%;min-height:90px;border-radius:8px;padding:10px;font-size:0.86rem;
                    line-height:1.6;border:1px solid var(--accent-indigo);background:var(--bg-card);
                    color:var(--text-primary);resize:vertical;font-family:inherit;">${m.text}</textarea>
                  <div style="display:flex;gap:8px;margin-top:10px;">
                    <button class="btn-chat-send-edited btn-approve" style="flex:1;">✅ Gửi bản đã sửa</button>
                    <button class="btn-chat-cancel-edit btn-modal-cancel" style="padding:8px 14px;">✕ Hủy</button>
                  </div>
                </div>`;
              }
              // ── CHẾ ĐỘ XEM THƯỜNG ──
              return `<div style="background:var(--accent-emerald-bg);padding:14px;border-radius:10px;border-left:3px solid var(--accent-emerald);">
                <div style="display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:0.78rem;color:var(--accent-emerald);margin-bottom:8px;">
                  <span>🤖 NHÁP AI — Chờ duyệt</span>
                  ${m.confidence?`<span style="background:var(--accent-emerald);color:white;padding:2px 8px;border-radius:10px;font-size:0.7rem;">Confidence ${m.confidence}%</span>`:''}
                </div>
                <div style="color:var(--text-primary);line-height:1.6;margin-bottom:12px;font-size:0.88rem;">${m.text}</div>
                <div style="display:flex;gap:8px;">
                  <button class="btn-chat-accept" style="flex:1;">✅ Gửi ngay</button>
                  <button class="btn-chat-edit" style="flex:1;">✏ Sửa nháp</button>
                  <button class="btn-chat-deny" data-action="deny-chat" style="padding:8px 12px;border-radius:8px;border:1px solid var(--border-primary);background:var(--bg-glass);cursor:pointer;font-size:0.85rem;">❌</button>
                </div>
              </div>`;
            }
            if (m.from === 'ai_sent') {
              // Badge hiển thị confidence + trạng thái tự động gửi
              const _conf = (m.confidence !== undefined && m.confidence !== null) ? m.confidence : null;
              const _isSafe = m.is_safe;
              let _metaBadge = '';
              if (_conf !== null || _isSafe !== null) {
                _metaBadge = `<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;justify-content:flex-end;">` +
                  (_conf !== null
                    ? `<span style="font-size:0.67rem;padding:2px 6px;border-radius:4px;
                        background:${_conf >= 70 ? 'var(--accent-emerald-bg)' : 'var(--accent-rose-bg)'};
                        color:${_conf >= 70 ? 'var(--accent-emerald)' : 'var(--accent-rose)'};">
                        🎯 Confidence: ${_conf}%</span>`
                    : '') +
                  (_isSafe === true
                    ? `<span style="font-size:0.67rem;padding:2px 6px;border-radius:4px;
                        background:var(--accent-emerald-bg);color:var(--accent-emerald);">
                        ✅ Được gửi tự động</span>`
                    : (_isSafe === null || _isSafe === undefined)
                      ? ''
                      : '') +
                  `</div>`;
              }
              return `<div style="align-self:flex-end;max-width:85%;">
                <div style="font-size:0.7rem;color:var(--accent-emerald);margin-bottom:4px;text-align:right;">
                  🤖 AI Agent · ${m.time}${m.edited?' · ✏ Đã chỉnh sửa':''}
                </div>
                <div class="chat-bubble" style="background:var(--accent-emerald-bg);padding:10px 14px;border-radius:12px 0 12px 12px;border:1px solid var(--accent-emerald)40;">
                  ${m.text}
                  ${_metaBadge}
                </div>
              </div>`;
            }
            if (m.from === 'shop_owner') {
              return `<div style="align-self:flex-end;max-width:85%;">
                <div style="font-size:0.7rem;color:var(--accent-indigo);margin-bottom:4px;text-align:right;">👤 Chủ shop · ${m.time}</div>
                <div class="chat-bubble" style="background:rgba(99,102,241,0.1);padding:10px 14px;border-radius:12px 0 12px 12px;border:1px solid rgba(99,102,241,0.3);">${m.text}</div>
              </div>`;
            }
            if (m.from === 'system') {
              return `<div style="background:var(--accent-rose-bg);padding:10px 14px;border-radius:8px;font-size:0.82rem;color:var(--accent-rose);font-weight:600;">${m.text}</div>`;
            }
            return '';
          }).join('')}
        </div>

        <!-- Input -->
        <div style="padding:12px 14px;border-top:1px solid var(--border-primary);">
          <div style="display:flex;gap:8px;">
            <input type="text" id="chatMsgInput" class="settings-input" style="flex:1;font-size:0.85rem;" placeholder="Nhập tin nhắn hoặc ra lệnh cho AI...">
            <button class="btn-approve" data-action="chat-send-msg" style="white-space:nowrap;">Gửi →</button>
          </div>
          <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
            ${['Xin lỗi + hỗ trợ đổi hàng','Gửi link bảo hành','Báo giá sỉ','Xác nhận đơn hàng'].map(t=>`<button class="guidance-tag" data-chattemplate="${t}" style="font-size:0.7rem;padding:4px 8px;">${t}</button>`).join('')}
          </div>
        </div>
      </div>

      <!-- Panel 3: Customer Context Sidebar -->
      <div style="display:flex;flex-direction:column;gap:12px;">

        <!-- Profile + Purchase History — replaced by api_integration.js when a backend customer is active -->
        <div id="chatConvProfileWrapper" style="display:flex;flex-direction:column;gap:12px;">
          <!-- Customer Profile -->
          <div class="content-card" style="padding:14px;">
            <div style="font-weight:700;font-size:0.82rem;color:var(--text-muted);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px;">Hồ sơ khách hàng</div>
            <div style="display:flex;gap:10px;align-items:center;margin-bottom:12px;">
              <div style="width:40px;height:40px;border-radius:50%;background:var(--gradient-primary);display:flex;align-items:center;justify-content:center;font-weight:800;color:#451a03;flex-shrink:0;">${conv.avatar}</div>
              <div>
                <div style="font-weight:700;font-size:0.9rem;">${conv.name}</div>
                <div style="font-size:0.72rem;color:var(--text-muted);">${conv.platform} · ${conv.orders} đơn hàng</div>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
              <div style="background:var(--bg-glass);border-radius:8px;padding:8px;text-align:center;">
                <div style="font-size:1rem;font-weight:800;color:var(--accent-amber);">${fmt.currency(conv.ltv)}đ</div>
                <div style="font-size:0.68rem;color:var(--text-muted);">Tổng chi tiêu</div>
              </div>
              <div style="background:var(--bg-glass);border-radius:8px;padding:8px;text-align:center;">
                <div style="font-size:1rem;font-weight:800;color:${conv.customer.risk==='high'?'var(--accent-rose)':conv.customer.risk==='medium'?'var(--accent-amber)':'var(--accent-emerald)'};">${conv.customer.churn}</div>
                <div style="font-size:0.68rem;color:var(--text-muted);">Xác suất rời bỏ</div>
              </div>
            </div>
            <div style="font-size:0.75rem;padding:8px;background:${conv.customer.risk==='high'?'var(--accent-rose-bg)':conv.customer.risk==='medium'?'var(--accent-amber-bg)':'var(--accent-emerald-bg)'};border-radius:6px;color:${conv.customer.risk==='high'?'var(--accent-rose)':conv.customer.risk==='medium'?'var(--accent-amber)':'var(--accent-emerald)'};">
              ${ICON.brain} ${conv.customer.note}
            </div>
          </div>

          <!-- Purchase History -->
          <div class="content-card" style="padding:14px;">
            <div style="font-weight:700;font-size:0.82rem;color:var(--text-muted);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px;">Lịch sử mua hàng</div>
            ${conv.customer.purchases.map(p => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-primary);font-size:0.78rem;">
                <div>
                  <div style="font-weight:600;">${p.item}</div>
                  <div style="color:var(--text-muted);">${p.date}</div>
                </div>
                <div style="font-weight:700;color:var(--accent-indigo);">${fmt.currency(p.value)}đ</div>
              </div>
            `).join('')}
          </div>
        </div><!-- /#chatConvProfileWrapper -->

        <!-- AI Recommended Action -->
        <div class="content-card" style="padding:14px;border-color:var(--accent-amber);">
          <div style="font-weight:700;font-size:0.82rem;color:var(--accent-indigo);margin-bottom:10px;">${ICON.brain} Hành động AI đề xuất</div>
          ${conv.status==='escalate'?`
            <div style="font-size:0.8rem;line-height:1.6;">
              <div style="color:var(--accent-rose);font-weight:700;margin-bottom:6px;">🚨 Cần xử lý ngay</div>
              <div style="color:var(--text-secondary);">1. Xác nhận đơn hàng và kiểm tra lỗi</div>
              <div style="color:var(--text-secondary);">2. Gửi lời xin lỗi + cam kết xử lý 24h</div>
              <div style="color:var(--text-secondary);">3. Đề xuất đổi hàng hoặc hoàn tiền</div>
              <div style="color:var(--text-secondary);">4. Gắn tag "Lỗi lô hàng" để theo dõi</div>
            </div>
            <button class="btn-approve" style="width:100%;margin-top:10px;">Áp dụng kịch bản xử lý</button>
          `:conv.status==='pending'?`
            <div style="font-size:0.8rem;line-height:1.6;color:var(--text-secondary);">
              Đề xuất tối ưu doanh thu từ khách VIP:<br>Giảm 4% + tặng ốp Spigen → margin vẫn giữ 11%
            </div>
            <button class="btn-approve" style="width:100%;margin-top:10px;">Dùng đề xuất AI</button>
          `:`
            <div style="font-size:0.8rem;color:var(--text-secondary);">Cuộc hội thoại đang được xử lý tốt. Không cần can thiệp.</div>
          `}
        </div>
      </div>
    </div>

    <!-- ── Issue Clusters (AI Pattern Detection) ── -->
    <div class="content-card" style="margin-top:20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <div class="content-card-title" style="margin:0;">${ICON.brain} Vấn đề nổi cộm — AI phát hiện từ toàn bộ chat (7 ngày)</div>
        <span style="font-size:0.75rem;color:var(--text-muted);">Từ 847 cuộc hội thoại</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:0;">
        ${MOCK.chat_clusters.map((cl,i) => `
          <div style="display:flex;align-items:center;gap:14px;padding:12px 0;${i<MOCK.chat_clusters.length-1?'border-bottom:1px solid var(--border-primary);':''}">
            <div style="font-size:1.2rem;flex-shrink:0;">${cl.icon}</div>
            <div style="flex:1;">
              <div style="display:flex;align-items:center;gap:8px;">
                <strong style="font-size:0.88rem;">${cl.label}</strong>
                <span style="background:${cl.urgent?'var(--accent-rose-bg)':'var(--accent-amber-bg)'};color:${cl.urgent?'var(--accent-rose)':'var(--accent-amber)'};font-size:0.68rem;font-weight:700;padding:2px 6px;border-radius:4px;">${cl.count} khách</span>
              </div>
              <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">Impact: ${cl.impact}</div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <div style="font-size:0.75rem;color:var(--accent-indigo);font-weight:600;margin-bottom:4px;">→ ${cl.action}</div>
              <button class="alert-cta" style="font-size:0.72rem;">Xử lý ngay</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- ── Proactive Outreach ── -->
    <div class="content-card" style="margin-top:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <div class="content-card-title" style="margin:0;">📣 AI gợi ý chủ động liên hệ (Proactive Outreach)</div>
        <button class="btn-approve">Gửi tất cả</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:0;">
        ${MOCK.proactive_targets.map((t,i) => `
          <div style="display:flex;align-items:center;gap:14px;padding:12px 0;${i<MOCK.proactive_targets.length-1?'border-bottom:1px solid var(--border-primary);':''}">
            <div style="width:36px;height:36px;border-radius:50%;background:var(--accent-indigo-bg);color:var(--accent-indigo);display:flex;align-items:center;justify-content:center;font-weight:800;flex-shrink:0;">${t.name[0]}</div>
            <div style="flex:1;">
              <div style="font-weight:700;font-size:0.85rem;">${t.name}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);">${t.reason}</div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <div style="font-size:0.78rem;font-weight:700;color:var(--accent-emerald);margin-bottom:6px;">${t.value}</div>
              <button class="alert-cta">${t.action} →</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}


// ===== Crisis Center Page =====
// Toàn bộ dữ liệu và UI được quản lý bởi loadCrisisFromBackend() trong api_integration.js.
// Hàm này chỉ trả về container rỗng để api_integration.js điền vào sau khi tải dữ liệu.
let currentCrisisProductId = null;   // ID sản phẩm đang chọn (dạng "P011", không còn dùng cr-001)

function renderCrisisCenter() {
  // ĐÃ DEPRECATED — giữ lại để ROUTES không bị lỗi; nội dung thực do loadCrisisFromBackend() sinh.
  const crisis = null; // không dùng MOCK.crises nữa

  return `
    <!-- Shell container — api_integration.js sẽ điền nội dung thực vào đây -->
    <div id="crisisCenterShell">
      <div class="content-card" style="text-align:center;padding:32px 20px;">
        <div style="font-size:2rem;margin-bottom:10px;">🛡</div>
        <div style="font-weight:700;font-size:1rem;color:var(--text-primary);margin-bottom:6px;">
          Trung tâm Khủng hoảng
        </div>
        <div style="color:var(--text-muted);font-size:0.82rem;">
          ⏳ Đang tải dữ liệu tín hiệu rủi ro...
        </div>
      </div>
    </div>
  `;
  // --- DEAD CODE BELOW (được giữ lại như bản lưu trữ, không bao giờ chạy) ---
  const _DEAD_crisis_id_DO_NOT_USE = 'cr-001';
  const c = '#ef4444';
}

// ===== Settings Page (4 Tabs) =====
let currentSettingsTab = 'business';
function renderSettings() {
  return `
    <div class="settings-tabs">
      <button class="settings-tab ${currentSettingsTab==='business'?'active':''}" data-stab="business">🏢 Thông tin doanh nghiệp</button>
      <button class="settings-tab ${currentSettingsTab==='ai'?'active':''}" data-stab="ai">${ICON.brain} Cấu hình AI Agent</button>
      <button class="settings-tab ${currentSettingsTab==='platforms'?'active':''}" data-stab="platforms">🔗 Kết nối sàn</button>
      <button class="settings-tab ${currentSettingsTab==='team'?'active':''}" data-stab="team">👥 Phân quyền & Bảo mật</button>
    </div>
    <div id="settingsTabContent">${renderSettingsTab()}</div>
  `;
}

function renderSettingsTab() {
  if (currentSettingsTab === 'business') {
    return `
      <div class="content-card">
        <div class="content-card-title">Hồ sơ doanh nghiệp</div>
        <div style="display:flex;gap:24px;align-items:flex-start;margin-bottom:20px;">
          <div class="logo-upload">
            <div class="logo-upload-circle" id="settingsLogoAvatar" style="width:80px;height:80px;border-radius:50%;background:var(--gradient-primary);display:flex;align-items:center;justify-content:center;font-size:1.8rem;font-weight:800;color:#451a03;">GF</div>
            <button class="btn-modal-cancel" style="margin-top:8px;">Đổi logo</button>
          </div>
          <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:14px;">
            <div class="settings-field"><label class="settings-label">Tên shop</label><input class="settings-input" value="Shop Mỹ phẩm GIAO FARA"></div>
            <div class="settings-field"><label class="settings-label">Mã số thuế</label><input class="settings-input" value="0301234567"></div>
            <div class="settings-field" style="grid-column:1/-1;"><label class="settings-label">Địa chỉ kho hàng</label><input class="settings-input" value="123 Nguyễn Trãi, Q.1, TP.HCM"></div>
            <div class="settings-field"><label class="settings-label">Ngành hàng chính</label>
              <select class="settings-input"><option>Mỹ phẩm</option><option>Điện tử & Phụ kiện</option><option>Thời trang</option><option>Gia dụng</option></select>
            </div>
            <div class="settings-field"><label class="settings-label">Số nhân viên vận hành</label><input class="settings-input" type="number" value="3"></div>
            <div class="settings-field"><label class="settings-label">Số SKU đang bán</label><input class="settings-input" type="number" value="234"></div>
            <div class="settings-field"><label class="settings-label">Mục tiêu doanh thu tháng (VNĐ)</label><input class="settings-input" type="number" value="3200000000"></div>
          </div>
        </div>
        <button class="btn-approve">💾 Lưu thay đổi</button>
      </div>
    `;
  }
  if (currentSettingsTab === 'ai') {
    return `
      <div class="content-card">
        <div class="content-card-title">Dữ liệu định hướng cho AI Agent</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div class="settings-field" style="grid-column:1/-1;"><label class="settings-label">Khách hàng mục tiêu</label><textarea class="settings-input" rows="2">Nữ 18-35 tuổi, yêu làm đẹp, thu nhập 6-20 triệu/tháng, mua sắm qua Shopee/TikTok</textarea></div>
          <div class="settings-field" style="grid-column:1/-1;"><label class="settings-label">Định hướng chiến lược</label><textarea class="settings-input" rows="3">Ưu tiên biên lợi nhuận cao ở nhóm son và phấn phủ. Đẩy mạnh nội dung swatch/review thực tế. Không bao giờ giảm giá Son Kem Lì xuống dưới ngưỡng biên 15%.</textarea></div>
          <div class="settings-field"><label class="settings-label">Ngưỡng biên LN tối thiểu (%)</label><input class="settings-input" type="number" value="8"><small style="color:var(--text-muted);font-size:0.75rem;">AI sẽ KHÔNG đề xuất giảm giá xuống dưới ngưỡng này</small></div>
          <div class="settings-field"><label class="settings-label">Ngưỡng ROAS tối thiểu</label><input class="settings-input" type="number" step="0.1" value="3.0"><small style="color:var(--text-muted);font-size:0.75rem;">Campaign dưới ngưỡng → AI tự động cắt</small></div>
          <div class="settings-field"><label class="settings-label">Tone Chatbot</label>
            <select class="settings-input"><option>Lịch sự, nhiệt tình, sử dụng nhiều emoji thân thiện</option><option>Chuyên nghiệp, ngắn gọn</option><option>Gen Z, vui vẻ</option></select>
          </div>
          <div class="settings-field"><label class="settings-label">Ngôn ngữ phản hồi</label>
            <select class="settings-input"><option>Tiếng Việt</option><option>Song ngữ Việt-Anh</option></select>
          </div>
          <div class="settings-field" style="grid-column:1/-1;"><label class="settings-label">Từ khóa cấm trong phản hồi (cách nhau bởi dấu phẩy)</label><input class="settings-input" value="MobileWorld, TechZone, Hoàng Hà, hàng giả, lừa đảo"></div>
        </div>
        <button class="btn-approve" style="margin-top:14px;">💾 Lưu cấu hình AI</button>
      </div>
    `;
  }
  if (currentSettingsTab === 'platforms') {
    return `
      <div class="platform-grid">
        ${MOCK.platforms.map(p => `
          <div class="platform-card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
              <div style="display:flex;gap:10px;align-items:center;">
                <div style="width:40px;height:40px;border-radius:8px;background:${p.color}22;color:${p.color};display:flex;align-items:center;justify-content:center;font-weight:800;">${p.name[0]}</div>
                <strong>${p.name}</strong>
              </div>
              <span class="status-badge" style="background:${p.connected?'var(--accent-emerald-bg)':'var(--accent-amber-bg)'};color:${p.connected?'var(--accent-emerald)':'var(--accent-amber)'};">${p.connected?'Đã kết nối':'Chưa kết nối'}</span>
            </div>
            ${p.connected ? `
              <div class="platform-details" style="font-size:0.8rem;color:var(--text-muted);line-height:1.8;">
                <div>📅 Ngày kết nối: ${p.connected_date}</div>
                <div>📦 SKU đang sync: <strong>${p.sku_synced}</strong></div>
                <div>💰 Doanh thu tháng: <strong>${fmt.currency(p.revenue)}đ</strong></div>
              </div>
              <button class="btn-platform-disconnect" style="margin-top:10px;width:100%;">Ngắt kết nối</button>
            ` : `
              <div class="connect-steps" style="font-size:0.8rem;line-height:1.8;">
                <div class="connect-step"><span class="connect-step-num">1</span> Đăng nhập ${p.name} Seller Center</div>
                <div class="connect-step"><span class="connect-step-num">2</span> Vào Cài đặt → API → Tạo API Key</div>
                <div class="connect-step"><span class="connect-step-num">3</span> Dán API Key vào Agicom</div>
              </div>
              <button class="btn-approve" style="margin-top:10px;width:100%;">+ Kết nối ngay</button>
            `}
          </div>
        `).join('')}
      </div>
    `;
  }
  if (currentSettingsTab === 'team') {
    const _keySet = typeof _adminApiKey !== 'undefined' && _adminApiKey.length > 0;
    const _keyPreview = _keySet ? _adminApiKey.slice(0, 4) + '••••••••' + _adminApiKey.slice(-4) : '';
    return `
      <!-- ── API Key Card ── -->
      <div class="content-card" style="margin-bottom:16px;border:1.5px solid ${_keySet ? 'var(--accent-emerald)' : 'var(--accent-amber)'};">
        <div class="content-card-title">🔑 Admin API Key</div>
        <p style="font-size:0.82rem;color:var(--text-muted);margin:0 0 14px;">
          Key này được gửi kèm header <code>X-API-Key</code> với mọi request cần quyền admin
          (reset dữ liệu, duyệt phản hồi, xem hồ sơ khách...).
          Lấy giá trị từ biến môi trường <code>ADMIN_API_KEY</code> trên Render.
        </p>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <div style="position:relative;flex:1;min-width:220px;">
            <input
              id="adminApiKeyInput"
              type="password"
              class="settings-input"
              placeholder="${_keySet ? _keyPreview : 'Nhập Admin API Key...'}"
              autocomplete="new-password"
              style="width:100%;padding-right:40px;"
            />
            <button
              onclick="(function(){const inp=document.getElementById('adminApiKeyInput');inp.type=inp.type==='password'?'text':'password';})()"
              title="Hiện/ẩn key"
              style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:1rem;color:var(--text-muted);">👁</button>
          </div>
          <button class="btn-approve" onclick="_saveApiKeyFromInput()" style="white-space:nowrap;">💾 Lưu Key</button>
          ${_keySet ? `<button class="btn-modal-cancel" onclick="_clearApiKey()" style="white-space:nowrap;">🗑 Xóa Key</button>` : ''}
        </div>
        <div style="margin-top:10px;display:flex;align-items:center;gap:8px;font-size:0.8rem;">
          ${_keySet
            ? `<span style="color:var(--accent-emerald);font-weight:700;">✅ Key đã được lưu</span>
               <span style="color:var(--text-muted);">(${_keyPreview})</span>
               <button onclick="_testApiKey()" class="btn-sug-detail" style="font-size:0.72rem;padding:3px 10px;margin-left:4px;">🔍 Kiểm tra kết nối</button>`
            : `<span style="color:var(--accent-amber);font-weight:700;">⚠️ Chưa có key — các tính năng admin sẽ bị từ chối (401)</span>`
          }
        </div>
      </div>

      <div class="content-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <div class="content-card-title" style="margin:0;">👥 Thành viên (${MOCK.team_members.length})</div>
          <button class="btn-approve">+ Mời thành viên</button>
        </div>
        <table class="data-table" style="width:100%;font-size:0.85rem;">
          <thead><tr><th>Tên</th><th>Email</th><th>Vai trò</th><th></th></tr></thead>
          <tbody>
            ${MOCK.team_members.map(m => `<tr>
              <td><strong>${m.name}</strong></td>
              <td>${m.email}</td>
              <td><span class="table-badge" style="background:${m.role==='Admin'?'var(--accent-rose-bg)':m.role==='Vận hành'?'var(--accent-amber-bg)':'var(--bg-glass)'};color:${m.role==='Admin'?'var(--accent-rose)':m.role==='Vận hành'?'var(--accent-amber)':'var(--text-muted)'};">${m.role}</span></td>
              <td><button class="btn-modal-cancel">Sửa</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <div class="content-card" style="margin-top:16px;">
        <div class="content-card-title">📜 Lịch sử hoạt động AI 7 ngày gần nhất</div>
        <div class="activity-timeline">
          ${MOCK.recent_activity.map(a => {
            const sColor = a.status==='approved'?'var(--accent-emerald)':a.status==='rejected'?'var(--accent-rose)':'var(--accent-amber)';
            return `<div class="activity-item">
              <div class="activity-dot" style="background:${sColor};"></div>
              <div style="flex:1;">
                <div style="font-weight:600;font-size:0.85rem;">${a.action}</div>
                <div class="activity-time">${a.user} · ${a.time} trước</div>
              </div>
              <span class="status-badge" style="background:${sColor}22;color:${sColor};">${a.status==='approved'?'Duyệt':a.status==='rejected'?'Từ chối':'Chờ duyệt'}</span>
            </div>`;
          }).join('')}
        </div>
      </div>
    `;
  }
}

// ===== AI Performance Page =====
function renderAIPerformance() {
  const p = MOCK.ai_perf;
  return `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-card-label">Tổng đề xuất đã thực thi (30 ngày)</div><div class="stat-card-value">${p.total_executed}</div></div>
      <div class="stat-card"><div class="stat-card-label">Tỷ lệ đề xuất được duyệt</div><div class="stat-card-value" style="color:var(--accent-emerald);">${p.approval_rate}%</div></div>
      <div class="stat-card"><div class="stat-card-label">Doanh thu tăng nhờ AI</div><div class="stat-card-value" style="color:var(--accent-amber);">+${fmt.currency(p.revenue_added)}đ</div></div>
      <div class="stat-card"><div class="stat-card-label">Thời gian phản hồi CSKH</div><div class="stat-card-value">${p.response_time_after}s</div><small style="color:var(--accent-emerald);">↓ từ ${p.response_time_before}s trước AI</small></div>
    </div>

    <div class="content-card" style="margin-top:20px;">
      <div class="content-card-title">📊 Hiệu suất theo loại Agent</div>
      <table class="data-table" style="width:100%;font-size:0.85rem;">
        <thead><tr><th>Agent</th><th style="text-align:right;">Số đề xuất</th><th style="text-align:right;">Tỷ lệ duyệt</th><th>Kết quả</th><th>Trend</th></tr></thead>
        <tbody>
          ${MOCK.ai_perf_by_agent.map(a => `<tr>
            <td><strong>${a.icon} ${a.name}</strong></td>
            <td style="text-align:right;">${a.total}</td>
            <td style="text-align:right;color:${a.approved>=80?'var(--accent-emerald)':a.approved>=70?'var(--accent-amber)':'var(--accent-rose)'};font-weight:700;">${a.approved}%</td>
            <td>${a.result}</td>
            <td>${a.trend==='up'?'<span style="color:var(--accent-emerald);">↑ Cải thiện</span>':'<span style="color:var(--text-muted);">→ Ổn định</span>'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <div class="content-card" style="margin-top:20px;">
      <div class="content-card-title">📈 Biểu đồ học hỏi theo thời gian (Tỷ lệ duyệt theo tuần)</div>
      <div class="bar-chart" style="display:flex;gap:12px;align-items:flex-end;height:200px;padding:20px 8px 8px;">
        ${[58, 64, 69, 73, 76, 81, 84].map((v, i) => `
          <div class="bar-col" style="flex:1;display:flex;flex-direction:column;align-items:center;height:100%;justify-content:flex-end;">
            <div class="bar-value" style="font-size:0.75rem;color:var(--text-muted);margin-bottom:4px;font-weight:700;">${v}%</div>
            <div class="bar-fill" style="width:100%;height:${v}%;background:linear-gradient(180deg,#10b981 0%,#34d399 100%);border-radius:6px 6px 0 0;"></div>
            <div class="bar-label" style="font-size:0.7rem;color:var(--text-muted);margin-top:6px;">T${i+1}</div>
          </div>
        `).join('')}
      </div>
      <div style="margin-top:14px;padding:12px;background:var(--accent-emerald-bg);border-radius:8px;font-size:0.85rem;">
        ${ICON.brain} <strong>AI đã học từ 142 quyết định.</strong> Độ chính xác đề xuất tăng <strong>+26%</strong> so với tháng trước. Bước "Learn" trong vòng lặp Observe→Think→Plan→Act→Learn đang vận hành hiệu quả.
      </div>
    </div>
  `;
}

/* =====================================================================
   5. ROUTER
   ===================================================================== */

// ===== Stub pages for new routes =====
function stubPage(title, icon, desc, comingSoon) {
  const items = comingSoon.map(f =>
    '<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border-primary);">'
    + '<div style="width:8px;height:8px;border-radius:50%;background:var(--accent-amber);flex-shrink:0;"></div>'
    + '<div style="font-size:0.88rem;color:var(--text-secondary);">' + f + '</div>'
    + '<span style="margin-left:auto;font-size:0.7rem;background:var(--accent-amber-bg);color:var(--accent-amber);padding:2px 8px;border-radius:10px;font-weight:700;">Sắp ra mắt</span>'
    + '</div>'
  ).join('');
  return '<div class="content-card" style="max-width:600px;margin:40px auto;text-align:center;padding:40px 32px;">'
    + '<div style="font-size:3rem;margin-bottom:16px;">' + icon + '</div>'
    + '<div style="font-size:1.3rem;font-weight:800;color:var(--text-heading);margin-bottom:8px;">' + title + '</div>'
    + '<div style="color:var(--text-muted);font-size:0.9rem;margin-bottom:24px;">' + desc + '</div>'
    + '<div style="text-align:left;border-top:1px solid var(--border-primary);padding-top:16px;">' + items + '</div>'
    + '</div>';
}

function renderMarketOverview() {
  const trends = MOCK.market_trends;
  const gaps = MOCK.competitor_gaps;
  const totalChatSignals = trends.reduce((s,t) => s + t.chatbot_count, 0);
  const totalReviewSignals = trends.reduce((s,t) => s + t.review_count, 0);
  const highPrioOpps = trends.filter(t => t.sentiment_pct.negative > 40 || t.trend_pct > 20).length;

  function sentBar(neg, neu, pos) {
    return '<div style="display:flex;border-radius:4px;overflow:hidden;height:8px;width:100%;margin-top:6px;">'
      + '<div style="width:' + pos + '%;background:#10b981;" title="Tích cực"></div>'
      + '<div style="width:' + neu + '%;background:#94a3b8;" title="Trung tính"></div>'
      + '<div style="width:' + neg + '%;background:#ef4444;" title="Tiêu cực"></div>'
      + '</div>'
      + '<div style="display:flex;gap:10px;margin-top:4px;">'
      + '<span style="font-size:0.68rem;color:#10b981;">✓ Tích cực ' + pos + '%</span>'
      + '<span style="font-size:0.68rem;color:#94a3b8;">Trung tính ' + neu + '%</span>'
      + '<span style="font-size:0.68rem;color:#ef4444;">Lo ngại ' + neg + '%</span>'
      + '</div>';
  }

  function trendIcon(dir, pct) {
    if (dir === 'up') return '<span style="color:#ef4444;font-size:0.75rem;font-weight:700;">▲ +' + pct + '% tuần này</span>';
    return '<span style="color:#94a3b8;font-size:0.75rem;">→ Ổn định</span>';
  }

  function priorityBadge(t) {
    const score = t.chatbot_count + t.review_count;
    if (score > 50 || t.sentiment_pct.negative > 50) return '<span style="background:#fef2f2;color:#ef4444;font-size:0.68rem;font-weight:700;padding:2px 8px;border-radius:10px;">🔴 ƯU TIÊN CAO</span>';
    if (score > 25 || t.trend_pct > 20) return '<span style="background:#fffbeb;color:#f59e0b;font-size:0.68rem;font-weight:700;padding:2px 8px;border-radius:10px;">🟡 TRUNG BÌNH</span>';
    return '<span style="background:#f0fdf4;color:#10b981;font-size:0.68rem;font-weight:700;padding:2px 8px;border-radius:10px;">🟢 THEO DÕI</span>';
  }

  // Build opportunities from trends (intersecting chatbot + review)
  const opportunities = trends
    .filter(t => t.chatbot_count > 5)
    .sort((a,b) => (b.chatbot_count + b.review_count) - (a.chatbot_count + a.review_count))
    .slice(0, 3);

  const oppCards = [
    {
      title: 'Tạo video "Test pin S24 Ultra — 72 giờ thực tế"',
      signal1: { label: '23 câu hỏi chatbot', detail: '"Pin dùng được mấy tiếng?" — câu hỏi #1 trong 7 ngày', color: '#6366f1', icon: '💬' },
      signal2: { label: '23 reviews lo ngại pin', detail: '74% review tiêu cực về pin khi zoom camera', color: '#10b981', icon: '⭐' },
      action: 'Quay video TikTok + blog test thực tế 72h',
      score: 94, impact: 'CR tăng dự kiến +8-12%'
    },
    {
      title: 'Tạo trang giá sỉ B2B chính thức',
      signal1: { label: '12 câu hỏi chatbot', detail: '"Lấy 5 cái có giảm không?" — xu hướng tăng 45%', color: '#6366f1', icon: '💬' },
      signal2: { label: 'Đối thủ Hoàng Hà đã có', detail: 'Khách tham khảo Hoàng Hà vì họ có bảng giá sỉ công khai', color: '#f59e0b', icon: '⚡' },
      action: 'Tạo landing page giá sỉ + form liên hệ đại lý',
      score: 78, impact: 'Mở kênh B2B +5-8 đơn/tháng'
    },
    {
      title: 'Video unbox kiểm tra tem auth chính hãng',
      signal1: { label: '17 câu hỏi chatbot', detail: '"Hàng có auth không?" — lo ngại phổ biến nhất', color: '#6366f1', icon: '💬' },
      signal2: { label: '12 reviews tích cực', detail: 'Khách đã mua đánh giá cao hàng auth — nên amplify', color: '#10b981', icon: '⭐' },
      action: 'Video unbox live + thêm ảnh tem vào listing',
      score: 71, impact: 'Tăng trust score, giảm 45% câu hỏi'
    }
  ];

  let html = '<div class="content-card" style="margin-bottom:20px;">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">'
    + '<div><div class="content-card-title" style="margin-bottom:4px;">🏪 Tổng quan ngành hàng — Phân tích đa nguồn</div>'
    + '<div style="font-size:0.8rem;color:var(--text-muted);">AI tổng hợp từ ' + totalChatSignals + ' tín hiệu chatbot + ' + totalReviewSignals + ' tín hiệu review → phát hiện ' + highPrioOpps + ' cơ hội ưu tiên cao</div>'
    + '</div>'
    + '<div style="display:flex;gap:12px;">'
    + '<div style="text-align:center;padding:10px 16px;background:var(--bg-secondary);border-radius:8px;"><div style="font-size:1.4rem;font-weight:800;color:var(--accent-indigo);">' + totalChatSignals + '</div><div style="font-size:0.7rem;color:var(--text-muted);">Tín hiệu Chatbot</div></div>'
    + '<div style="text-align:center;padding:10px 16px;background:var(--bg-secondary);border-radius:8px;"><div style="font-size:1.4rem;font-weight:800;color:var(--accent-emerald);">' + totalReviewSignals + '</div><div style="font-size:0.7rem;color:var(--text-muted);">Tín hiệu Review</div></div>'
    + '<div style="text-align:center;padding:10px 16px;background:var(--bg-secondary);border-radius:8px;"><div style="font-size:1.4rem;font-weight:800;color:var(--accent-amber);">' + highPrioOpps + '</div><div style="font-size:0.7rem;color:var(--text-muted);">Cơ hội ưu tiên cao</div></div>'
    + '</div></div></div>';

  // ---- SECTION 1: Industry Trend Cards ----
  html += '<div style="margin-bottom:8px;font-size:0.82rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">📈 Xu hướng ngành hàng — Top 5 chủ đề nóng</div>';
  html += '<div class="grid-2" style="gap:16px;margin-bottom:24px;">';
  trends.forEach(function(t, i) {
    html += '<div style="background:var(--bg-primary);border:1px solid var(--border-primary);border-radius:12px;padding:16px;position:relative;">';
    html += '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px;">';
    html += '<div><div style="font-size:0.9rem;font-weight:700;color:var(--text-primary);margin-bottom:4px;">' + t.topic + '</div>';
    html += trendIcon(t.trend_direction, t.trend_pct) + '</div>';
    html += priorityBadge(t) + '</div>';
    html += '<div style="display:flex;gap:12px;margin-bottom:10px;">';
    html += '<div style="flex:1;background:#eef2ff;border-radius:8px;padding:8px;text-align:center;">';
    html += '<div style="font-size:1.1rem;font-weight:800;color:#6366f1;">' + t.chatbot_count + '</div>';
    html += '<div style="font-size:0.68rem;color:#6366f1;">💬 Chatbot</div></div>';
    html += '<div style="flex:1;background:#f0fdf4;border-radius:8px;padding:8px;text-align:center;">';
    html += '<div style="font-size:1.1rem;font-weight:800;color:#10b981;">' + t.review_count + '</div>';
    html += '<div style="font-size:0.68rem;color:#10b981;">⭐ Review</div></div>';
    html += '<div style="flex:1;background:var(--bg-secondary);border-radius:8px;padding:8px;text-align:center;">';
    html += '<div style="font-size:1.1rem;font-weight:800;color:var(--text-primary);">' + (t.chatbot_count + t.review_count) + '</div>';
    html += '<div style="font-size:0.68rem;color:var(--text-muted);">Tổng tín hiệu</div></div>';
    html += '</div>';
    html += '<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:6px;">Cảm xúc khách hàng:</div>';
    html += sentBar(t.sentiment_pct.negative, t.sentiment_pct.neutral, t.sentiment_pct.positive);
    if (t.competitor_note) {
      html += '<div style="margin-top:10px;padding:8px;background:#fffbeb;border-radius:6px;border-left:3px solid #f59e0b;font-size:0.75rem;color:#92400e;">⚡ ' + t.competitor_note + '</div>';
    }
    html += '<div style="margin-top:10px;padding:8px;background:#f8fafc;border-radius:6px;font-size:0.75rem;color:var(--text-secondary);">💡 ' + t.opportunity + '</div>';
    html += '</div>';
  });
  html += '</div>';

  // ---- SECTION 2: Competitor Gap Analysis ----
  html += '<div class="content-card" style="margin-bottom:20px;">';
  html += '<div class="content-card-title">⚡ Gap Analysis — Những gì đối thủ có mà mình chưa có</div>';
  html += '<div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:16px;">Phát hiện từ so sánh câu hỏi chatbot với năng lực hiện tại của đối thủ</div>';
  gaps.forEach(function(g, i) {
    const typeColor = g.gap_type === 'content' ? '#6366f1' : g.gap_type === 'business' ? '#f59e0b' : '#10b981';
    const typeBg = g.gap_type === 'content' ? '#eef2ff' : g.gap_type === 'business' ? '#fffbeb' : '#f0fdf4';
    const typeLabel = g.gap_type === 'content' ? 'Content' : g.gap_type === 'business' ? 'Kinh doanh' : 'Chính sách';
    html += '<div style="display:flex;align-items:center;gap:14px;padding:14px 0;' + (i < gaps.length-1 ? 'border-bottom:1px solid var(--border-primary);' : '') + '">';
    html += '<div style="width:40px;height:40px;border-radius:10px;background:' + typeBg + ';display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0;">' + (g.gap_type === 'content' ? '📹' : g.gap_type === 'business' ? '💼' : '📋') + '</div>';
    html += '<div style="flex:1;">';
    html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><strong style="font-size:0.88rem;">' + g.feature + '</strong>';
    html += '<span style="background:' + typeBg + ';color:' + typeColor + ';font-size:0.68rem;font-weight:700;padding:2px 6px;border-radius:4px;">' + typeLabel + '</span></div>';
    html += '<div style="font-size:0.77rem;color:var(--text-muted);margin-top:2px;">Đối thủ: <strong>' + g.competitor + '</strong></div>';
    html += '<div style="font-size:0.77rem;color:var(--text-secondary);margin-top:2px;">Impact: ' + g.impact + '</div>';
    html += '</div>';
    html += '<div style="text-align:right;flex-shrink:0;">';
    html += '<div style="font-size:1.1rem;font-weight:800;color:#ef4444;">' + g.chatbot_count + '</div>';
    html += '<div style="font-size:0.68rem;color:var(--text-muted);">khách hỏi</div>';
    html += '</div></div>';
  });
  html += '</div>';

  // ---- SECTION 3: Market Opportunities Board ----
  html += '<div class="content-card" style="margin-bottom:20px;">';
  html += '<div class="content-card-title">🎯 Cơ hội thị trường — Đề xuất hành động ưu tiên</div>';
  html += '<div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:16px;">Mỗi cơ hội được tổng hợp từ <strong>2 nguồn dữ liệu độc lập</strong> — chatbot + review — để đảm bảo độ tin cậy cao</div>';
  oppCards.forEach(function(opp, i) {
    const scoreColor = opp.score > 85 ? '#ef4444' : opp.score > 70 ? '#f59e0b' : '#10b981';
    const scoreBg = opp.score > 85 ? '#fef2f2' : opp.score > 70 ? '#fffbeb' : '#f0fdf4';
    html += '<div style="border:1px solid var(--border-primary);border-radius:12px;padding:16px;margin-bottom:12px;position:relative;">';
    html += '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">';
    html += '<div style="flex:1;min-width:200px;">';
    html += '<div style="font-size:0.92rem;font-weight:700;color:var(--text-primary);margin-bottom:10px;">' + opp.title + '</div>';
    // Two signals side by side
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">';
    [opp.signal1, opp.signal2].forEach(function(sig) {
      html += '<div style="background:var(--bg-secondary);border-radius:8px;padding:10px;border-left:3px solid ' + sig.color + ';">';
      html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">';
      html += '<span style="font-size:0.9rem;">' + sig.icon + '</span>';
      html += '<strong style="font-size:0.78rem;color:' + sig.color + ';">' + sig.label + '</strong></div>';
      html += '<div style="font-size:0.73rem;color:var(--text-muted);">' + sig.detail + '</div>';
      html += '</div>';
    });
    html += '</div>';
    html += '<div style="background:#f0fdf4;border-radius:8px;padding:10px;display:flex;align-items:center;gap:8px;">';
    html += '<span style="font-size:0.9rem;">🚀</span>';
    html += '<div><div style="font-size:0.75rem;font-weight:700;color:#10b981;">Hành động đề xuất</div>';
    html += '<div style="font-size:0.78rem;color:#065f46;">' + opp.action + '</div></div>';
    html += '</div></div>';
    // Score + Impact
    html += '<div style="text-align:center;flex-shrink:0;">';
    html += '<div style="width:64px;height:64px;border-radius:50%;background:' + scoreBg + ';border:3px solid ' + scoreColor + ';display:flex;flex-direction:column;align-items:center;justify-content:center;margin:0 auto 8px;">';
    html += '<div style="font-size:1.1rem;font-weight:800;color:' + scoreColor + ';line-height:1;">' + opp.score + '</div>';
    html += '<div style="font-size:0.6rem;color:' + scoreColor + ';">score</div>';
    html += '</div>';
    html += '<div style="font-size:0.68rem;color:var(--text-muted);max-width:100px;">' + opp.impact + '</div>';
    html += '</div></div></div>';
  });
  html += '</div>';

  return html;
}

function renderChatSentiment() {
  return '<div class="content-card" style="margin-bottom:20px;">'
    + '<div class="content-card-title">😊 Sentiment Analysis — Chatbot (7 ngày qua)</div>'
    + '<div class="grid-2" style="gap:20px;margin-top:16px;">'
    + '<div>'
    + '<div style="font-size:0.85rem;font-weight:700;margin-bottom:12px;color:var(--text-muted);">Phân bổ cảm xúc theo ngày</div>'
    + '<div class="bar-chart" style="display:flex;gap:10px;align-items:flex-end;height:160px;padding:16px 0 0;">'
    + ['T2','T3','T4','T5','T6','T7','CN'].map((d,i) => {
        // can't use template literals inside string concat in Python PYEOF - handled differently
        return ''; // placeholder
      }).join('')
    + '</div></div>'
    + '<div>'
    + '<div style="font-size:0.85rem;font-weight:700;margin-bottom:12px;color:var(--text-muted);">Top từ khoá cảm xúc</div>'
    + ['tuyệt vời (89)','nhanh (67)','chất lượng (54)','lỗi (23)','chậm (18)','hỏng (12)'].map((w,i) =>
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">'
        + '<span style="font-size:0.8rem;flex:1;">' + w + '</span>'
        + '<div style="width:' + (i<3?'60':'25') + '%;height:6px;background:' + (i<3?'#10b981':'#ef4444') + ';border-radius:3px;"></div>'
        + '</div>'
      ).join('')
    + '</div></div>'
    + '</div>'
    + renderReviews();
}
function renderChatReport() {
  const insights = MOCK.insights;
  return '<div class="content-card" style="margin-bottom:20px;">'
    + '<div class="content-card-title">📊 Báo cáo thắc mắc & vấn đề thường gặp — AI tổng hợp từ chat</div>'
    + insights.map(i =>
        '<div class="alert-item">'
        + '<div class="alert-icon">' + i.icon + '</div>'
        + '<div class="alert-content"><div class="alert-text"><strong>' + i.title + '</strong></div>'
        + '<div style="font-size:0.8rem;color:var(--text-muted);margin-top:2px;">' + i.detail + '</div></div>'
        + (i.cta ? '<button class="alert-cta">' + i.cta + ' →</button>' : '')
        + '</div>'
      ).join('')
    + '</div>';
}
function renderChatInsights() {
  return '<div class="content-card" style="margin-bottom:20px;">'
    + '<div class="content-card-title">' + ICON.brain + ' Tổng hợp vấn đề từ Chatbot — Pattern Detection</div>'
    + '<div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:16px;">AI phân tích ' + MOCK.ai_today.chats_handled + ' cuộc hội thoại trong 7 ngày, phát hiện các pattern quan trọng:</div>'
    + MOCK.chat_clusters.map((cl,i) =>
        '<div style="display:flex;align-items:center;gap:14px;padding:12px 0;' + (i<MOCK.chat_clusters.length-1?'border-bottom:1px solid var(--border-primary);':'') + '">'
        + '<div style="font-size:1.2rem;">' + cl.icon + '</div>'
        + '<div style="flex:1;">'
        +   '<div style="display:flex;align-items:center;gap:8px;"><strong style="font-size:0.88rem;">' + cl.label + '</strong>'
        +   '<span style="background:' + (cl.urgent?'var(--accent-rose-bg)':'var(--accent-amber-bg)') + ';color:' + (cl.urgent?'var(--accent-rose)':'var(--accent-amber)') + ';font-size:0.68rem;font-weight:700;padding:2px 6px;border-radius:4px;">' + cl.count + ' khách</span></div>'
        +   '<div style="font-size:0.78rem;color:var(--text-muted);">Impact: ' + cl.impact + '</div>'
        + '</div>'
        + '<div style="text-align:right;">'
        +   '<div style="font-size:0.75rem;color:var(--accent-indigo);font-weight:600;margin-bottom:4px;">→ ' + cl.action + '</div>'
        +   '<button class="alert-cta">Xử lý ngay</button>'
        + '</div></div>'
      ).join('')
    + '</div>';
}
function renderContentSuggestions() {
  var activeTab = window._csTab || 'suggestions';

  // Tab bar chung cho cả 2 tab
  var tabBar = '<div style="display:flex;gap:6px;margin-bottom:20px;padding:4px;background:var(--bg-glass);border-radius:12px;border:1px solid var(--border-primary);max-width:fit-content;">'
    + ['suggestions','script'].map(function(t) {
        var isActive = t === activeTab;
        var label = t === 'suggestions' ? '📋 Đề xuất AI' : '🎬 Tạo Script Video';
        return '<button data-cs-tab="' + t + '" style="padding:9px 20px;border-radius:9px;font-size:0.82rem;font-weight:' + (isActive ? '700' : '600') + ';cursor:pointer;border:none;background:' + (isActive ? 'linear-gradient(135deg,#d97706,#eab308)' : 'transparent') + ';color:' + (isActive ? '#1a0800' : 'var(--text-secondary)') + ';transition:all 0.2s;">'
          + label + (t === 'script' && isActive ? '' : '') + '</button>';
      }).join('')
    + '</div>';

  // Gắn sự kiện cho tab buttons sau khi DOM sẵn sàng
  setTimeout(function() {
    document.querySelectorAll('[data-cs-tab]').forEach(function(btn) {
      btn.onclick = function() {
        window._csTab = btn.dataset.csTab;
        navigate('content-suggestions');
      };
    });
  }, 0);

  // Nếu đang ở tab Script → delegate sang renderContentAgent
  if (activeTab === 'script') {
    return tabBar + renderContentAgent();
  }

  // Tab Đề xuất AI (nội dung gốc bên dưới)
  const sugs = MOCK.content_suggestions_generated;
  const pending = sugs.filter(s => s.status === 'pending');
  const saved = sugs.filter(s => s.status === 'saved');
  const clusters = MOCK.chat_clusters;
  const inv = MOCK.content_inventory;

  const typeLabel = {
    tiktok_15s: '⚡ TikTok 15s', tiktok_30s: '🎵 TikTok 30s', tiktok_60s: '🎬 TikTok 60s',
    reels_30s: '📱 Reels 30s', reels_60s: '📱 Reels 60s',
    youtube_short: '▶️ YT Short', shopee_video: '🛒 Shopee Video',
    facebook_post: '📘 FB Post', caption_instagram: '📷 Caption IG',
    // legacy fallbacks
    video: '🎬 Video', blog_faq: '📝 Blog/FAQ', comparison: '⚖️ So sánh', guide: '📋 Hướng dẫn',
  };
  const typeColor = {
    tiktok_15s: '#6366f1', tiktok_30s: '#6366f1', tiktok_60s: '#6366f1',
    reels_30s: '#e1306c', reels_60s: '#e1306c',
    youtube_short: '#ef4444', shopee_video: '#ee4d2d',
    facebook_post: '#1877f2', caption_instagram: '#c13584',
    video: '#6366f1', blog_faq: '#10b981', comparison: '#f59e0b', guide: '#0ea5e9',
  };
  const typeBg = {
    tiktok_15s: '#eef2ff', tiktok_30s: '#eef2ff', tiktok_60s: '#eef2ff',
    reels_30s: '#fdf2f8', reels_60s: '#fdf2f8',
    youtube_short: '#fff1f2', shopee_video: '#fff7f0',
    facebook_post: '#eff6ff', caption_instagram: '#fdf4ff',
    video: '#eef2ff', blog_faq: '#f0fdf4', comparison: '#fffbeb', guide: '#f0f9ff',
  };

  function scoreRing(score) {
    const c = score > 85 ? '#ef4444' : score > 70 ? '#f59e0b' : '#10b981';
    const bg = score > 85 ? '#fef2f2' : score > 70 ? '#fffbeb' : '#f0fdf4';
    return '<div style="width:56px;height:56px;border-radius:50%;background:' + bg + ';border:3px solid ' + c + ';display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;">'
      + '<div style="font-size:1rem;font-weight:800;color:' + c + ';line-height:1;">' + score + '</div>'
      + '<div style="font-size:0.58rem;color:' + c + ';">score</div></div>';
  }

  const scheduled = sugs.filter(function(s) { return s.status === 'scheduled'; });
  const ignored   = sugs.filter(function(s) { return s.status === 'ignored'; });
  const visible   = sugs.filter(function(s) { return s.status !== 'ignored'; });

  // ---- SUMMARY HEADER ----
  let html = '<div class="content-card" style="margin-bottom:20px;">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">'
    + '<div><div class="content-card-title" style="margin-bottom:4px;">✍️ Đề xuất Content — AI phân tích đa nguồn</div>'
    + '<div style="font-size:0.8rem;color:var(--text-muted);">Phân tích ' + clusters.reduce(function(s,c){return s+c.count;},0) + ' câu hỏi chatbot + ' + MOCK.reviews.length + ' reviews → ' + pending.length + ' nội dung cần tạo gấp</div>'
    + '</div>'
    + '<div style="display:flex;gap:10px;flex-wrap:wrap;">'
    + '<div style="text-align:center;padding:10px 14px;background:#fef2f2;border-radius:8px;"><div style="font-size:1.4rem;font-weight:800;color:#ef4444;">' + pending.length + '</div><div style="font-size:0.68rem;color:#ef4444;">Chờ tạo</div></div>'
    + '<div style="text-align:center;padding:10px 14px;background:#fffbeb;border-radius:8px;"><div style="font-size:1.4rem;font-weight:800;color:#f59e0b;">' + saved.length + '</div><div style="font-size:0.68rem;color:#f59e0b;">Đã lưu</div></div>'
    + '<div style="text-align:center;padding:10px 14px;background:#f0fdf4;border-radius:8px;"><div style="font-size:1.4rem;font-weight:800;color:#10b981;">' + scheduled.length + '</div><div style="font-size:0.68rem;color:#10b981;">Đã lên lịch</div></div>'
    + '<div style="text-align:center;padding:10px 14px;background:#f0f9ff;border-radius:8px;"><div style="font-size:1.4rem;font-weight:800;color:#0ea5e9;">' + inv.length + '</div><div style="font-size:0.68rem;color:#0ea5e9;">Đã xuất bản</div></div>'
    + '</div></div></div>';

  // ---- SECTION 1: Content Gap Analyzer ----
  html += '<div class="content-card" style="margin-bottom:20px;">';
  html += '<div class="content-card-title">🔍 Phân tích khoảng trống Content</div>';
  html += '<div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:16px;">So sánh câu hỏi thực tế của khách với kho content hiện có — tìm "lỗ hổng" cần lấp đầy</div>';
  html += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:0.82rem;">';
  html += '<thead><tr style="border-bottom:2px solid var(--border-primary);">'
    + '<th style="text-align:left;padding:8px 12px;font-weight:700;color:var(--text-muted);">Chủ đề khách hỏi</th>'
    + '<th style="text-align:center;padding:8px;font-weight:700;color:#6366f1;">💬 Chatbot</th>'
    + '<th style="text-align:center;padding:8px;font-weight:700;color:#10b981;">⭐ Review</th>'
    + '<th style="text-align:center;padding:8px;font-weight:700;color:var(--text-muted);">Cảm xúc</th>'
    + '<th style="text-align:left;padding:8px 12px;font-weight:700;color:var(--text-muted);">Content hiện có?</th>'
    + '<th style="text-align:center;padding:8px;font-weight:700;color:var(--text-muted);">Hành động</th>'
    + '</tr></thead><tbody>';

  // Xây gap analysis từ MOCK.chat_clusters + reviews + inventory (động)
  var gapData = (MOCK.chat_clusters || []).map(function(cl) {
    var kw0 = cl.label.toLowerCase().split(' ')[0];
    var negRevs = (MOCK.reviews || []).filter(function(r) {
      return r.rating <= 3 && ((r.text || '').toLowerCase().includes(kw0) ||
        (r.product_id || '').toLowerCase().includes(kw0));
    });
    var matchedInv = inv.find(function(c) {
      return c.topic && c.topic.toLowerCase().split('/').some(function(t) {
        return cl.label.toLowerCase().includes(t.trim()) || t.trim().includes(kw0);
      });
    });
    return {
      topic: cl.label,
      chatbot: cl.count,
      review: negRevs.length > 0 ? negRevs.length * 3 : 0,
      neg: negRevs.length > 0 ? Math.min(95, 40 + negRevs.length * 15) : (cl.urgent ? 35 : 8),
      has_content: !!matchedInv,
      content_type: matchedInv ? ((matchedInv.type === 'video' ? 'Video' : 'Blog') + ' (' + (matchedInv.published || '') + ')') : null,
      questions_reduced: matchedInv ? matchedInv.questions_reduced : null,
      content_gap: 'Cần: ' + (cl.action || 'tạo content')
    };
  });

  gapData.forEach(function(row) {
    var sentColor = row.neg > 50 ? '#ef4444' : row.neg > 20 ? '#f59e0b' : '#10b981';
    // Tìm suggestion khớp để liên kết nút "Tạo ngay"
    var kw = row.topic.toLowerCase().split(' ')[0];
    var matchSug = (MOCK.content_suggestions_generated || []).find(function(s) {
      return s.status !== 'ignored' && (s.title || '').toLowerCase().includes(kw);
    });
    html += '<tr style="border-bottom:1px solid var(--border-primary);">';
    html += '<td style="padding:10px 12px;font-weight:600;">' + row.topic + '</td>';
    html += '<td style="text-align:center;padding:10px;"><span style="background:#eef2ff;color:#6366f1;font-weight:700;padding:3px 8px;border-radius:6px;">' + row.chatbot + '</span></td>';
    html += '<td style="text-align:center;padding:10px;"><span style="background:#f0fdf4;color:#10b981;font-weight:700;padding:3px 8px;border-radius:6px;">' + row.review + '</span></td>';
    html += '<td style="text-align:center;padding:10px;"><span style="color:' + sentColor + ';font-size:0.75rem;font-weight:700;">' + row.neg + '% lo ngại</span></td>';
    if (row.has_content) {
      html += '<td style="padding:10px 12px;"><span style="background:#f0fdf4;color:#10b981;font-size:0.72rem;font-weight:700;padding:3px 8px;border-radius:6px;">✅ ' + row.content_type + '</span><div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;">Giảm ' + row.questions_reduced + '% câu hỏi</div></td>';
      html += '<td style="text-align:center;padding:10px;"><span style="font-size:0.72rem;color:#10b981;">✅ Đang hoạt động</span></td>';
    } else if (matchSug && matchSug.status === 'scheduled') {
      html += '<td style="padding:10px 12px;"><span style="background:#fef2f2;color:#ef4444;font-size:0.72rem;font-weight:700;padding:3px 8px;border-radius:6px;">❌ Thiếu</span><div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;">' + row.content_gap + '</div></td>';
      html += '<td style="text-align:center;padding:10px;"><span style="font-size:0.72rem;color:#10b981;font-weight:700;">🗓 Đã lên lịch</span></td>';
    } else {
      var onclickFn = matchSug
        ? 'scheduleSuggestion(\'' + matchSug.id.replace(/'/g,"\\'") + '\')'
        : 'showToast(\'Tạo đề xuất AI trước để lên lịch\', \'info\')';
      html += '<td style="padding:10px 12px;"><span style="background:#fef2f2;color:#ef4444;font-size:0.72rem;font-weight:700;padding:3px 8px;border-radius:6px;">❌ Thiếu</span><div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;">' + row.content_gap + '</div></td>';
      html += '<td style="text-align:center;padding:10px;"><button class="alert-cta" onclick="' + onclickFn + '">Lên lịch</button></td>';
    }
    html += '</tr>';
  });
  html += '</tbody></table></div></div>';

  // ---- SECTION 2: AI Content Recommendations ----
  html += '<div style="margin-bottom:8px;font-size:0.82rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">🤖 Đề xuất AI — Ưu tiên theo Combined Signal Score</div>';

  // Tách thành 2 nhóm: live backend vs demo
  var liveSugs = visible.filter(function(s){ return s._fromBackend || s._fromDailySummary; });
  var demoSugs = visible.filter(function(s){ return !s._fromBackend && !s._fromDailySummary; });

  function renderSugCard(sug) {
    var tLabel = typeLabel[sug.type] || sug.type;
    var tColor = typeColor[sug.type] || '#94a3b8';
    var tBg = typeBg[sug.type] || '#f8fafc';
    var isHigh = sug.priority === 'high';
    var rawId = sug.id || '';
    var sid = rawId.replace(/'/g, "\\'");
    // Store in global map so onclick can retrieve full sug without encoding issues
    window._suggestionsMap = window._suggestionsMap || {};
    window._suggestionsMap[rawId] = sug;
    // type IS the content_type code (e.g. 'tiktok_30s'); legacy fallback via platformMap
    var legacyCtMap = { video: 'tiktok_30s', blog_faq: 'facebook_post', comparison: 'tiktok_30s', guide: 'facebook_post' };
    var platformMap = { TikTok: 'tiktok_30s', Facebook: 'facebook_post', Shopee: 'shopee_video', Instagram: 'reels_30s' };
    var TEXT_POST_TYPES = ['facebook_post', 'caption_instagram'];
    var ALL_CONTENT_TYPES = ['tiktok_15s','tiktok_30s','tiktok_60s','reels_30s','reels_60s','youtube_short','shopee_video','facebook_post','caption_instagram'];
    var mappedCt = ALL_CONTENT_TYPES.indexOf(sug.type) >= 0 ? sug.type
                 : platformMap[(sug.platform||'').split(' ')[0]]
                 || legacyCtMap[sug.type] || 'tiktok_30s';
    var productId = sug.source_product_id || sug.product_id || '';

    // Border theo trạng thái
    var borderColor = sug.status === 'scheduled' ? '#10b981'
                    : sug.status === 'saved' ? '#f59e0b'
                    : isHigh ? '#fca5a5' : 'var(--border-primary)';

    var out = '<div style="background:var(--bg-primary);border:1px solid ' + borderColor + ';border-radius:12px;padding:16px;margin-bottom:14px;">';
    out += '<div style="display:flex;align-items:flex-start;gap:14px;">';
    out += scoreRing(sug.combined_score);
    out += '<div style="flex:1;">';
    // Product name lookup (catalog or short map)
    var pidShortNames = {
      'P001': 'Son Bóng', 'P002': 'Son Kem Lì', 'P003': 'Phấn Phủ Bột',
      'P004': 'Combo Son+Phấn', 'P006': 'Phấn Mini', 'P007': 'Set Son 6 Thỏi',
      'P008': 'Bộ 6 Món', 'P009': 'Bộ Cọ 13 Món', 'P011': 'Kem Rửa Mặt',
    };
    var productName = productId
      ? (((window._ca||{}).catalogProducts||[]).find(function(p){ return p.product_id === productId; }) || {}).short_name
        || pidShortNames[productId] || productId
      : null;

    // Title + badges
    out += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">';
    out += '<strong style="font-size:0.9rem;">' + sug.title + '</strong>';
    out += '<span style="background:' + tBg + ';color:' + tColor + ';font-size:0.68rem;font-weight:700;padding:2px 8px;border-radius:10px;">' + tLabel + '</span>';
    out += '<span style="background:#f1f5f9;color:#64748b;font-size:0.68rem;padding:2px 8px;border-radius:10px;">' + sug.platform + '</span>';
    if (productName) out += '<span style="background:rgba(234,179,8,0.08);color:#b45309;font-size:0.68rem;font-weight:700;padding:2px 8px;border-radius:10px;border:1px solid rgba(234,179,8,0.2);">📦 ' + productName + '</span>';
    if (sug.status === 'saved')     out += '<span style="background:#fffbeb;color:#f59e0b;font-size:0.68rem;font-weight:700;padding:2px 8px;border-radius:10px;">📌 Đã lưu</span>';
    if (sug.status === 'scheduled') out += '<span style="background:#f0fdf4;color:#10b981;font-size:0.68rem;font-weight:700;padding:2px 8px;border-radius:10px;">🗓 Đã lên lịch</span>';
    if (sug.has_script)             out += '<span style="background:rgba(16,185,129,0.08);color:#059669;font-size:0.68rem;font-weight:700;padding:2px 8px;border-radius:10px;border:1px solid rgba(16,185,129,0.2);">📋 Có kịch bản</span>';
    out += '</div>';
    // Two signals
    out += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">';
    out += '<div style="background:#eef2ff;border-radius:8px;padding:10px;">';
    out += '<div style="font-size:0.7rem;font-weight:700;color:#6366f1;margin-bottom:4px;">💬 Tín hiệu Chatbot</div>';
    out += '<div style="font-size:0.78rem;font-weight:700;color:var(--text-primary);">' + ((sug.chatbot_signal||{}).count || 0) + ' câu hỏi</div>';
    out += '<div style="font-size:0.72rem;color:var(--text-muted);">' + ((sug.chatbot_signal||{}).topic || '') + '</div>';
    out += '<div style="margin-top:6px;">' + ((sug.chatbot_signal||{}).sample_questions || []).slice(0,2).map(function(q) {
      return '<div style="font-size:0.68rem;color:#6366f1;padding:2px 0;">› "' + q + '"</div>';
    }).join('') + '</div>';
    out += '</div>';
    if (((sug.review_signal||{}).count || 0) > 0) {
      out += '<div style="background:#f0fdf4;border-radius:8px;padding:10px;">';
      out += '<div style="font-size:0.7rem;font-weight:700;color:#10b981;margin-bottom:4px;">⭐ Tín hiệu Review</div>';
      out += '<div style="font-size:0.78rem;font-weight:700;color:var(--text-primary);">' + (sug.review_signal||{}).count + ' đánh giá</div>';
      out += '<div style="font-size:0.72rem;color:var(--text-muted);">' + ((sug.review_signal||{}).neg_pct || 0) + '% lo ngại về chủ đề này</div>';
      out += '<div style="margin-top:6px;">' + ((sug.review_signal||{}).sample_reviews || []).slice(0,2).map(function(r) {
        return '<div style="font-size:0.68rem;color:#10b981;padding:2px 0;">› "' + r + '"</div>';
      }).join('') + '</div>';
      out += '</div>';
    } else {
      out += '<div style="background:#f0f9ff;border-radius:8px;padding:10px;">';
      out += '<div style="font-size:0.7rem;font-weight:700;color:#0ea5e9;margin-bottom:4px;">💼 Tín hiệu Thị trường</div>';
      out += '<div style="font-size:0.78rem;color:var(--text-muted);">Chưa có review — tín hiệu từ chatbot</div>';
      out += '<div style="font-size:0.72rem;color:#0ea5e9;margin-top:4px;">› Cơ hội chiếm lĩnh content trước</div>';
      out += '</div>';
    }
    out += '</div>';
    // Angle
    out += '<div style="background:#f8fafc;border-radius:8px;padding:10px;margin-bottom:10px;">';
    out += '<div style="font-size:0.72rem;font-weight:700;color:var(--text-muted);margin-bottom:3px;">🎯 Góc tiếp cận đề xuất:</div>';
    out += '<div style="font-size:0.78rem;color:var(--text-secondary);">' + (sug.angle || '—') + '</div>';
    out += '</div>';
    // Impact + action buttons
    out += '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">';
    out += '<div style="display:flex;gap:12px;flex-wrap:wrap;">';
    out += '<div style="font-size:0.72rem;color:#10b981;"><strong>📈 Impact:</strong> ' + (sug.estimated_impact || '') + '</div>';
    out += '<div style="font-size:0.72rem;color:var(--text-muted);"><strong>⏱ Sản xuất:</strong> ' + (sug.estimated_production || '') + '</div>';
    out += '</div>';
    out += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
    // 📋 Xem script (if already saved) — otherwise 🎬 Tạo script
    // NOTE: use caScriptFromSuggId(sid) — angle is looked up from window._suggestionsMap to avoid HTML entity encoding bugs
    if (sug.has_script) {
      out += '<button class="alert-cta" style="background:rgba(16,185,129,0.12);color:#059669;border:1px solid rgba(16,185,129,0.35);" '
        + 'onclick="caViewSavedScript(\'' + sid + '\')">📋 Xem script</button>';
      out += '<button class="alert-cta" style="background:rgba(99,102,241,0.08);color:#818cf8;border:1px solid rgba(99,102,241,0.2);font-size:0.72rem;" '
        + 'onclick="caScriptFromSuggId(\'' + sid + '\')">🔄 Tạo lại</button>';
    } else {
      out += '<button class="alert-cta" style="background:rgba(99,102,241,0.12);color:#818cf8;border:1px solid rgba(99,102,241,0.3);" '
        + 'onclick="caScriptFromSuggId(\'' + sid + '\')">🎬 Tạo script</button>';
    }
    if (sug.status === 'scheduled') {
      out += '<button class="alert-cta" style="background:#f0fdf4;color:#10b981;border:1px solid #10b981;" onclick="restoreSuggestion(\'' + sid + '\')">↩ Chuyển lại Pending</button>';
    } else if (sug.status === 'saved') {
      out += '<button class="alert-cta" style="background:var(--accent-emerald-bg);color:var(--accent-emerald);border:1px solid var(--accent-emerald);" onclick="scheduleSuggestion(\'' + sid + '\')">🗓 Lên lịch</button>';
      out += '<button class="alert-cta" style="background:var(--accent-rose-bg);color:var(--accent-rose);border:1px solid var(--accent-rose);" onclick="ignoreSuggestion(\'' + sid + '\')">✕ Bỏ qua</button>';
    } else {
      out += '<button class="alert-cta" style="background:var(--accent-emerald-bg);color:var(--accent-emerald);border:1px solid var(--accent-emerald);" onclick="scheduleSuggestion(\'' + sid + '\')">✅ Lên lịch</button>';
      out += '<button class="alert-cta" style="background:#fffbeb;color:#f59e0b;border:1px solid #f59e0b;" onclick="saveSuggestion(\'' + sid + '\')">📌 Lưu lại</button>';
      out += '<button class="alert-cta" style="background:var(--accent-rose-bg);color:var(--accent-rose);border:1px solid var(--accent-rose);" onclick="ignoreSuggestion(\'' + sid + '\')">✕ Bỏ qua</button>';
    }
    out += '</div></div>';
    out += '</div></div></div>';
    return out;
  } // end renderSugCard

  // ---- Render LIVE suggestions (from backend/daily summary) ----
  if (liveSugs.length > 0) {
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">'
      + '<span style="display:inline-flex;align-items:center;gap:5px;background:#dcfce7;color:#15803d;font-size:0.72rem;font-weight:700;padding:4px 10px;border-radius:20px;">● LIVE — Từ dữ liệu thực</span>'
      + '<span style="font-size:0.75rem;color:var(--text-muted);">' + liveSugs.length + ' đề xuất từ backend</span>'
      + '</div>';
    liveSugs.forEach(function(sug) { html += renderSugCard(sug); });
  }

  // ---- Render DEMO suggestions ----
  if (demoSugs.length > 0) {
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;' + (liveSugs.length > 0 ? 'margin-top:20px;' : '') + '">'
      + '<span style="display:inline-flex;align-items:center;gap:5px;background:#f1f5f9;color:#64748b;font-size:0.72rem;font-weight:700;padding:4px 10px;border-radius:20px;">📋 Demo — Dữ liệu mẫu</span>'
      + '<span style="font-size:0.75rem;color:var(--text-muted);">' + demoSugs.length + ' đề xuất minh họa · không phản ánh dữ liệu thực</span>'
      + '</div>';
    demoSugs.forEach(function(sug) { html += renderSugCard(sug); });
  }

  if (liveSugs.length === 0 && demoSugs.length === 0) {
    html += '<div style="text-align:center;padding:32px;color:var(--text-muted);">Không có đề xuất nào</div>';
  }

  // Hiện số lượng đã bỏ qua (nếu có) + nút khôi phục
  if (ignored.length > 0) {
    html += '<div style="text-align:center;margin-bottom:16px;">'
      + '<span style="font-size:0.75rem;color:var(--text-muted);">' + ignored.length + ' đề xuất đã ẩn </span>'
      + '<button onclick="(function(){MOCK.content_suggestions_generated.forEach(function(s){if(s.status===\'ignored\')s.status=\'pending\';});navigate(\'content-suggestions\');})()" '
      + 'style="font-size:0.73rem;color:var(--accent-indigo);background:none;border:none;cursor:pointer;text-decoration:underline;">Hiện lại tất cả</button>'
      + '</div>';
  }

  // ---- SECTION 3: Content Performance + Calendar ----
  html += '<div class="grid-2" style="gap:16px;margin-bottom:20px;">';

  // Past performance
  html += '<div class="content-card" style="margin-bottom:0;">';
  html += '<div class="content-card-title" style="font-size:0.88rem;">📊 Hiệu quả Content đã xuất bản</div>';
  inv.forEach(function(item, i) {
    const typeEmoji = item.type === 'video' ? '🎬' : item.type === 'blog' ? '📝' : '❓';
    html += '<div style="padding:10px 0;' + (i < inv.length-1 ? 'border-bottom:1px solid var(--border-primary);' : '') + '">';
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">';
    html += '<span>' + typeEmoji + '</span><strong style="font-size:0.82rem;">' + item.title + '</strong></div>';
    html += '<div style="display:flex;gap:12px;">';
    html += '<div style="font-size:0.72rem;color:var(--text-muted);">👁 ' + item.views.toLocaleString() + ' lượt xem</div>';
    html += '<div style="font-size:0.72rem;color:#10b981;">↓ Giảm ' + item.questions_reduced + '% câu hỏi</div>';
    html += '</div></div>';
  });
  html += '<div style="margin-top:12px;padding:10px;background:#f0fdf4;border-radius:8px;font-size:0.75rem;color:#065f46;">💡 TB mỗi content giảm <strong>33% câu hỏi chatbot</strong> trong chủ đề tương ứng</div>';
  html += '</div>';

  // Content calendar — xây từ pending/saved/scheduled suggestions
  html += '<div class="content-card" style="margin-bottom:0;">';
  html += '<div class="content-card-title" style="font-size:0.88rem;">🗓 Lịch Content đề xuất</div>';
  var calHighPrio = sugs.filter(function(s){return s.status==='pending'&&s.priority==='high';}).slice(0,3);
  var calMedPrio  = sugs.filter(function(s){return s.status==='pending'&&s.priority==='medium';}).slice(0,2);
  var calSaved    = sugs.filter(function(s){return s.status==='saved';}).slice(0,2);
  var calScheduled = sugs.filter(function(s){return s.status==='scheduled';}).slice(0,3);
  var calItems = [
    { week: 'Tuần này (ưu tiên cao 🔴)', sugs: calHighPrio, color: '#ef4444', bg: '#fef2f2',
      fallback: '(Chưa có đề xuất cao — nhấn "Tạo từ báo cáo" để thêm)' },
    { week: '2 tuần tới', sugs: calMedPrio, color: '#f59e0b', bg: '#fffbeb',
      fallback: '(Chưa có đề xuất ưu tiên vừa)' },
    { week: 'Đã lưu 📌', sugs: calSaved, color: '#f59e0b', bg: '#fffbeb',
      fallback: calSaved.length===0 ? '(Chưa có item nào đã lưu)' : null },
    { week: 'Đã lên lịch ✅', sugs: calScheduled, color: '#10b981', bg: '#f0fdf4',
      fallback: calScheduled.length===0 ? '(Chưa lên lịch item nào)' : null }
  ].filter(function(c){ return !(c.sugs.length===0 && !c.fallback); });
  calItems.forEach(function(cal) {
    html += '<div style="margin-bottom:12px;">';
    html += '<div style="font-size:0.72rem;font-weight:700;background:' + cal.bg + ';color:' + cal.color + ';padding:4px 10px;border-radius:6px;display:inline-block;margin-bottom:6px;">' + cal.week + '</div>';
    if (cal.sugs.length === 0) {
      html += '<div style="font-size:0.75rem;color:var(--text-muted);padding:4px 0;">' + cal.fallback + '</div>';
    } else {
      cal.sugs.forEach(function(s) {
        var label = (s.title||'').length > 50 ? (s.title||'').substring(0,50) + '…' : (s.title||'');
        var sid2 = (s.id||'').replace(/'/g,"\\'");
        html += '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:0.78rem;">';
        html += '<div style="width:6px;height:6px;border-radius:50%;background:' + cal.color + ';flex-shrink:0;"></div>';
        html += '<span style="flex:1;">' + label + '</span>';
        if (s.status === 'pending' || s.status === 'saved') {
          html += '<button onclick="scheduleSuggestion(\'' + sid2 + '\')" style="font-size:0.65rem;padding:2px 6px;border:1px solid #10b981;background:#f0fdf4;color:#10b981;border-radius:6px;cursor:pointer;white-space:nowrap;">🗓 Lên lịch</button>';
        }
        html += '</div>';
      });
    }
    html += '</div>';
  });
  html += '</div>';
  html += '</div>'; // grid-2

  return tabBar + html;
}

function renderProductDescriptions() {
  const prods = MOCK.products_detail;
  const prod = prods.find(function(p) { return p.sku === currentProductDescSku; }) || prods[0];

  // Build AI recommendations for the selected product
  function buildRecs(p) {
    const recs = [];
    // Find top chatbot topics not in description
    p.chatbot_questions.forEach(function(q) {
      const inDesc = p.description_key_points.some(function(kp) {
        return q.topic.toLowerCase().includes(kp.toLowerCase()) || kp.toLowerCase().includes(q.topic.toLowerCase());
      });
      const feat = p.review_features.find(function(f) { return f.feature.toLowerCase().includes(q.topic.split(' ')[0].toLowerCase()); });
      if (!inDesc && q.count >= 8) {
        const type = feat && feat.negative > feat.positive ? 'EXPAND' : 'ADD';
        recs.push({
          action: type,
          section: q.topic,
          chatbot_count: q.count,
          review_mentions: feat ? feat.mentions : 0,
          review_neg: feat ? feat.negative : 0,
          review_pos: feat ? feat.positive : 0,
          sample_q: q.sample,
          sample_review: feat ? (feat.sample_neg || feat.sample_pos || '') : '',
          suggestion: type === 'ADD' ?
            'Thêm mục "' + q.topic + '" vào mô tả sản phẩm với thông tin chi tiết' :
            'Bổ sung phần "' + q.topic + '" với thông số kỹ thuật và cam kết chất lượng cụ thể'
        });
      }
    });
    // Check for mismatch: description highlights something but reviews are negative about it
    p.review_features.forEach(function(f) {
      if (f.negative > f.positive && f.negative >= 8) {
        const inDesc = p.description_key_points.some(function(kp) {
          return f.feature.toLowerCase().includes(kp.toLowerCase());
        });
        if (inDesc) {
          recs.push({
            action: 'CLARIFY',
            section: f.feature,
            chatbot_count: 0,
            review_mentions: f.mentions,
            review_neg: f.negative,
            review_pos: f.positive,
            sample_q: '',
            sample_review: f.sample_neg || '',
            suggestion: 'Mô tả đang nhấn mạnh "' + f.feature + '" nhưng review tiêu cực về điểm này — cần làm rõ kỳ vọng thực tế'
          });
        }
      }
    });
    return recs.sort(function(a,b) { return (b.chatbot_count + b.review_mentions) - (a.chatbot_count + a.review_mentions); });
  }

  const recs = buildRecs(prod);

  function actionBadge(action) {
    if (action === 'ADD') return '<span style="background:#eef2ff;color:#6366f1;font-size:0.7rem;font-weight:700;padding:3px 8px;border-radius:6px;">➕ THÊM MỚI</span>';
    if (action === 'EXPAND') return '<span style="background:#fffbeb;color:#f59e0b;font-size:0.7rem;font-weight:700;padding:3px 8px;border-radius:6px;">📝 MỞ RỘNG</span>';
    if (action === 'CLARIFY') return '<span style="background:#fef2f2;color:#ef4444;font-size:0.7rem;font-weight:700;padding:3px 8px;border-radius:6px;">⚠ LÀM RÕ</span>';
    return '';
  }

  function impactBar(chatbot, review) {
    const total = chatbot + review;
    const maxW = 120;
    const cW = total > 0 ? Math.round((chatbot / total) * maxW) : 0;
    const rW = total > 0 ? Math.round((review / total) * maxW) : 0;
    return '<div style="display:flex;align-items:center;gap:4px;margin-top:4px;">'
      + (chatbot > 0 ? '<div style="height:6px;width:' + cW + 'px;background:#6366f1;border-radius:2px;" title="Chatbot: ' + chatbot + '"></div>' : '')
      + (review > 0 ? '<div style="height:6px;width:' + rW + 'px;background:#10b981;border-radius:2px;" title="Review: ' + review + '"></div>' : '')
      + '</div>'
      + '<div style="display:flex;gap:8px;margin-top:2px;">'
      + (chatbot > 0 ? '<span style="font-size:0.65rem;color:#6366f1;">💬 ' + chatbot + ' hỏi</span>' : '')
      + (review > 0 ? '<span style="font-size:0.65rem;color:#10b981;">⭐ ' + review + ' review</span>' : '')
      + '</div>';
  }

  // ---- PRODUCT SELECTOR ----
  let html = '<div class="content-card" style="margin-bottom:20px;">';
  html += '<div class="content-card-title" style="margin-bottom:12px;">📝 Tối ưu mô tả sản phẩm với AI</div>';
  html += '<div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:14px;">Phân tích câu hỏi chatbot + đánh giá review để tìm điểm mù trong mô tả sản phẩm</div>';
  html += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
  prods.forEach(function(p) {
    const active = p.sku === currentProductDescSku;
    html += '<button onclick="currentProductDescSku=\'' + p.sku + '\';navigate(\'product-descriptions\')" style="padding:8px 14px;border-radius:8px;font-size:0.8rem;font-weight:600;cursor:pointer;border:1.5px solid ' + (active ? 'var(--accent-indigo)' : 'var(--border-primary)') + ';background:' + (active ? 'var(--accent-indigo-bg,#eef2ff)' : 'var(--bg-secondary)') + ';color:' + (active ? 'var(--accent-indigo)' : 'var(--text-secondary)') + ';">' + p.name + '</button>';
  });
  html += '</div></div>';

  // ---- SUMMARY STATS ----
  const totalChatQ = prod.chatbot_questions.reduce(function(s,q) { return s + q.count; }, 0);
  const totalRevFeat = prod.review_features.reduce(function(s,f) { return s + f.mentions; }, 0);
  const negSignals = prod.review_features.filter(function(f) { return f.negative > f.positive; }).length;
  html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">';
  const stats = [
    { label: 'Câu hỏi chatbot', value: totalChatQ, sub: '7 ngày qua', color: '#6366f1', bg: '#eef2ff' },
    { label: 'Đề cập trong review', value: totalRevFeat, sub: 'về tính năng SP', color: '#10b981', bg: '#f0fdf4' },
    { label: 'Điểm mù trong mô tả', value: recs.length, sub: 'cần cập nhật', color: '#ef4444', bg: '#fef2f2' },
    { label: 'Tính năng lo ngại', value: negSignals, sub: 'review tiêu cực > tích cực', color: '#f59e0b', bg: '#fffbeb' }
  ];
  stats.forEach(function(s) {
    html += '<div style="background:' + s.bg + ';border-radius:12px;padding:14px;text-align:center;">';
    html += '<div style="font-size:1.6rem;font-weight:800;color:' + s.color + ';">' + s.value + '</div>';
    html += '<div style="font-size:0.75rem;font-weight:700;color:' + s.color + ';">' + s.label + '</div>';
    html += '<div style="font-size:0.68rem;color:' + s.color + ';opacity:0.7;">' + s.sub + '</div>';
    html += '</div>';
  });
  html += '</div>';

  // ---- SECTION 1: Feature Priority Matrix ----
  html += '<div class="content-card" style="margin-bottom:20px;">';
  html += '<div class="content-card-title">🗂 Ma trận ưu tiên tính năng — ' + prod.name + '</div>';
  html += '<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:14px;">Kích thước bar = mức độ quan tâm. Màu = cảm xúc khách hàng về tính năng đó</div>';
  const allFeats = prod.review_features.slice().sort(function(a,b) { return b.mentions - a.mentions; });
  const maxMentions = Math.max.apply(null, allFeats.map(function(f) { return f.mentions; }));
  allFeats.forEach(function(f) {
    const pct = Math.round((f.mentions / maxMentions) * 100);
    const posRatio = f.mentions > 0 ? f.positive / f.mentions : 0;
    const barColor = posRatio > 0.7 ? '#10b981' : posRatio > 0.4 ? '#f59e0b' : '#ef4444';
    const sentLabel = posRatio > 0.7 ? 'Tích cực' : posRatio > 0.4 ? 'Hỗn hợp' : 'Tiêu cực';
    const sentColor = posRatio > 0.7 ? '#10b981' : posRatio > 0.4 ? '#f59e0b' : '#ef4444';
    html += '<div style="margin-bottom:12px;">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">';
    html += '<div style="display:flex;align-items:center;gap:8px;">';
    html += '<strong style="font-size:0.82rem;">' + f.feature + '</strong>';
    html += '<span style="font-size:0.68rem;color:' + sentColor + ';font-weight:700;">' + sentLabel + '</span>';
    html += '</div>';
    html += '<div style="font-size:0.72rem;color:var(--text-muted);">' + f.mentions + ' lần đề cập (' + f.positive + ' 😊 / ' + f.negative + ' 😞)</div>';
    html += '</div>';
    html += '<div style="background:var(--bg-secondary);border-radius:4px;height:10px;overflow:hidden;">';
    html += '<div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:4px;transition:width 0.5s;"></div>';
    html += '</div>';
    if (f.sample_neg) {
      html += '<div style="font-size:0.7rem;color:#ef4444;margin-top:3px;">😞 "' + f.sample_neg + '"</div>';
    } else if (f.sample_pos) {
      html += '<div style="font-size:0.7rem;color:#10b981;margin-top:3px;">😊 "' + f.sample_pos + '"</div>';
    }
    html += '</div>';
  });
  html += '</div>';

  // ---- SECTION 2: Description Gap + Before/After ----
  html += '<div class="content-card" style="margin-bottom:20px;">';
  html += '<div class="content-card-title">📄 Mô tả hiện tại — Phân tích khoảng trống</div>';
  html += '<div class="grid-2" style="gap:16px;">';
  // Current description
  html += '<div>';
  html += '<div style="font-size:0.75rem;font-weight:700;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;">Mô tả HIỆN TẠI</div>';
  html += '<div style="background:var(--bg-secondary);border-radius:8px;padding:14px;font-size:0.82rem;color:var(--text-secondary);line-height:1.6;border-left:3px solid var(--border-primary);">' + prod.description_current + '</div>';
  html += '<div style="margin-top:10px;"><div style="font-size:0.72rem;font-weight:700;color:var(--text-muted);margin-bottom:6px;">Điểm nhấn hiện tại:</div>';
  html += prod.description_key_points.map(function(kp) {
    return '<span style="background:var(--bg-secondary);border:1px solid var(--border-primary);font-size:0.72rem;padding:3px 8px;border-radius:10px;margin:2px;display:inline-block;">✓ ' + kp + '</span>';
  }).join('');
  html += '</div></div>';
  // What customers actually ask about
  html += '<div>';
  html += '<div style="font-size:0.75rem;font-weight:700;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;">Khách hỏi NHIỀU NHẤT</div>';
  prod.chatbot_questions.sort(function(a,b) { return b.count - a.count; }).forEach(function(q) {
    const inDesc = prod.description_key_points.some(function(kp) {
      return q.topic.toLowerCase().includes(kp.toLowerCase()) || kp.toLowerCase().includes(q.topic.split(' ')[0].toLowerCase());
    });
    html += '<div style="display:flex;align-items:center;gap:8px;padding:8px;margin-bottom:6px;border-radius:8px;background:' + (inDesc ? '#f0fdf4' : '#fef2f2') + ';">';
    html += '<div style="flex:1;">';
    html += '<div style="font-size:0.8rem;font-weight:600;">' + q.topic + '</div>';
    html += '<div style="font-size:0.7rem;color:var(--text-muted);">"' + q.sample + '"</div>';
    html += '</div>';
    html += '<div style="text-align:right;">';
    html += '<div style="font-size:0.9rem;font-weight:800;color:' + (inDesc ? '#10b981' : '#ef4444') + ';">' + q.count + 'x</div>';
    html += '<div style="font-size:0.65rem;color:' + (inDesc ? '#10b981' : '#ef4444') + ';">' + (inDesc ? '✓ Có trong mô tả' : '✗ Chưa có') + '</div>';
    html += '</div></div>';
  });
  html += '</div>';
  html += '</div></div>'; // grid-2 + card

  // ---- SECTION 3: AI Recommendations ----
  html += '<div class="content-card" style="margin-bottom:20px;">';
  html += '<div class="content-card-title">🤖 Đề xuất AI — Cập nhật mô tả sản phẩm</div>';
  html += '<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:14px;">Mỗi đề xuất kết hợp dữ liệu từ chatbot + review để đề xuất cụ thể nhất có thể</div>';

  if (recs.length === 0) {
    html += '<div style="text-align:center;padding:24px;color:var(--text-muted);">✅ Mô tả sản phẩm đang đầy đủ — không có khoảng trống lớn nào</div>';
  } else {
    recs.forEach(function(rec, i) {
      html += '<div style="border:1px solid var(--border-primary);border-radius:12px;padding:14px;margin-bottom:12px;">';
      html += '<div style="display:flex;align-items:flex-start;gap:12px;">';
      html += '<div style="width:36px;height:36px;border-radius:8px;background:var(--bg-secondary);display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--accent-indigo);flex-shrink:0;">' + (i+1) + '</div>';
      html += '<div style="flex:1;">';
      html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">';
      html += actionBadge(rec.action);
      html += '<strong style="font-size:0.88rem;">' + rec.section + '</strong>';
      html += '</div>';
      // Signal bars
      html += impactBar(rec.chatbot_count, rec.review_mentions);
      html += '<div style="margin-top:8px;">';
      if (rec.chatbot_count > 0) {
        html += '<div style="font-size:0.72rem;color:#6366f1;margin-bottom:2px;">💬 Câu hỏi chatbot: "' + rec.sample_q + '"</div>';
      }
      if (rec.sample_review) {
        html += '<div style="font-size:0.72rem;color:' + (rec.review_neg > rec.review_pos ? '#ef4444' : '#10b981') + ';margin-bottom:6px;">⭐ Review: "' + rec.sample_review + '"</div>';
      }
      html += '<div style="background:#f8fafc;border-radius:8px;padding:10px;margin-top:6px;">';
      html += '<div style="font-size:0.72rem;font-weight:700;color:var(--text-muted);margin-bottom:3px;">💡 Đề xuất cụ thể:</div>';
      html += '<div style="font-size:0.78rem;color:var(--text-secondary);">' + rec.suggestion + '</div>';
      html += '</div>';
      html += '</div>';
      // Actions
      html += '<div style="display:flex;gap:8px;margin-top:10px;">';
      html += '<button class="alert-cta" style="background:var(--accent-emerald-bg);color:var(--accent-emerald);border:1px solid var(--accent-emerald);" onclick="showToast(\'Đã áp dụng cập nhật mô tả!\', \'success\')">✅ Áp dụng</button>';
      html += '<button class="alert-cta" onclick="showToast(\'Đã mở chỉnh sửa thủ công\', \'info\')">✏️ Chỉnh sửa</button>';
      html += '<button class="alert-cta" style="background:var(--accent-rose-bg);color:var(--accent-rose);" onclick="showToast(\'Đã bỏ qua đề xuất này\', \'warning\')">✕ Bỏ qua</button>';
      html += '</div></div></div></div>';
    });
  }
  html += '</div>';

  // ---- SECTION 4: Before/After Preview ----
  html += '<div class="content-card">';
  html += '<div class="content-card-title">👁 Preview — Trước & Sau tối ưu AI</div>';
  html += '<div class="grid-2" style="gap:16px;">';

  // Before
  html += '<div>';
  html += '<div style="font-size:0.75rem;font-weight:700;color:#ef4444;margin-bottom:8px;text-transform:uppercase;">⬛ Mô tả TRƯỚC — Thiếu thông tin quan trọng</div>';
  html += '<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:14px;font-size:0.82rem;color:#7f1d1d;line-height:1.7;">' + prod.description_current + '</div>';
  html += '<div style="margin-top:8px;font-size:0.72rem;color:#ef4444;">❌ ' + recs.length + ' điểm thiếu — ' + prod.chatbot_questions.filter(function(q){return q.count>=8;}).length + ' câu hỏi phổ biến chưa được trả lời trước</div>';
  html += '</div>';

  // After (AI-enhanced)
  html += '<div>';
  html += '<div style="font-size:0.75rem;font-weight:700;color:#10b981;margin-bottom:8px;text-transform:uppercase;">✅ Mô tả SAU — AI đề xuất bổ sung</div>';

  // Build enhanced description
  let enhanced = prod.description_current;
  recs.slice(0, 2).forEach(function(rec) {
    if (rec.action === 'ADD') enhanced += ' | ' + rec.section + ': [AI sẽ điền thông số cụ thể dựa trên specs thực tế]';
    if (rec.action === 'EXPAND') enhanced += ' | ' + rec.section + ': [AI tái viết với cam kết + thông số kỹ thuật rõ ràng]';
  });

  html += '<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:14px;font-size:0.82rem;color:#064e3b;line-height:1.7;">' + enhanced + '</div>';
  html += '<div style="margin-top:8px;">';
  recs.slice(0, 3).forEach(function(rec) {
    html += '<div style="font-size:0.7rem;color:#10b981;padding:2px 0;">✅ Thêm mục: <strong>' + rec.section + '</strong> (dự kiến giảm ' + rec.chatbot_count + ' câu hỏi/tuần)</div>';
  });
  html += '</div>';
  html += '<div style="margin-top:10px;display:flex;gap:8px;">';
  html += '<button class="alert-cta" style="background:var(--accent-emerald-bg);color:var(--accent-emerald);border:1px solid var(--accent-emerald);" onclick="showToast(\'Đã áp dụng tất cả đề xuất!\', \'success\')">✅ Áp dụng tất cả</button>';
  html += '<button class="alert-cta" onclick="showToast(\'Đang xuất bản lên Shopee...\', \'info\')">🚀 Publish Shopee</button>';
  html += '</div>';
  html += '</div>';

  html += '</div></div>'; // grid-2 + card

  return html;
}


// ===== Demo Khách Hàng Page =====
function renderDemoCustomer() {
  // Nội dung thực (form review + live chat widget) được inject bởi api_integration.js
  // Hàm này chỉ trả về skeleton để tránh trang trắng trong trường hợp backend chưa tải
  return `
    <div style="display:flex;flex-direction:column;gap:20px;">
      <div style="padding:16px 20px;background:linear-gradient(135deg,rgba(99,102,241,0.08),rgba(16,185,129,0.06));
        border-radius:12px;border:1px solid rgba(99,102,241,0.15);">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <span style="font-size:1.6rem;">🧑‍💻</span>
          <div>
            <div style="font-weight:800;font-size:1rem;color:var(--text-primary);">Khu vực Demo Khách Hàng</div>
            <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">
              Mô phỏng hành trình khách hàng — Gửi đánh giá sản phẩm và nhắn tin trực tiếp với AI Agent
            </div>
          </div>
        </div>
      </div>
      <div id="demoCustomerPlaceholder" style="text-align:center;padding:32px;color:var(--text-muted);font-size:0.85rem;">
        ⏳ Đang tải các module...
      </div>
    </div>
  `;
}


// ===== Content Agent (embedded trong tab "Tạo Script" của trang Đề xuất Content) =====
window._csTab = window._csTab || 'suggestions'; // 'suggestions' | 'script'

window._ca = window._ca || {
  step: 1,
  jobId: null,
  pollTimer: null,
  intel: null,
  scripts: [],
  activeVariant: 'emotional',
  filmingGuide: null,
  filmingScript: null,
  catalogProducts: null,
  _selectedProduct: null,
  _selectedUsps: null,
  _lastRequest: null
};

/**
 * Được gọi từ nút "🎬 Tạo script" / "🔄 Tạo lại" trong suggestion cards.
 * Tránh HTML entity encoding bug bằng cách lookup sug từ window._suggestionsMap theo ID.
 */
function caScriptFromSuggId(sid) {
  var sug = (window._suggestionsMap || {})[sid];
  if (!sug) { showToast('Không tìm được đề xuất', 'warning'); return; }
  var TEXT_POST_TYPES = ['facebook_post', 'caption_instagram'];
  var ALL_CT = ['tiktok_15s','tiktok_30s','tiktok_60s','reels_30s','reels_60s','youtube_short','shopee_video','facebook_post','caption_instagram'];
  var legacyCtMap = { video: 'tiktok_30s', blog_faq: 'facebook_post', comparison: 'tiktok_30s', guide: 'facebook_post' };
  var platformMap = { TikTok: 'tiktok_30s', Facebook: 'facebook_post', Shopee: 'shopee_video', Instagram: 'reels_30s' };
  var mappedCt = ALL_CT.indexOf(sug.type) >= 0 ? sug.type
               : platformMap[(sug.platform||'').split(' ')[0]]
               || legacyCtMap[sug.type] || 'tiktok_30s';
  caPrefillFromSuggestion(sug.source_product_id || sug.product_id || '', mappedCt, sug.angle || '', sug.id || '');
}

/**
 * Được gọi từ nút "🎬 Tạo script" trong Đề xuất AI.
 * Lưu prefill vào window._ca._prefill rồi chuyển sang tab Script.
 */
function caPrefillFromSuggestion(productId, contentType, angle, suggestionId) {
  window._ca._prefill = {
    product_id:          productId   || '',
    content_type:        contentType || 'tiktok_30s',
    custom_instructions: angle ? 'Góc tiếp cận đề xuất: ' + angle : '',
    suggestion_id:       suggestionId || null,
  };
  window._ca.step = 1;
  window._csTab = 'script';
  navigate('content-suggestions');
}

// Chuyển sang tab Script trong trang Đề xuất Content
function navContentScript() {
  window._csTab = 'script';
  navigate('content-suggestions');
}

function caReset() {
  if (window._ca.pollTimer) clearInterval(window._ca.pollTimer);
  // Giữ cache catalog khi reset để không cần reload
  var cachedProducts = window._ca.catalogProducts;
  window._ca = { step: 1, jobId: null, pollTimer: null, intel: null, scripts: [],
    activeVariant: 'emotional', filmingGuide: null, filmingScript: null,
    catalogProducts: cachedProducts, _selectedProduct: null, _selectedUsps: null, _lastRequest: null,
    _sourceSuggestionId: null, _prefill: null };
}

function renderContentAgent() {
  // Reset poll timer when page re-renders
  if (window._ca.pollTimer) { clearInterval(window._ca.pollTimer); window._ca.pollTimer = null; }

  var step = window._ca.step;

  var stepsHtml = ['Phân tích sản phẩm','Xem USP & Đối tượng','Tạo kịch bản','Hướng dẫn quay phim'].map(function(s, i) {
    var num = i + 1;
    var active = step === num ? 'style="color:var(--accent-amber);border-color:var(--accent-amber);background:rgba(234,179,8,0.12);"' : (step > num ? 'style="color:var(--accent-emerald);border-color:var(--accent-emerald);background:rgba(16,185,129,0.1);"' : '');
    var icon = step > num ? '✓' : num;
    return '<div style="display:flex;align-items:center;gap:8px;font-size:0.8rem;color:var(--text-muted);">'
      + '<div style="width:26px;height:26px;border-radius:50%;border:2px solid var(--border-primary);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.75rem;flex-shrink:0;' + (active ? '' : '') + '" ' + active + '>' + icon + '</div>'
      + '<span ' + (step === num ? 'style="color:var(--text-primary);font-weight:600;"' : '') + '>' + s + '</span></div>';
  }).join('<div style="width:24px;height:1px;background:var(--border-primary);margin:0 4px;"></div>');

  var bodyHtml = '';

  // ── Step 1: Input form (NEW — Product selector thay thế URL crawl) ──
  if (step === 1) {
    // Render products đã cache hoặc placeholder
    var products = window._ca.catalogProducts || [];
    var productOptions = products.length
      ? products.map(function(p) {
          return '<option value="' + p.product_id + '" data-name="' + p.name + '" data-usp="' + encodeURIComponent(JSON.stringify(p.usp||[])) + '" data-price="' + p.price + '">'
            + p.short_name + ' — ' + (p.price ? Number(p.price).toLocaleString('vi-VN') + 'đ' : '') + '</option>';
        }).join('')
      : '<option value="">⏳ Đang tải danh sách sản phẩm...</option>';

    // Render USP checkboxes nếu đã có sản phẩm được chọn
    var selectedProduct = window._ca._selectedProduct || (products[0] || null);
    var uspList = selectedProduct ? (selectedProduct.usp || []) : [];
    var uspCheckboxes = uspList.length
      ? uspList.map(function(u, i) {
          var checked = !window._ca._selectedUsps || window._ca._selectedUsps.indexOf(u) !== -1 ? 'checked' : '';
          return '<label style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;background:var(--bg-glass);border-radius:8px;cursor:pointer;font-size:0.8rem;color:var(--text-secondary);line-height:1.4;">'
            + '<input type="checkbox" data-usp-item="' + i + '" value="' + encodeURIComponent(u) + '" ' + checked + ' style="margin-top:2px;accent-color:#d97706;flex-shrink:0;">'
            + '<span>' + u + '</span></label>';
        }).join('')
      : '<div style="font-size:0.8rem;color:var(--text-muted);padding:8px;">Chọn sản phẩm để xem USP</div>';

    bodyHtml = '<div class="content-card" style="max-width:740px;margin:0 auto;">'
      // Product selector
      + '<div class="content-card-title">🎯 Chọn sản phẩm & cấu hình content</div>'
      + '<div style="margin-bottom:16px;">'
      + '<label style="font-size:0.78rem;color:var(--text-secondary);font-weight:600;margin-bottom:6px;display:block;">Sản phẩm</label>'
      + '<select id="caProductSelect" style="width:100%;padding:11px 14px;border-radius:10px;border:1.5px solid var(--border-primary);background:var(--bg-card);color:var(--text-primary);font-size:0.875rem;">'
      + productOptions
      + '</select></div>'

      // Content type + Brand tone
      + '<div class="grid-2" style="gap:14px;margin-bottom:16px;">'
      + '<div><label style="font-size:0.78rem;color:var(--text-secondary);font-weight:600;margin-bottom:6px;display:block;">Loại content</label>'
      + '<select id="caContentType" style="width:100%;padding:10px 12px;border-radius:10px;border:1.5px solid var(--border-primary);background:var(--bg-card);color:var(--text-primary);font-size:0.875rem;">'
      + '<option value="tiktok_30s">🎵 TikTok 30s</option>'
      + '<option value="tiktok_15s">⚡ TikTok 15s</option>'
      + '<option value="tiktok_60s">🎬 TikTok 60s</option>'
      + '<option value="reels_30s">📱 Instagram Reels 30s</option>'
      + '<option value="reels_60s">📱 Instagram Reels 60s</option>'
      + '<option value="youtube_short">▶️ YouTube Short</option>'
      + '<option value="shopee_video">🛒 Shopee Video</option>'
      + '<option value="facebook_post">📘 Facebook Post</option>'
      + '<option value="caption_instagram">📷 Caption Instagram</option>'
      + '</select></div>'
      + '<div><label style="font-size:0.78rem;color:var(--text-secondary);font-weight:600;margin-bottom:6px;display:block;">Tông giọng thương hiệu</label>'
      + '<select id="caBrandTone" style="width:100%;padding:10px 12px;border-radius:10px;border:1.5px solid var(--border-primary);background:var(--bg-card);color:var(--text-primary);font-size:0.875rem;">'
      + '<option value="Trẻ trung, vui vẻ, gần gũi">🌟 Trẻ trung & gần gũi</option>'
      + '<option value="Chuyên nghiệp, đáng tin cậy">💼 Chuyên nghiệp</option>'
      + '<option value="Hài hước, dí dỏm, viral">😄 Hài hước & viral</option>'
      + '<option value="Sang trọng, premium, tinh tế">✨ Sang trọng & premium</option>'
      + '<option value="Chân thực, honest review">🔍 Chân thực & honest</option>'
      + '</select></div>'
      + '</div>'

      // Target audience
      + '<div style="margin-bottom:16px;">'
      + '<label style="font-size:0.78rem;color:var(--text-secondary);font-weight:600;margin-bottom:6px;display:block;">Đối tượng mục tiêu</label>'
      + '<input id="caTargetAudience" type="text" placeholder="VD: Nữ sinh 16–22 tuổi, yêu thích makeup nhẹ nhàng, dùng TikTok hàng ngày" '
      + 'style="width:100%;padding:11px 14px;border-radius:10px;border:1.5px solid var(--border-primary);background:var(--bg-glass);color:var(--text-primary);font-size:0.85rem;outline:none;box-sizing:border-box;" />'
      + '</div>'

      // USP checkboxes
      + '<div style="margin-bottom:16px;">'
      + '<label style="font-size:0.78rem;color:var(--text-secondary);font-weight:600;margin-bottom:8px;display:block;">💡 USP muốn nhấn mạnh <span style="font-weight:400;color:var(--text-muted);">(tick để chọn — bỏ tick để loại bỏ)</span></label>'
      + '<div id="caUspCheckboxes" style="display:flex;flex-direction:column;gap:6px;">' + uspCheckboxes + '</div>'
      + '</div>'

      // Custom instructions
      + '<div style="margin-bottom:20px;">'
      + '<label style="font-size:0.78rem;color:var(--text-secondary);font-weight:600;margin-bottom:6px;display:block;">📝 Hướng dẫn tuỳ chỉnh <span style="font-weight:400;color:var(--text-muted);">(tuỳ chọn)</span></label>'
      + '<textarea id="caCustomInstructions" rows="2" placeholder="VD: Nhắm đến học sinh sắp thi, hook phải liên quan đến stress học tập. Không dùng từ ngữ quá trẻ con." '
      + 'style="width:100%;padding:11px 14px;border-radius:10px;border:1.5px solid var(--border-primary);background:var(--bg-glass);color:var(--text-primary);font-size:0.85rem;resize:vertical;box-sizing:border-box;outline:none;"></textarea>'
      + '</div>'

      // AI capabilities reminder
      + '<div style="background:rgba(234,179,8,0.06);border:1px solid rgba(234,179,8,0.2);border-radius:10px;padding:14px;margin-bottom:20px;">'
      + '<div style="font-size:0.78rem;font-weight:700;color:var(--accent-amber);margin-bottom:8px;">✨ AI sẽ tạo ra:</div>'
      + '<div style="font-size:0.8rem;color:var(--text-secondary);line-height:1.9;">'
      + '💡 Phân tích USP & định vị sản phẩm &nbsp;·&nbsp; 🎯 Chân dung khách hàng mục tiêu<br>'
      + '🎬 3 phiên bản kịch bản: Cảm xúc · Thông tin · Hài hước<br>'
      + '🎙 Voiceover + Caption on-screen + Gợi ý hình ảnh cho từng cảnh &nbsp;·&nbsp; 📱 Caption & Hashtag tối ưu'
      + '</div></div>'

      + '<button id="caAnalyzeBtn" style="width:100%;padding:14px;background:linear-gradient(135deg,#d97706,#eab308);color:#1a0800;font-weight:800;font-size:0.95rem;border:none;border-radius:12px;cursor:pointer;letter-spacing:0.3px;">'
      + '🚀 Phân tích & Tạo Content Script'
      + '</button></div>';

  // ── Step 2: Analyzing ──
  } else if (step === 2) {
    var pct = window._ca.progress || 10;
    var stepLabel = window._ca.stepLabel || 'Đang khởi động...';
    bodyHtml = '<div class="content-card" style="max-width:620px;margin:0 auto;text-align:center;padding:40px 32px;">'
      + '<div style="font-size:3rem;margin-bottom:16px;">🤖</div>'
      + '<div style="font-weight:800;font-size:1.1rem;color:var(--text-primary);margin-bottom:6px;">AI đang phân tích sản phẩm...</div>'
      + '<div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:24px;" id="caStepLabel">' + stepLabel + '</div>'
      + '<div style="background:var(--bg-glass);border-radius:999px;height:10px;margin-bottom:8px;overflow:hidden;">'
      + '<div id="caProgressBar" style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#d97706,#eab308);border-radius:999px;transition:width 0.5s ease;"></div></div>'
      + '<div style="font-size:0.75rem;color:var(--text-muted);" id="caProgressPct">' + pct + '%</div>'
      + '<div style="margin-top:24px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center;" id="caProgressSteps"></div>'
      + '</div>';

  // ── Step 3: Intel results ──
  } else if (step === 3) {
    var intel = window._ca.intel || {};
    var usps = intel.usp || [];
    var audience = intel.audience || [];
    var positioning = intel.positioning || '';
    var tone = intel.content_tone || '';
    var format = intel.recommended_content_format || '';
    var key_msg = intel.key_message || '';

    var uspHtml = usps.map(function(u) {
      return '<div style="display:flex;gap:10px;padding:12px;background:var(--bg-glass);border-radius:10px;border:1px solid var(--border-primary);">'
        + '<div style="width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#d97706,#eab308);color:#1a0800;font-weight:800;font-size:0.75rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' + (u.rank||'•') + '</div>'
        + '<div><div style="font-weight:700;font-size:0.88rem;color:var(--text-primary);margin-bottom:3px;">' + (u.point||'') + '</div>'
        + '<div style="font-size:0.78rem;color:var(--text-muted);">💬 ' + (u.evidence||'') + '</div></div></div>';
    }).join('');

    var audienceHtml = audience.map(function(a) {
      return '<div style="padding:14px;background:var(--bg-glass);border-radius:10px;border:1px solid var(--border-primary);">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">'
        + '<div style="font-size:1.2rem;">👤</div>'
        + '<div><div style="font-weight:700;font-size:0.88rem;color:var(--text-primary);">' + (a.persona||'') + '</div>'
        + '<div style="font-size:0.72rem;color:var(--accent-amber);">' + (a.age_range||'') + '</div></div></div>'
        + '<div style="font-size:0.78rem;color:var(--text-secondary);line-height:1.7;">'
        + '😤 <b>Pain:</b> ' + (a.pain_point||'') + '<br>'
        + '💡 <b>Trigger:</b> ' + (a.buying_trigger||'') + '<br>'
        + '🎬 <b>Content:</b> ' + (a.preferred_content||'') + '</div></div>';
    }).join('');

    bodyHtml = '<div style="display:flex;flex-direction:column;gap:20px;">'
      // Summary bar
      + '<div style="display:flex;gap:12px;flex-wrap:wrap;">'
      + '<div style="flex:1;min-width:180px;padding:14px 16px;background:rgba(234,179,8,0.06);border:1px solid rgba(234,179,8,0.2);border-radius:12px;">'
      + '<div style="font-size:0.7rem;font-weight:700;color:var(--accent-amber);text-transform:uppercase;margin-bottom:4px;">Định vị</div>'
      + '<div style="font-size:0.85rem;color:var(--text-primary);">' + positioning + '</div></div>'
      + '<div style="flex:1;min-width:180px;padding:14px 16px;background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.2);border-radius:12px;">'
      + '<div style="font-size:0.7rem;font-weight:700;color:#818cf8;text-transform:uppercase;margin-bottom:4px;">Giọng điệu</div>'
      + '<div style="font-size:0.85rem;color:var(--text-primary);">' + tone + '</div></div>'
      + '<div style="flex:1;min-width:180px;padding:14px 16px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.2);border-radius:12px;">'
      + '<div style="font-size:0.7rem;font-weight:700;color:var(--accent-emerald);text-transform:uppercase;margin-bottom:4px;">Format đề xuất</div>'
      + '<div style="font-size:0.85rem;color:var(--text-primary);">' + format + '</div></div>'
      + '</div>'
      // USP
      + '<div class="content-card">'
      + '<div class="content-card-title">💡 Điểm bán nổi bật (USP)</div>'
      + '<div style="display:flex;flex-direction:column;gap:10px;">' + uspHtml + '</div>'
      + (key_msg ? '<div style="margin-top:14px;padding:12px 14px;background:rgba(234,179,8,0.08);border-radius:10px;border-left:3px solid var(--accent-amber);font-size:0.85rem;color:var(--text-primary);"><b>💬 Key message:</b> ' + key_msg + '</div>' : '')
      + '</div>'
      // Audience
      + '<div class="content-card">'
      + '<div class="content-card-title">🎯 Chân dung khách hàng mục tiêu</div>'
      + '<div class="grid-2" style="gap:12px;">' + audienceHtml + '</div></div>'
      // CTA
      + '<div style="display:flex;gap:12px;">'
      + '<button id="caGenScriptBtn" style="flex:1;padding:13px;background:linear-gradient(135deg,#d97706,#eab308);color:#1a0800;font-weight:800;font-size:0.9rem;border:none;border-radius:12px;cursor:pointer;">🎬 Tạo kịch bản video (3 phiên bản)</button>'
      + '<button id="caResetBtn" style="padding:13px 20px;background:var(--bg-glass);color:var(--text-secondary);font-size:0.85rem;border:1px solid var(--border-primary);border-radius:12px;cursor:pointer;">↺ Phân tích lại</button>'
      + '</div></div>';

  // ── Step 4: Scripts ──
  } else if (step === 4) {
    var scripts = window._ca.scripts || [];
    var activeVariant = window._ca.activeVariant || 'emotional';
    var script = scripts.find(function(s) { return s.variant === activeVariant; }) || scripts[0];

    var variantLabels = { emotional: '❤️ Cảm xúc', informational: '📊 Thông tin', humor: '😄 Hài hước' };
    var variantTabs = ['emotional','informational','humor'].map(function(v) {
      var isActive = v === activeVariant;
      return '<button data-ca-variant="' + v + '" style="flex:1;padding:10px;border-radius:10px;font-weight:700;font-size:0.82rem;cursor:pointer;border:' + (isActive ? '2px solid var(--accent-amber)' : '1.5px solid var(--border-primary)') + ';background:' + (isActive ? 'rgba(234,179,8,0.12)' : 'var(--bg-glass)') + ';color:' + (isActive ? 'var(--accent-amber)' : 'var(--text-secondary)') + ';">' + (variantLabels[v]||v) + '</button>';
    }).join('');

    // Detect from actual script fields — never trust window._ca.is_text_post alone,
    // because old DB suggestions may have wrong type labels that cause backend to return wrong value.
    // Text post: has "body" field, no "timeline" or "scenes".
    // Video post: has "timeline" (new) or "scenes" (legacy).
    var isTextPost = script
      ? (typeof script.body !== 'undefined' && !Array.isArray(script.timeline) && !script.scenes)
      : (window._ca.is_text_post || false);
    var tagsHtml = script && script.hashtags ? script.hashtags.map(function(h) {
      return '<span style="padding:4px 10px;background:rgba(14,165,233,0.12);color:#38bdf8;border-radius:20px;font-size:0.75rem;font-weight:600;">' + h + '</span>';
    }).join('') : '';

    var scriptCardHtml = '';
    if (!script) {
      scriptCardHtml = '<div class="content-card"><div style="color:var(--text-muted);text-align:center;padding:24px;">Không có nội dung cho phiên bản này</div></div>';
    } else if (isTextPost) {
      // ── TEXT POST layout (Facebook / Instagram caption) ──
      scriptCardHtml = '<div class="content-card">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:16px;">'
        + '<div class="content-card-title" style="margin-bottom:0;">📘 Bài đăng — ' + (variantLabels[activeVariant]||activeVariant) + '</div>'
        + '</div>'
        + (script.body ? '<div style="background:var(--bg-glass);border-radius:10px;padding:14px;font-size:0.88rem;color:var(--text-primary);line-height:1.7;white-space:pre-wrap;margin-bottom:12px;">' + script.body + '</div>' : '')
        + (script.cta ? '<div style="padding:12px;background:rgba(217,119,6,0.08);border-radius:10px;border-left:3px solid #d97706;margin-bottom:12px;">'
            + '<span style="font-size:0.75rem;font-weight:800;color:#d97706;text-transform:uppercase;">Call to Action</span>'
            + '<div style="font-size:0.88rem;color:var(--text-primary);margin-top:4px;">' + script.cta + '</div></div>' : '')
        + (tagsHtml ? '<div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;">' + tagsHtml + '</div>' : '')
        + (script.caption_post ? '<div style="padding:12px;background:rgba(99,102,241,0.06);border-radius:10px;border:1px solid rgba(99,102,241,0.15);">'
            + '<div style="font-size:0.7rem;font-weight:700;color:#818cf8;margin-bottom:6px;text-transform:uppercase;">📋 Caption hoàn chỉnh — sẵn sàng đăng</div>'
            + '<div style="font-size:0.82rem;color:var(--text-secondary);line-height:1.65;white-space:pre-wrap;">' + script.caption_post + '</div></div>' : '')
        + '</div>';
    } else {
      // ── VIDEO SCRIPT layout — UGC TikTok skeletal format ──

      // ── Scene Setup / Subject strip ──
      var setupHtml = '';
      if (script.style || script.scene_setup || script.subject) {
        setupHtml = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;">';
        if (script.style)       setupHtml += '<div style="background:rgba(99,102,241,0.07);border-radius:8px;padding:8px 10px;"><div style="font-size:0.65rem;font-weight:800;color:#818cf8;text-transform:uppercase;margin-bottom:3px;">🎭 Style</div><div style="font-size:0.78rem;color:var(--text-primary);line-height:1.4;">' + script.style + '</div></div>';
        if (script.scene_setup) setupHtml += '<div style="background:rgba(16,185,129,0.07);border-radius:8px;padding:8px 10px;"><div style="font-size:0.65rem;font-weight:800;color:#10b981;text-transform:uppercase;margin-bottom:3px;">🏠 Scene Setup</div><div style="font-size:0.78rem;color:var(--text-primary);line-height:1.4;">' + script.scene_setup + '</div></div>';
        if (script.subject)     setupHtml += '<div style="background:rgba(234,179,8,0.07);border-radius:8px;padding:8px 10px;"><div style="font-size:0.65rem;font-weight:800;color:#d97706;text-transform:uppercase;margin-bottom:3px;">🧍 Subject</div><div style="font-size:0.78rem;color:var(--text-primary);line-height:1.4;">' + script.subject + '</div></div>';
        setupHtml += '</div>';
      }

      // ── Timeline ──
      var timelineHtml = '';
      var shotColors = { 'Hook Shot': '#ef4444', 'Reveal': '#6366f1', 'Demo Shot': '#0ea5e9', 'Proof Shot': '#10b981', 'CTA Shot': '#d97706' };
      if (Array.isArray(script.timeline) && script.timeline.length > 0) {
        timelineHtml = '<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px;">';
        script.timeline.forEach(function(seg) {
          var shotType = seg.shot_type || '';
          var borderColor = shotColors[shotType] || '#6366f1';
          var bgColor = borderColor + '0d'; // ~5% opacity hex
          timelineHtml += '<div style="border-left:3px solid ' + borderColor + ';border-radius:0 10px 10px 0;background:var(--bg-glass);padding:12px 14px;">';
          // Timecode + Shot type header
          timelineHtml += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap;">';
          timelineHtml += '<code style="background:rgba(0,0,0,0.06);color:var(--text-primary);font-size:0.75rem;font-weight:700;padding:2px 8px;border-radius:6px;letter-spacing:0.04em;">' + (seg.timecode||'') + '</code>';
          timelineHtml += '<span style="font-size:0.72rem;font-weight:800;color:' + borderColor + ';text-transform:uppercase;letter-spacing:0.03em;">' + shotType + '</span>';
          timelineHtml += '</div>';
          // Action
          if (seg.action) timelineHtml += '<div style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:6px;">🎬 ' + seg.action + '</div>';
          // Dialogue
          if (seg.dialogue) timelineHtml += '<div style="font-size:0.85rem;color:var(--text-primary);font-weight:600;margin-bottom:6px;padding:6px 10px;background:rgba(234,179,8,0.06);border-radius:6px;">💬 "' + seg.dialogue + '"</div>';
          // Performance + Lighting in 2-col
          if (seg.performance_note || seg.lighting) {
            timelineHtml += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px;">';
            if (seg.performance_note) timelineHtml += '<div style="font-size:0.72rem;color:#818cf8;">🎭 ' + seg.performance_note + '</div>';
            if (seg.lighting)         timelineHtml += '<div style="font-size:0.72rem;color:#f59e0b;">💡 ' + seg.lighting + '</div>';
            timelineHtml += '</div>';
          }
          timelineHtml += '</div>';
        });
        timelineHtml += '</div>';
      } else if (script.scenes) {
        // Legacy format fallback (scenes with voiceover/caption/visual_note)
        var legacyColors = { hook: '#ef4444', body: '#0ea5e9', proof: '#10b981', cta: '#d97706' };
        var legacyLabels = { hook: 'HOOK', body: 'NỘI DUNG', proof: 'BẰNG CHỨNG', cta: 'CTA' };
        timelineHtml = '<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px;">';
        script.scenes.forEach(function(scene) {
          var c = legacyColors[scene.type] || '#6366f1';
          timelineHtml += '<div style="display:flex;gap:14px;padding:12px 14px;background:var(--bg-glass);border-radius:10px;border-left:3px solid ' + c + ';">'
            + '<div style="flex-shrink:0;text-align:center;min-width:52px;"><div style="font-size:0.65rem;font-weight:800;color:' + c + ';text-transform:uppercase;">' + (legacyLabels[scene.type]||scene.type) + '</div><div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">' + (scene.time_range||'') + '</div></div>'
            + '<div style="flex:1;"><div style="font-size:0.83rem;color:var(--text-primary);margin-bottom:5px;line-height:1.5;">🎙 ' + (scene.voiceover||'') + '</div>'
            + '<div style="font-size:0.78rem;color:var(--accent-amber);margin-bottom:3px;">📝 ' + (scene.caption||'') + '</div>'
            + '<div style="font-size:0.74rem;color:var(--text-muted);">🎥 ' + (scene.visual_note||'') + '</div>'
            + '</div></div>';
        });
        timelineHtml += '</div>';
      }

      // ── Camera / Framing / Performance / Lighting strip ──
      var techHtml = '';
      var techFields = [
        { key: 'camera',      icon: '📷', label: 'Camera' },
        { key: 'framing',     icon: '🔲', label: 'Framing' },
        { key: 'performance', icon: '🎭', label: 'Performance' },
        { key: 'lighting',    icon: '💡', label: 'Lighting' },
      ];
      var techItems = techFields.filter(function(f) { return script[f.key]; });
      if (techItems.length > 0) {
        techHtml = '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:14px;">';
        techItems.forEach(function(f) {
          techHtml += '<div style="background:var(--bg-glass);border-radius:8px;padding:8px 10px;border:1px solid var(--border-primary);">'
            + '<div style="font-size:0.65rem;font-weight:800;color:var(--text-muted);text-transform:uppercase;margin-bottom:3px;">' + f.icon + ' ' + f.label + '</div>'
            + '<div style="font-size:0.78rem;color:var(--text-secondary);line-height:1.4;">' + script[f.key] + '</div>'
            + '</div>';
        });
        techHtml += '</div>';
      }

      scriptCardHtml = '<div class="content-card">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:14px;">'
        + '<div class="content-card-title" style="margin-bottom:0;">🎬 Kịch bản — ' + (variantLabels[activeVariant]||activeVariant) + '</div>'
        + '</div>'
        + setupHtml
        + timelineHtml
        + techHtml
        + (script.cta ? '<div style="margin-bottom:12px;padding:12px;background:rgba(217,119,6,0.08);border-radius:10px;border-left:3px solid #d97706;">'
          + '<span style="font-size:0.72rem;font-weight:800;color:#d97706;text-transform:uppercase;">📣 Call to Action</span>'
          + '<div style="font-size:0.88rem;color:var(--text-primary);margin-top:4px;">' + script.cta + '</div></div>' : '')
        + (tagsHtml ? '<div style="margin-bottom:10px;display:flex;gap:8px;flex-wrap:wrap;">' + tagsHtml + '</div>' : '')
        + (script.caption_post ? '<div style="padding:12px;background:rgba(99,102,241,0.06);border-radius:10px;border:1px solid rgba(99,102,241,0.15);">'
          + '<div style="font-size:0.68rem;font-weight:800;color:#818cf8;margin-bottom:6px;text-transform:uppercase;">📋 Caption hoàn chỉnh</div>'
          + '<div style="font-size:0.82rem;color:var(--text-secondary);line-height:1.65;white-space:pre-wrap;">' + script.caption_post + '</div></div>' : '')
        + '</div>';
    }

    // Action bar: unified save button (always visible)
    var saveLabel = window._ca._sourceSuggestionId
      ? '💾 Cập nhật kịch bản đã lưu'
      : '💾 Lưu kịch bản';
    var actionBarHtml = '<div class="content-card" style="padding:12px 16px;">'
      + '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">'
      + '<button id="caSaveScriptBtn" style="padding:9px 16px;background:rgba(16,185,129,0.12);color:var(--accent-emerald);border:1.5px solid var(--accent-emerald);border-radius:10px;font-weight:700;font-size:0.82rem;cursor:pointer;">' + saveLabel + '</button>'
      + (!isTextPost ? '<button id="caFilmingBtn" style="padding:9px 16px;background:rgba(234,179,8,0.1);color:var(--accent-amber);border:1.5px solid var(--accent-amber);border-radius:10px;font-weight:700;font-size:0.82rem;cursor:pointer;">🎥 Hướng dẫn quay</button>' : '')
      + '<span style="font-size:0.75rem;color:var(--text-muted);">Lưu kịch bản đang xem vào Đề xuất AI để truy cập lại sau</span>'
      + '</div></div>';

    bodyHtml = '<div style="display:flex;flex-direction:column;gap:20px;">'
      + '<div style="display:flex;gap:10px;">' + variantTabs + '</div>'
      + scriptCardHtml
      + actionBarHtml
      // Feedback section
      + '<div class="content-card">'
      + '<div class="content-card-title">✏️ Cải thiện kịch bản này</div>'
      + '<textarea id="caFeedbackText" rows="3" placeholder="VD: Làm hook mạnh hơn, thêm thống kê cụ thể, giọng điệu trẻ hơn..." style="width:100%;padding:12px;border-radius:10px;border:1.5px solid var(--border-primary);background:var(--bg-glass);color:var(--text-primary);font-size:0.85rem;resize:vertical;box-sizing:border-box;"></textarea>'
      + '<div style="display:flex;gap:10px;margin-top:10px;">'
      + '<button id="caFeedbackBtn" style="flex:1;padding:11px;background:rgba(99,102,241,0.15);color:#818cf8;border:1.5px solid rgba(99,102,241,0.3);border-radius:10px;font-weight:700;font-size:0.85rem;cursor:pointer;">🔄 Cải thiện với AI</button>'
      + '<button id="caBackBtn" style="padding:11px 16px;background:var(--bg-glass);color:var(--text-secondary);border:1px solid var(--border-primary);border-radius:10px;font-size:0.85rem;cursor:pointer;">← Xem lại USP</button>'
      + '</div></div>'
      + '</div>';

  // ── Step 5: Filming guide ──
  } else if (step === 5) {
    var guide = window._ca.filmingGuide || {};
    var filmScenes = guide.scenes || [];

    var filmScenesHtml = filmScenes.map(function(s) {
      var propsHtml = (s.props||[]).map(function(p){ return '<span style="padding:3px 8px;background:rgba(234,179,8,0.1);color:var(--accent-amber);border-radius:6px;font-size:0.72rem;">' + p + '</span>'; }).join('');
      return '<div style="padding:14px;background:var(--bg-glass);border-radius:12px;border:1px solid var(--border-primary);">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'
        + '<div style="font-weight:800;font-size:0.88rem;color:var(--text-primary);">Cảnh ' + (s.scene_no||'') + ' — ' + (s.duration||'') + '</div>'
        + '</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.8rem;margin-bottom:10px;">'
        + '<div style="padding:8px;background:rgba(14,165,233,0.07);border-radius:8px;"><span style="color:#38bdf8;font-weight:700;">⚙️ Setup:</span><br><span style="color:var(--text-secondary);">' + (s.setup||'') + '</span></div>'
        + '<div style="padding:8px;background:rgba(234,179,8,0.07);border-radius:8px;"><span style="color:var(--accent-amber);font-weight:700;">💡 Ánh sáng:</span><br><span style="color:var(--text-secondary);">' + (s.lighting||'') + '</span></div>'
        + '<div style="padding:8px;background:rgba(16,185,129,0.07);border-radius:8px;"><span style="color:var(--accent-emerald);font-weight:700;">📐 Góc quay:</span><br><span style="color:var(--text-secondary);">' + (s.angle||'') + '</span></div>'
        + '<div style="padding:8px;background:rgba(99,102,241,0.07);border-radius:8px;"><span style="color:#818cf8;font-weight:700;">💼 Props:</span><br><div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">' + (propsHtml||'<span style="color:var(--text-muted);">Không cần</span>') + '</div></div>'
        + '</div>'
        + (s.tip ? '<div style="padding:8px 12px;background:rgba(239,68,68,0.07);border-radius:8px;border-left:2px solid #ef4444;font-size:0.8rem;color:var(--text-secondary);">💡 <b style="color:#f87171;">Tip:</b> ' + s.tip + '</div>' : '')
        + '</div>';
    }).join('');

    bodyHtml = '<div style="display:flex;flex-direction:column;gap:20px;">'
      + '<div class="content-card">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'
      + '<div class="content-card-title" style="margin:0;">🎥 Hướng dẫn quay phim chi tiết</div>'
      + '<button id="caBackScript" style="padding:8px 14px;background:var(--bg-glass);color:var(--text-secondary);border:1px solid var(--border-primary);border-radius:10px;font-size:0.82rem;cursor:pointer;">← Về kịch bản</button>'
      + '</div>'
      + (filmScenesHtml || '<div style="color:var(--text-muted);padding:24px;text-align:center;">Đang tải hướng dẫn quay...</div>')
      + '</div>'
      + '</div>';
  }

  setTimeout(function() { initContentAgentEvents(); }, 60);

  return '<div style="display:flex;flex-direction:column;gap:20px;">'
    + '<div style="padding:14px 18px;background:linear-gradient(135deg,rgba(234,179,8,0.07),rgba(217,119,6,0.04));border-radius:12px;border:1px solid rgba(234,179,8,0.18);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">'
    + '<div style="display:flex;align-items:center;gap:10px;">'
    + '<span style="font-size:1.8rem;">🎬</span>'
    + '<div><div style="font-weight:800;font-size:1rem;color:var(--text-primary);">Content Agent</div>'
    + '<div style="font-size:0.76rem;color:var(--text-muted);">Phân tích sản phẩm → Tạo kịch bản TikTok chuyên nghiệp trong 60 giây</div></div>'
    + '</div>'
    + '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">' + stepsHtml + '</div>'
    + '</div>'
    + bodyHtml
    + '</div>';
}

// Chuyển đổi MOCK.products_detail sang format catalog dùng cho Content Agent.
// Map SKU → canonical P-ID để prefill từ suggestions hoạt động dù offline.
function _mockToCatalogProducts() {
  var skuToPid = {
    'GF-LGLOSS-M01':      'P001',
    'GF-MLIPSTICK-M09':   'P002',
    'GF-SPOWDER-TN':      'P003',
    'GF-CO1-ML-SPOWDER':  'P004',
    'GF-POWDER-18K':      'P006',
    'GF-LIPSET-06':       'P007',
    'GF-MKP-COMBO6':      'P008',
    'GF-BRUSH-13':        'P009',
    'HL-CLEANSER-80G':    'P011',
  };
  return (MOCK.products_detail || []).map(function(p, i) {
    var pid = skuToPid[p.sku] || p.sku || ('MOCK-' + i);
    return {
      product_id: pid,
      name: p.name,
      short_name: p.name.length > 30 ? p.name.substring(0, 30) + '…' : p.name,
      category: p.category || '',
      price: p.price || 0,
      usp: p.usp || [],
      status: 'active',
      _fromMock: true
    };
  });
}

function initContentAgentEvents() {
  // ── Load catalog products: dùng mock ngay, đồng thời thử fetch backend ──
  if (!window._ca.catalogProducts) {
    // Hiển thị mock ngay lập tức để không phải chờ
    var mockProducts = _mockToCatalogProducts();
    window._ca.catalogProducts = mockProducts;
    if (window._ca.step === 1) { navContentScript(); }

    // Song song: thử lấy từ backend để override (nếu backend đang chạy)
    fetch(API_BASE + '/api/content-agent/products')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.products && data.products.length > 0) {
          window._ca.catalogProducts = data.products;
          if (window._ca.step === 1) { navContentScript(); }
        }
      }).catch(function() { /* giữ mock */ });
  }

  // ── Khi chọn sản phẩm → cập nhật USP checkboxes ──
  var productSelect = document.getElementById('caProductSelect');
  if (productSelect) {
    productSelect.onchange = function() {
      var selectedId = productSelect.value;
      var products = window._ca.catalogProducts || [];
      var p = products.find(function(x) { return x.product_id === selectedId; });
      window._ca._selectedProduct = p || null;
      window._ca._selectedUsps = null; // reset selection
      // Re-render chỉ phần USP checkboxes
      var container = document.getElementById('caUspCheckboxes');
      if (container && p) {
        var uspList = p.usp || [];
        container.innerHTML = uspList.map(function(u, i) {
          return '<label style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;background:var(--bg-glass);border-radius:8px;cursor:pointer;font-size:0.8rem;color:var(--text-secondary);line-height:1.4;">'
            + '<input type="checkbox" data-usp-item="' + i + '" value="' + encodeURIComponent(u) + '" checked style="margin-top:2px;accent-color:#d97706;flex-shrink:0;">'
            + '<span>' + u + '</span></label>';
        }).join('') || '<div style="font-size:0.8rem;color:var(--text-muted);padding:8px;">Sản phẩm này chưa có USP</div>';
      }
    };
  }

  // ── Áp dụng prefill từ "Tạo script" trong Đề xuất AI ──
  var prefill = window._ca._prefill;
  if (prefill) {
    // Chọn sản phẩm theo product_id
    var productSelectEl2 = document.getElementById('caProductSelect');
    if (productSelectEl2 && prefill.product_id) {
      // Thử chọn theo value, nếu không khớp thì thử chứa chuỗi
      var opts = Array.from(productSelectEl2.options);
      var match = opts.find(function(o) { return o.value === prefill.product_id; })
                || opts.find(function(o) { return o.value.indexOf(prefill.product_id) !== -1; });
      if (match) {
        productSelectEl2.value = match.value;
        productSelectEl2.dispatchEvent(new Event('change'));
      }
    }
    // Chọn content type
    var ctEl = document.getElementById('caContentType');
    if (ctEl && prefill.content_type) ctEl.value = prefill.content_type;
    // Điền custom instructions từ góc tiếp cận đề xuất
    var instrEl = document.getElementById('caCustomInstructions');
    if (instrEl && prefill.custom_instructions) instrEl.value = prefill.custom_instructions;
    // Lưu suggestion ID gốc để nút "Lưu kịch bản" biết đề xuất nào cần cập nhật
    window._ca._sourceSuggestionId = prefill.suggestion_id || null;
    // Xoá prefill sau khi đã áp dụng
    window._ca._prefill = null;
  }

  // ── Nút Phân tích & Tạo Script ──
  var analyzeBtn = document.getElementById('caAnalyzeBtn');
  if (analyzeBtn) {
    analyzeBtn.onclick = function() {
      var products = window._ca.catalogProducts || [];
      var productSelectEl = document.getElementById('caProductSelect');
      var selectedId = productSelectEl ? productSelectEl.value : '';
      if (!selectedId) { showToast('Vui lòng chọn sản phẩm', 'warning'); return; }

      var selectedProduct = products.find(function(x) { return x.product_id === selectedId; }) || {};
      var contentType = (document.getElementById('caContentType') || {}).value || 'tiktok_30s';
      var brandTone = (document.getElementById('caBrandTone') || {}).value || 'Trẻ trung, vui vẻ, gần gũi';
      var targetAudience = (document.getElementById('caTargetAudience') || {}).value || '';
      var customInstructions = (document.getElementById('caCustomInstructions') || {}).value || '';

      // Lấy USP được tick
      var checkedBoxes = document.querySelectorAll('[data-usp-item]:checked');
      var selectedUsps = Array.from(checkedBoxes).map(function(cb) { return decodeURIComponent(cb.value); });
      if (!selectedUsps.length) {
        selectedUsps = selectedProduct.usp || [];
      }

      window._ca._lastRequest = {
        product_id: selectedId,
        product_name: selectedProduct.name || selectedId,
        product_description: selectedProduct.description || selectedProduct.name || '',
        usp_focus: selectedUsps,
        content_type: contentType,
        brand_tone: brandTone,
        target_audience: targetAudience,
        custom_instructions: customInstructions,
        trigger_source: 'manual',
      };

      caStartAnalysis(window._ca._lastRequest);
    };
  }

  var genBtn = document.getElementById('caGenScriptBtn');
  if (genBtn) {
    genBtn.onclick = function() { caGenerateScripts(); };
  }

  var resetBtn = document.getElementById('caResetBtn');
  if (resetBtn) { resetBtn.onclick = function() { caReset(); navContentScript(); }; }

  var filmBtn = document.getElementById('caFilmingBtn');
  if (filmBtn) {
    filmBtn.onclick = function() { caGetFilmingGuide(); };
  }

  var backBtn = document.getElementById('caBackBtn');
  if (backBtn) { backBtn.onclick = function() { window._ca.step = 3; navContentScript(); }; }

  var backScriptBtn = document.getElementById('caBackScript');
  if (backScriptBtn) { backScriptBtn.onclick = function() { window._ca.step = 4; navContentScript(); }; }

  var feedbackBtn = document.getElementById('caFeedbackBtn');
  if (feedbackBtn) {
    feedbackBtn.onclick = function() {
      var text = (document.getElementById('caFeedbackText')||{}).value || '';
      if (!text.trim()) { showToast('Vui lòng nhập phản hồi cụ thể', 'warning'); return; }
      caImproveScript(text);
    };
  }

  var saveScriptBtn = document.getElementById('caSaveScriptBtn');
  if (saveScriptBtn) { saveScriptBtn.onclick = function() { caSaveScript(); }; }

  // Variant tab buttons
  document.querySelectorAll('[data-ca-variant]').forEach(function(btn) {
    btn.onclick = function() {
      window._ca.activeVariant = btn.dataset.caVariant;
      navContentScript();
    };
  });
}

function caStartAnalysis(req) {
  // Guard: req null = được gọi thiếu thông tin sản phẩm
  if (!req || !req.product_id) {
    showToast('⚠️ Vui lòng chọn sản phẩm trước khi phân tích', 'warning');
    return;
  }
  // req = ContentScriptRequest object từ form
  window._ca.step = 2;
  window._ca.progress = 10;
  window._ca.stepLabel = 'AI đang phân tích USP & chân dung khách hàng...';
  navContentScript();

  // ── Bước 1: Gọi /intel để phân tích và hiển thị Step 3 ──
  var progressSteps = [
    { pct: 25, label: 'Phân tích điểm bán hàng nổi bật...', delay: 600 },
    { pct: 55, label: 'Xác định chân dung khách hàng mục tiêu...', delay: 1400 },
    { pct: 80, label: 'Đang tạo 3 phiên bản kịch bản...', delay: 2200 },
  ];
  progressSteps.forEach(function(s) {
    setTimeout(function() {
      window._ca.progress = s.pct; window._ca.stepLabel = s.label;
      var bar = document.getElementById('caProgressBar');
      var pctEl = document.getElementById('caProgressPct');
      var lblEl = document.getElementById('caStepLabel');
      if (bar) bar.style.width = s.pct + '%';
      if (pctEl) pctEl.textContent = s.pct + '%';
      if (lblEl) lblEl.textContent = s.label;
    }, s.delay);
  });

  fetch(API_BASE + '/api/content-agent/intel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  }).then(function(r) { return r.json(); }).then(function(data) {
    if (data.intel) {
      window._ca.intel = data.intel;
      // ── Bước 2: Gọi /generate-script để lấy 3 phiên bản script ──
      window._ca.stepLabel = 'Đang viết kịch bản chi tiết...';
      fetch(API_BASE + '/api/content-agent/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      }).then(function(r2) { return r2.json(); }).then(function(scriptData) {
        window._ca.scripts = scriptData.scripts || [];
        window._ca.is_text_post = scriptData.is_text_post || false;
        window._ca.activeVariant = 'emotional';
        window._ca.progress = 100;
        window._ca.step = 4;
        navContentScript();
        var label = window._ca.is_text_post ? 'bài đăng văn bản' : 'kịch bản';
        showToast('✅ Đã tạo ' + (scriptData.scripts||[]).length + ' phiên bản ' + label + '!', 'success');
      }).catch(function() { caSimulateScripts(); });
    } else {
      showToast('Lỗi phân tích: ' + (data.detail || 'Không có dữ liệu'), 'danger');
      caReset(); navContentScript();
    }
  }).catch(function() {
    // Fallback: simulate nếu backend chưa sẵn sàng
    caSimulateAnalysis();
  });
}

function caPollJob(jobId) {
  var progressMap = { scraping: 20, analyzing: 60, done: 100 };
  var labelMap = { scraping: 'Đang lấy dữ liệu sản phẩm...', analyzing: 'AI đang phân tích USP & đối tượng...', done: 'Hoàn tất phân tích!' };

  window._ca.pollTimer = setInterval(function() {
    fetch(API_BASE + '/api/v1/content-agent/jobs/' + jobId)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var pct = progressMap[data.step] || (window._ca.progress + 10);
      var lbl = labelMap[data.step] || data.step || 'Đang xử lý...';
      window._ca.progress = Math.min(pct, 95);
      window._ca.stepLabel = lbl;

      var bar = document.getElementById('caProgressBar');
      var pctEl = document.getElementById('caProgressPct');
      var lblEl = document.getElementById('caStepLabel');
      if (bar) bar.style.width = window._ca.progress + '%';
      if (pctEl) pctEl.textContent = window._ca.progress + '%';
      if (lblEl) lblEl.textContent = lbl;

      if (data.status === 'done' && data.result) {
        clearInterval(window._ca.pollTimer); window._ca.pollTimer = null;
        window._ca.intel = data.result;
        window._ca.intelId = jobId;
        window._ca.progress = 100;
        window._ca.step = 3;
        navContentScript();
        showToast('✅ Phân tích xong! AI phát hiện ' + (window._ca.intel.usp||[]).length + ' USP và ' + (window._ca.intel.audience||[]).length + ' nhóm khách hàng', 'success');
      } else if (data.status === 'error') {
        clearInterval(window._ca.pollTimer); window._ca.pollTimer = null;
        showToast('Lỗi phân tích: ' + (data.error||'Unknown error'), 'danger');
        caReset(); navContentScript();
      }
    }).catch(function() { /* keep polling */ });
  }, 1500);
}

function caSimulateAnalysis() {
  // Demo/offline mode — simulate a realistic flow
  var steps = [
    { pct: 20, label: 'Đang crawl thông tin sản phẩm...', delay: 800 },
    { pct: 45, label: 'AI đang phân tích review & đặc điểm...', delay: 1600 },
    { pct: 70, label: 'Xác định USP & đối tượng khách hàng...', delay: 2400 },
    { pct: 90, label: 'Hoàn thiện phân tích...', delay: 3200 },
  ];
  steps.forEach(function(s) {
    setTimeout(function() {
      window._ca.progress = s.pct; window._ca.stepLabel = s.label;
      var bar = document.getElementById('caProgressBar');
      var pctEl = document.getElementById('caProgressPct');
      var lblEl = document.getElementById('caStepLabel');
      if (bar) bar.style.width = s.pct + '%';
      if (pctEl) pctEl.textContent = s.pct + '%';
      if (lblEl) lblEl.textContent = s.label;
    }, s.delay);
  });
  setTimeout(function() {
    window._ca.intel = {
      usp: [
        { rank: 1, point: 'Bền màu transfer-proof cả ngày — kể cả sau ăn uống', evidence: '92% review đề cập độ bền màu vượt trội, không lem khi uống đồ nóng' },
        { rank: 2, point: 'Thành phần thuần chay, không chì — có Vitamin E dưỡng môi', evidence: 'Được kiểm nghiệm an toàn, phù hợp da nhạy cảm' },
        { rank: 3, point: 'Lì mịn hoàn toàn sau 2 phút — không cần blot', evidence: 'Công thức matte chuẩn lì, không co rút hay nhăn môi' }
      ],
      audience: [
        { persona_id: 'p1', persona: 'Nữ đi làm văn phòng', age_range: '22-32 tuổi', pain_point: 'Son hay trôi sau ăn trưa, phải touch-up nhiều lần', buying_trigger: 'Review thực tế bền màu cả ngày không cần touch-up', preferred_content: 'Video before/after sau bữa ăn, test độ bền' },
        { persona_id: 'p2', persona: 'Sinh viên & người trẻ', age_range: '18-25 tuổi', pain_point: 'Cần son đẹp nhưng ngân sách hạn chế', buying_trigger: 'So sánh màu sắc và giá trị với các thương hiệu cùng phân khúc', preferred_content: 'Video "đáng tiền không?" dạng honest review + swatch nhiều màu' }
      ],
      positioning: 'Đẹp chuẩn — bền thật — giá hợp lý: son kem lì dành cho người bận rộn',
      content_tone: 'Gần gũi, trung thực, tự tin — như bạn thân tư vấn son',
      recommended_content_format: 'Video swatch 30-60s + Reel test độ bền sau ăn',
      key_message: 'Thoa một lần, tự tin cả ngày — không lo touch-up'
    };
    window._ca.step = 3;
    navContentScript();
    showToast('✅ Phân tích xong! AI phát hiện 3 USP và 2 nhóm khách hàng (Demo Mode)', 'success');
  }, 4000);
}

function caGenerateScripts() {
  var intel = window._ca.intel;
  if (!intel) { showToast('Chưa có dữ liệu phân tích', 'warning'); return; }
  window._ca.step = 2;
  window._ca.progress = 10;
  window._ca.stepLabel = 'AI đang viết kịch bản video...';
  navContentScript();

  var intelId = window._ca.intelId;
  if (intelId) {
    fetch(API_BASE + '/api/v1/content-agent/script/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_intel_id: intelId, video_length: 30, variants: ['emotional','informational','humor'], language: 'vi' })
    }).then(function(r) { return r.json(); }).then(function(data) {
      if (data.job_id) { caPollScriptJob(data.job_id); }
      else { caSimulateScripts(); }
    }).catch(function() { caSimulateScripts(); });
  } else {
    caSimulateScripts();
  }
}

function caPollScriptJob(jobId) {
  var t = setInterval(function() {
    fetch(API_BASE + '/api/v1/content-agent/jobs/' + jobId)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var pct = Math.min((window._ca.progress || 10) + 15, 90);
      window._ca.progress = pct;
      var bar = document.getElementById('caProgressBar'); if (bar) bar.style.width = pct + '%';
      var pctEl = document.getElementById('caProgressPct'); if (pctEl) pctEl.textContent = pct + '%';
      if (data.status === 'done' && data.result) {
        clearInterval(t);
        window._ca.scripts = data.result;
        window._ca.step = 4;
        navContentScript();
        showToast('✅ Đã tạo ' + data.result.length + ' kịch bản video!', 'success');
      } else if (data.status === 'error') {
        clearInterval(t); caSimulateScripts();
      }
    }).catch(function() {});
  }, 1800);
}

function caSimulateScripts() {
  var steps2 = [
    { pct: 30, label: 'Viết kịch bản cảm xúc...', delay: 600 },
    { pct: 60, label: 'Viết kịch bản thông tin...', delay: 1400 },
    { pct: 85, label: 'Viết kịch bản hài hước...', delay: 2200 },
  ];
  steps2.forEach(function(s) {
    setTimeout(function() {
      window._ca.progress = s.pct; window._ca.stepLabel = s.label;
      var bar = document.getElementById('caProgressBar'); if (bar) bar.style.width = s.pct + '%';
      var pctEl = document.getElementById('caProgressPct'); if (pctEl) pctEl.textContent = s.pct + '%';
      var lblEl = document.getElementById('caStepLabel'); if (lblEl) lblEl.textContent = s.label;
    }, s.delay);
  });
  setTimeout(function() {
    window._ca.scripts = [
      {
        variant: 'emotional',
        style: 'UGC / Talking Head — Honest Review',
        scene_setup: 'Phòng ngủ ban ngày, ánh sáng tự nhiên từ cửa sổ, bàn trang điểm gọn gàng',
        subject: 'Cô gái 19–22 tuổi, mặc áo trắng casual, không makeup ban đầu',
        timeline: [
          { timecode: '00:00–00:03', shot_type: 'Hook Shot', action: 'Cận môi nhợt nhạt sau buổi trưa, biểu cảm thất vọng nhìn gương', dialogue: 'Tôi đã thử hơn 20 cây son kem lì — không cây nào ở được quá 3 tiếng...', performance_note: 'Thở dài, mắt hơi nhăn — cảm giác quen thuộc thất vọng', lighting: 'Warm tone, ánh sáng cửa sổ chiều tà, tránh flash cứng' },
          { timecode: '00:03–00:14', shot_type: 'Reveal', action: 'Cầm lên cây Son Kem Lì GIAO FARA, mỉm cười nhẹ, thoa lên môi', dialogue: 'Rồi tôi thử cái này. Thoa lúc 7 giờ sáng — bây giờ là 5 chiều.', performance_note: 'Giọng bình thản tự nhiên, không cố quảng cáo — như kể cho bạn bè', lighting: 'Tăng sáng nhẹ khi cận môi — dùng reflector hoặc đèn bàn nhỏ' },
          { timecode: '00:14–00:22', shot_type: 'Demo Shot', action: 'So sánh môi trước–sau (split screen hoặc transition nhanh)', dialogue: 'Sau khi ăn trưa, sau cà phê — vẫn còn màu. Tôi không hiểu tại sao nữa 😅', performance_note: 'Cười nhẹ, lắc đầu kiểu "không thể tin được"', lighting: 'Closeup môi, ánh sáng đều, tông màu trung tính để màu son hiện thực' },
          { timecode: '00:22–00:27', shot_type: 'Proof Shot', action: 'Flick nhanh qua thành phần bao bì / chứng nhận an toàn', dialogue: 'Không chì, có dưỡng Vitamin E. Môi tôi không bị khô sau cả ngày dài.', performance_note: 'Nói nhanh, tự tin, cầm hộp hướng camera', lighting: 'Flat lay sản phẩm trên nền trắng, ánh sáng đều từ trên' },
          { timecode: '00:27–00:30', shot_type: 'CTA Shot', action: 'Nhìn thẳng lens, chỉ tay lên/xuống về phía bio/giỏ hàng', dialogue: 'Link ở bio — giao trong ngày, đổi trả 7 ngày nếu không vừa ý.', performance_note: 'Mắt sáng, giọng ấm áp và chân thật — không cứng như đọc kịch bản', lighting: 'Giữ nguyên ánh sáng tự nhiên ấm — consistency xuyên suốt video' }
        ],
        camera: 'iPhone selfie cam hoặc điện thoại tầm trung, chân đế nhỏ, góc hơi cao 10–15° so với mắt',
        framing: 'Medium closeup (vai trở lên) là chủ đạo; chuyển closeup môi khi demo',
        performance: 'Cảm xúc chân thật, tự nhiên như nói chuyện bạn bè — không đọc kịch bản cứng, cho phép dừng ngập ngừng tự nhiên',
        lighting: 'Ánh sáng cửa sổ tự nhiên (hướng đông/tây buổi sáng/chiều), thêm reflector trắng phía đối diện để fill bóng mặt',
        cta: 'Nhấn link bio để xem đủ 12 màu Son Kem Lì GIAO FARA — giao trong ngày, đổi trả miễn phí!',
        hashtags: ['#sonkemlì', '#giaofara', '#sonbenmau', '#reviewson', '#lipswatch'],
        caption_post: 'Từ ngày dùng Son Kem Lì GIAO FARA, tôi không còn lo touch-up giữa ngày nữa 💄 Bền màu thật sự, môi không khô, giá hợp lý. Ai cần tag ngay bạn thân! 👇 Link trong bio nhé'
      },
      {
        variant: 'informational',
        style: 'Talking Head — Expert/Review Format với B-roll insert',
        scene_setup: 'Bàn trắng sạch, bố cục tối giản, sản phẩm + bảng màu swatch bày sẵn',
        subject: 'Bất kỳ ai — giọng điệu như beauty reviewer trên TikTok, phong thái bình tĩnh và có kiến thức',
        timeline: [
          { timecode: '00:00–00:03', shot_type: 'Hook Shot', action: 'Text animation "3 tiêu chí" xuất hiện, người quay nhìn thẳng', dialogue: '3 tiêu chí đánh giá son kem lì mà ít người để ý — và cái số 2 quyết định mọi thứ.', performance_note: 'Dừng ngắn trước câu cuối — tạo tension', lighting: 'Sáng đều, studio-look đơn giản với nền trắng hoặc xám nhạt' },
          { timecode: '00:03–00:16', shot_type: 'Demo Shot', action: 'Lần lượt demo từng tiêu chí: bôi son, ăn thử, lật bao bì, swatch tay', dialogue: 'Một — bền màu sau ăn uống. Hai — thành phần: có chì không, dưỡng môi không. Ba — độ phủ: lì hoàn toàn hay còn bóng?', performance_note: 'Nói từng điểm dứt khoát, dùng ngón tay đếm 1-2-3', lighting: 'Đèn ring light nhỏ hoặc softbox — đảm bảo sản phẩm sắc nét khi insert' },
          { timecode: '00:16–00:24', shot_type: 'Proof Shot', action: 'Bảng so sánh nhanh hiện lên / cầm 2 sản phẩm so sánh trực tiếp', dialogue: 'Son Kem Lì GIAO FARA đạt cả 3: bền 8h test thực tế, không chì có Vitamin E, lì mịn sau 2 phút thoa.', performance_note: 'Tự tin, chỉ thẳng vào sản phẩm — không vội vã', lighting: 'Flat lay insert: 2 sản phẩm cạnh nhau trên nền trắng, ánh sáng từ trên xuống' },
          { timecode: '00:24–00:30', shot_type: 'CTA Shot', action: 'Nhìn camera, giơ sản phẩm lên, chỉ xuống bio', dialogue: 'Inbox shop để được tư vấn chọn màu theo tone da — miễn phí 24/7.', performance_note: 'Mỉm cười ngắn, giọng thân thiện nhưng chuyên nghiệp', lighting: 'Giữ nguyên ánh sáng chính — consistency' }
        ],
        camera: 'Đặt trên tripod thẳng góc, ngang tầm mắt, distance 70–90cm từ mặt người quay',
        framing: 'Medium shot (ngang ngực trở lên); insert B-roll closeup sản phẩm khi demo',
        performance: 'Bình tĩnh, có kiến thức, không cố thân mật quá — như review beauty channel uy tín',
        lighting: 'Ring light 10 inch hoặc softbox nhỏ, đặt ngang tầm mắt, cách mặt 80cm; nền sáng trung tính',
        cta: 'Để lại tone da trong comment hoặc inbox để được tư vấn màu son phù hợp miễn phí!',
        hashtags: ['#sonkemlìreview', '#chonson', '#giaofara', '#muagidung', '#lipswatch'],
        caption_post: 'Son kem lì có thực sự xứng đáng không? Tôi đã test 30 ngày và đây là kết quả thực tế 📊 Đặc biệt màu Mã 12 — lì cực mịn, bền cả ngày. Xem trước khi xuống tiền nhé!'
      },
      {
        variant: 'humor',
        style: 'POV Selfie — Situational Comedy / Relatable Skit',
        scene_setup: 'Quán ăn / bàn ăn nhà, bố cục tự nhiên bộn bề một chút cho authenticity',
        subject: 'Bất kỳ ai — năng lượng hài hước, hay biểu cảm phóng đại vừa phải',
        timeline: [
          { timecode: '00:00–00:04', shot_type: 'Hook Shot', action: 'Selfie sau bữa ăn bún bò, cận mặt ngơ ngác nhìn gương điện thoại', dialogue: 'POV: vừa ăn xong một tô bún bò mà son vẫn... còn nguyên???', performance_note: 'Mắt mở to, cằm hơi hạ — biểu cảm "không thể tin được" phóng đại nhẹ', lighting: 'Ánh sáng quán hoặc nhà bếp tự nhiên — cứ để tự nhiên, đừng chỉnh quá' },
          { timecode: '00:04–00:18', shot_type: 'Demo Shot', action: 'Montage nhanh: ăn canh nóng → nhìn gương (còn), uống trà đá → nhìn gương (còn), ăn bánh tráng trộn → nhìn gương (vẫn còn)', dialogue: 'Canh nóng — còn. Nước chanh — còn. Bánh tráng trộn — VẪN CÒN. Tôi bắt đầu lo lắng cho chính bản thân mình.', performance_note: 'Mỗi lần nhìn gương tăng dần mức độ bất ngờ — từ ngạc nhiên → hoang mang → gần như sợ hãi', lighting: 'Tự nhiên, không cần thêm gì — tông màu ấm của quán ăn thực tế rất cinematic' },
          { timecode: '00:18–00:24', shot_type: 'Proof Shot', action: 'Cut sang cầm hộp son GIAO FARA nhìn thẳng camera, gật đầu nghiêm túc', dialogue: 'Không phải ma thuật — là công thức transfer-proof của GIAO FARA. Bền 8 tiếng, có kiểm chứng.', performance_note: 'Chuyển sang "serious face" đột ngột — tương phản hài hước với các scene trước', lighting: 'Chuyển sang ánh sáng hơi sáng hơn, clean hơn — tạo contrast với scenes hài phía trên' },
          { timecode: '00:24–00:30', shot_type: 'CTA Shot', action: 'Nhìn camera, chỉ xuống, lắc đầu cười', dialogue: 'Link ở bio. Mọi hậu quả ăn quá nhiều vì tự tin son không lem — shop không chịu trách nhiệm đâu nhé 😂', performance_note: 'Nháy mắt hoặc cười nhẹ ở cuối — "wink" kết video', lighting: 'Giữ nguyên ánh sáng scene trước' }
        ],
        camera: 'Selfie cam cầm tay hoặc gắn selfie stick ngắn — không cần tripod, handheld movement tự nhiên là tốt',
        framing: 'Selfie angle hơi cao (15–20°), portrait mode; đôi khi wide hơn để thấy ngữ cảnh bàn ăn',
        performance: 'Năng lượng tự nhiên, hài hước không cố, cho phép cười xịt — đó là content tốt nhất',
        lighting: 'Dùng ánh sáng thực tế nơi quay — ánh sáng quán ăn ấm thực ra rất đẹp và authentic',
        cta: 'Mua về rồi ăn nhiều quá mà son vẫn còn thì... đó là tính năng chứ không phải lỗi nhé 😂',
        hashtags: ['#sonkemlì', '#giaofara', '#benhmau', '#trend', '#haihuoc'],
        caption_post: 'Shop xin miễn trách nhiệm nếu bạn ăn quá nhiều vì tự tin son không lem 😂 Bền thật sự rồi, không tin thì thử! 💄 Link mua trong bio nha cả nhà'
      }
    ];
    window._ca.step = 4;
    navContentScript();
    showToast('✅ Đã tạo 3 kịch bản video! (Demo Mode)', 'success');
  }, 3000);
}

function caGetFilmingGuide() {
  var scripts = window._ca.scripts;
  var script = scripts.find(function(s){ return s.variant === window._ca.activeVariant; }) || scripts[0];
  if (!script) { showToast('Không có kịch bản để tạo hướng dẫn quay', 'warning'); return; }

  // Try real API, fall back to demo
  fetch(API_BASE + '/api/v1/content-agent/filming-guide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script_id: 'demo-script', variant: window._ca.activeVariant, equipment: 'phone', location: 'home' })
  }).then(function(r) { return r.json(); }).then(function(data) {
    if (data.scenes) {
      window._ca.filmingGuide = data;
      window._ca.step = 5;
      navContentScript();
    } else { caSimulateFilmingGuide(script); }
  }).catch(function() { caSimulateFilmingGuide(script); });
}

function caSimulateFilmingGuide(script) {
  // Support new timeline format; fall back to legacy scenes
  var segments = Array.isArray(script.timeline) && script.timeline.length > 0
    ? script.timeline
    : (script.scenes || []).map(function(s) {
        return { timecode: s.time_range, shot_type: s.type, action: s.voiceover };
      });
  var setups = ['Đặt điện thoại trên tripod cách 60-80cm, ngang tầm mắt', 'Cầm điện thoại tay, di chuyển chậm từ trái sang phải', 'Đặt sản phẩm trên bàn trắng, quay từ trên xuống (flat lay)'];
  var lightings = [
    script.lighting || 'Ánh sáng tự nhiên từ cửa sổ — đặt nhân vật đối diện cửa',
    'Đèn ring light 10 inch đặt ngang mặt, cách 80cm',
    'Ánh sáng phòng bình thường, thêm đèn bàn chiếu sản phẩm'
  ];
  var angles = ['Eye-level — thẳng mắt tạo cảm giác kết nối', 'Close-up 45° từ trên xuống — làm nổi bật sản phẩm', 'Wide shot — thu gọn toàn cảnh bối cảnh'];
  var tips = ['Giữ điện thoại bằng 2 tay và khuỷu tay tì vào người để tránh rung', 'Quay nhiều takes, chọn cái tự nhiên nhất', 'Mặc đồ tối màu để sản phẩm nổi bật hơn'];
  var guideScenes = segments.map(function(s, i) {
    return {
      scene_no: i + 1,
      duration: s.timecode || ('Segment ' + (i+1)),
      setup: (script.camera || setups[i % setups.length]),
      lighting: (s.lighting || lightings[i % lightings.length]),
      angle: angles[i % angles.length],
      props: i === 0 ? ['Sản phẩm GIAO FARA', 'Gương trang điểm nhỏ'] : (i === 1 ? ['Sản phẩm', 'Bàn trắng sạch'] : ['Hộp sản phẩm', 'Tờ rơi chính hãng']),
      tip: tips[i % tips.length]
    };
  });
  window._ca.filmingGuide = { scenes: guideScenes };
  window._ca.step = 5;
  navContentScript();
}

function caImproveScript(feedback) {
  var activeVariant = window._ca.activeVariant;
  var scripts = window._ca.scripts;
  var script = scripts.find(function(s){ return s.variant === activeVariant; }) || scripts[0];
  if (!script) return;

  showToast('🤖 AI đang cải thiện kịch bản...', 'info');
  var feedbackBtn = document.getElementById('caFeedbackBtn');
  if (feedbackBtn) { feedbackBtn.textContent = '⏳ Đang xử lý...'; feedbackBtn.disabled = true; }

  var req = window._ca._lastRequest || {};
  fetch(API_BASE + '/api/content-agent/script/improve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id:     req.product_id    || '',
      product_name:   req.product_name  || '',
      content_type:   req.content_type  || 'tiktok_30s',
      variant:        activeVariant,
      current_script: script,
      feedback:       feedback,
      is_text_post:   window._ca.is_text_post || false,
    })
  }).then(function(r) { return r.json(); }).then(function(data) {
    if (data.script) {
      var idx = window._ca.scripts.findIndex(function(s){ return s.variant === activeVariant; });
      if (idx >= 0) {
        window._ca.scripts[idx] = Object.assign({}, window._ca.scripts[idx], data.script);
      } else {
        window._ca.scripts.push(data.script);
      }
      showToast('✅ Kịch bản đã được cải thiện!', 'success');
    } else {
      showToast('⚠️ AI không trả về kịch bản hợp lệ', 'warning');
    }
    navContentScript();
  }).catch(function() {
    showToast('❌ Không thể kết nối backend — vui lòng thử lại', 'error');
    if (feedbackBtn) { feedbackBtn.textContent = '🔄 Cải thiện với AI'; feedbackBtn.disabled = false; }
    navContentScript();
  });
}

// Task #29/#30/#32: Lưu kịch bản — chỉ lưu phiên bản đang active, cập nhật đề xuất gốc nếu có
function caSaveScript() {
  var btn = document.getElementById('caSaveScriptBtn');
  if (btn) { btn.textContent = '⏳ Đang lưu...'; btn.disabled = true; }

  // Chỉ lưu variant đang xem — không lưu cả 3 để tránh script bị ngắn khi xem lại
  var activeVariant = window._ca.activeVariant || 'emotional';
  var activeScript = (window._ca.scripts || []).find(function(s) { return s.variant === activeVariant; })
                  || (window._ca.scripts || [])[0];
  var scriptToSave = JSON.stringify(activeScript ? [activeScript] : []);

  var sid = window._ca._sourceSuggestionId;
  if (sid) {
    // Thử cập nhật đề xuất gốc (PATCH) — dùng apiCall() để tự động đính kèm X-API-Key
    apiCall('/api/content-suggestions/' + encodeURIComponent(sid) + '/save-script', 'PATCH',
      { script_json: scriptToSave }
    ).then(function(data) {
      if (data.status === 'ok') {
        showToast('✅ Đã cập nhật kịch bản!', 'success');
        if (btn) { btn.textContent = '✅ Đã lưu — Cập nhật tiếp'; btn.disabled = false; }
      } else {
        showToast('⚠️ Lưu không thành công', 'warning');
        if (btn) { btn.textContent = '💾 Cập nhật kịch bản đã lưu'; btn.disabled = false; }
      }
    }).catch(function(err) {
      // 404 = đề xuất chưa có trong DB → tạo mới
      if (err && err.message && err.message.includes('404')) {
        return _caCreateNewSuggestionWithScript(btn);
      }
      showToast('❌ Không thể kết nối backend', 'error');
      if (btn) { btn.textContent = '💾 Cập nhật kịch bản đã lưu'; btn.disabled = false; }
    });
  } else {
    _caCreateNewSuggestionWithScript(btn);
  }
}

function _caCreateNewSuggestionWithScript(btn) {
  var req = window._ca._lastRequest || {};
  // Chỉ lưu variant đang active
  var activeVariant = window._ca.activeVariant || 'emotional';
  var activeScript = (window._ca.scripts || []).find(function(s) { return s.variant === activeVariant; })
                  || (window._ca.scripts || [])[0];
  // Dùng apiCall() để tự động đính kèm X-API-Key
  return apiCall('/api/content-suggestions', 'POST', {
    product_id:   req.product_id   || '',
    product_name: req.product_name || 'Sản phẩm',
    content_type: req.content_type || 'tiktok_30s',
    scripts:      activeScript ? [activeScript] : [],
    is_text_post: window._ca.is_text_post || false,
  }).then(function(data) {
    if (data.status === 'ok') {
      window._ca._sourceSuggestionId = data.suggestion_id || null;
      showToast('✅ Đã lưu kịch bản vào Đề xuất AI!', 'success');
      if (btn) { btn.textContent = '✅ Đã lưu — Cập nhật tiếp'; btn.disabled = false; }
    } else {
      showToast('⚠️ Không thể lưu kịch bản', 'warning');
      if (btn) { btn.textContent = '💾 Lưu kịch bản'; btn.disabled = false; }
    }
  }).catch(function() {
    showToast('❌ Không thể kết nối backend', 'error');
    if (btn) { btn.textContent = '💾 Lưu kịch bản'; btn.disabled = false; }
  });
}

// Xem kịch bản đã lưu của một đề xuất (thay "Tạo script" bằng "Xem script" khi has_script=true)
function caViewSavedScript(sid) {
  if (!sid) { showToast('Không tìm được đề xuất', 'warning'); return; }
  showToast('🔄 Đang tải kịch bản...', 'info');
  fetch(API_BASE + '/api/content-suggestions/' + encodeURIComponent(sid) + '/script')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.status === 'ok' && Array.isArray(data.scripts) && data.scripts.length > 0) {
        window._ca.scripts = data.scripts;
        // Detect is_text_post from actual script content — not from backend flag (may be stale for old suggestions)
        var firstScript = data.scripts[0] || {};
        window._ca.is_text_post = (
          typeof firstScript.body !== 'undefined'
          && !Array.isArray(firstScript.timeline)
          && !firstScript.scenes
        );
        window._ca.step          = 4;
        window._ca.activeVariant = firstScript.variant || 'emotional';
        window._ca._sourceSuggestionId = sid;
        // Gợi lại lastRequest để caImproveScript có context
        window._ca._lastRequest = window._ca._lastRequest || {
          product_id:   data.product_id   || '',
          product_name: data.product_name || '',
          content_type: data.content_type || 'tiktok_30s',
        };
        window._csTab = 'script';
        navigate('content-suggestions');
      } else {
        showToast('⚠️ Kịch bản chưa được lưu hoặc không hợp lệ', 'warning');
      }
    }).catch(function() {
      showToast('❌ Không thể tải kịch bản từ backend', 'error');
    });
}

const ROUTES = {
  dashboard: { title: 'Dashboard', subtitle: 'Tổng quan chiến lược AI – Cập nhật lúc 07:31', render: renderDashboard },
  'ai-suggestions': { title: 'Đề xuất AI', subtitle: 'Human-in-the-loop · Phê duyệt chiến lược do AI đề xuất', render: renderAISuggestions },
  revenue: { title: 'Doanh thu & Chi phí', subtitle: 'Phân tích tài chính thời gian thực – Cập nhật lúc 07:32', render: renderRevenue },
  inventory: { title: 'Quản lý Tồn kho', subtitle: 'Cảnh báo và tối ưu vòng quay vốn – Cập nhật lúc 07:33', render: renderInventory },
  competitor: { title: 'Phân tích Đối thủ', subtitle: 'So sánh giá & Market share – Cập nhật lúc 07:33', render: renderCompetitor },
  reviews: { title: 'Review Sản phẩm', subtitle: 'Sentiment Analysis từ khách hàng – Cập nhật lúc 07:33', render: renderReviews },
  media: { title: 'Media & Quảng cáo', subtitle: 'Hiệu suất Ads và Content (Shopee & TikTok) – Cập nhật lúc 07:33', render: renderMedia },
  'crisis-center': { title: 'Trung tâm Khủng hoảng', subtitle: 'Orchestrator Agent · Phát hiện & Xử lý tự động', render: renderCrisisCenter },
  chat: { title: 'Chat AI Inbox', subtitle: 'Hệ thống tự động phân loại và phản hồi – Cập nhật lúc 07:33', render: renderChat },
  settings: { title: 'Cài đặt & Hồ sơ', subtitle: 'Cấu hình doanh nghiệp và AI Agent', render: renderSettings },
  'ai-performance': { title: 'Hiệu suất AI Agent', subtitle: 'Đánh giá kết quả vận hành của các Agent', render: renderAIPerformance },
  'market-overview': { title: 'Tổng quan ngành hàng', subtitle: 'Xu hướng & thị phần thị trường — Cập nhật hàng ngày', render: renderMarketOverview },
  'chat-sentiment': { title: 'Sentiment Analysis', subtitle: 'Phân tích cảm xúc khách hàng từ toàn bộ hội thoại', render: renderChatSentiment },
  'chat-report': { title: 'Báo cáo thắc mắc', subtitle: 'Vấn đề & câu hỏi phổ biến nhất từ khách hàng', render: renderChatReport },
  'chat-insights': { title: 'Tổng hợp từ Chatbot', subtitle: 'Pattern detection — AI phân tích toàn bộ hội thoại', render: renderChatInsights },
  'content-suggestions': { title: 'Content & Script AI', subtitle: 'Đề xuất nội dung + Tạo kịch bản video tự động', render: renderContentSuggestions },
  'product-descriptions': { title: 'Mô tả Sản phẩm', subtitle: 'Tối ưu mô tả sản phẩm với AI', render: renderProductDescriptions },
  'demo-customer': { title: 'Demo Khách Hàng', subtitle: 'Thử nghiệm trải nghiệm khách hàng — Gửi Review & Live Chat AI', render: renderDemoCustomer }
};

let currentPage = 'dashboard';
function navigate(page) {
  // content-agent đã được gộp vào content-suggestions (tab Script)
  if (page === 'content-agent') { window._csTab = 'script'; page = 'content-suggestions'; }
  if (!ROUTES[page]) page = 'dashboard';
  // Reset về tab Đề xuất khi rời khỏi trang content-suggestions
  if (currentPage === 'content-suggestions' && page !== 'content-suggestions') {
    window._csTab = 'suggestions';
  }
  currentPage = page;
  const r = ROUTES[page];
  document.getElementById('pageTitle').textContent = r.title;
  document.getElementById('pageSubtitle').textContent = r.subtitle;
  document.getElementById('pageContent').innerHTML = r.render();
  syncSidebarActive(page);
  document.querySelector('.main-content').scrollTo({ top: 0, behavior: 'smooth' });
}

function syncSidebarActive(page) {
  // Clear active on all nav items (top-level + children)
  document.querySelectorAll('.nav-item[data-page], .nav-child-item[data-page]').forEach(function(el) {
    el.classList.remove('active');
  });
  // Clear group highlights
  document.querySelectorAll('.nav-group').forEach(function(g) {
    g.classList.remove('has-active');
  });
  // Set active on matching element
  var match = document.querySelector('.nav-item[data-page="' + page + '"], .nav-child-item[data-page="' + page + '"]');
  if (!match) return;
  match.classList.add('active');
  // Propagate to parent group if child item
  var group = match.closest('.nav-group');
  if (group) {
    group.classList.add('has-active');
    if (!group.classList.contains('open')) group.classList.add('open');
  }
}

/* =====================================================================
   6. EVENT DELEGATION
   ===================================================================== */
function initEvents() {
  // Sidebar — top-level items
  document.querySelectorAll('.nav-item[data-page]').forEach(function(btn) {
    btn.addEventListener('click', function() { if (btn.dataset.page) navigate(btn.dataset.page); });
  });
  // Sidebar — child items inside accordion groups
  document.querySelectorAll('.nav-child-item[data-page]').forEach(function(btn) {
    btn.addEventListener('click', function() { if (btn.dataset.page) navigate(btn.dataset.page); });
  });
  // Group header toggle
  document.querySelectorAll('.nav-group-header').forEach(function(header) {
    header.addEventListener('click', function() { header.closest('.nav-group').classList.toggle('open'); });
  });

  // Scan button
  document.getElementById('btnScan').addEventListener('click', runScan);

  // Notification button
  document.getElementById('btnNotification').addEventListener('click', () => {
    showToast('Bạn có 5 thông báo mới: 3 đề xuất AI chờ duyệt, 2 cảnh báo tồn kho', 'info');
  });

  // Guidance toolbar tags
  document.querySelectorAll('.guidance-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      const cmd = tag.dataset.cmd;
      document.getElementById('guidanceInput').value = cmd;
      activateGuidance(cmd);
    });
  });

  document.getElementById('guidanceSendBtn').addEventListener('click', () => {
    const v = document.getElementById('guidanceInput').value.trim();
    if (v) activateGuidance(v);
  });

  document.getElementById('guidanceClearBtn').addEventListener('click', () => {
    document.getElementById('guidanceActiveCmd').style.display = 'none';
    document.getElementById('guidanceInput').value = '';
    showToast('Đã hủy chỉ thị chiến lược', 'info');
  });

  // Modal events
  document.getElementById('modalCloseBtn').addEventListener('click', closeFeedbackModal);
  document.getElementById('modalCancelBtn').addEventListener('click', closeFeedbackModal);
  document.getElementById('feedbackText').addEventListener('input', (e) => {
    document.getElementById('modalSubmitBtn').disabled = e.target.value.trim().length < 5;
  });
  document.getElementById('modalSubmitBtn').addEventListener('click', () => {
    const reason = document.getElementById('feedbackText').value;
    const sug = MOCK.suggestions.find(s => s.id === pendingFeedbackId);
    if (sug) {
      sug.status = 'rejected';
      sug.rejection_reason = reason;
    }
    closeFeedbackModal();
    showToast(`AI đang điều chỉnh lại đề xuất dựa trên feedback của bạn... 🔄`, 'warning');
    setTimeout(() => {
      navigate(currentPage);
    }, 1000);
  });

  // Page-level delegation
  document.getElementById('pageContent').addEventListener('click', handlePageClick);
}

// ── Admin API Key helpers (gọi từ Settings tab) ───────────────────────────────

function _saveApiKeyFromInput() {
  const inp = document.getElementById('adminApiKeyInput');
  const val = (inp ? inp.value : '').trim();
  if (!val) {
    showToast('Vui lòng nhập API key trước khi lưu.', 'warning');
    return;
  }
  if (typeof saveAdminApiKey === 'function') saveAdminApiKey(val);
  showToast('✅ API key đã được lưu! Tất cả request admin sẽ dùng key này.', 'success');
  // Re-render tab để cập nhật badge trạng thái
  const tabContent = document.getElementById('settingsTabContent');
  if (tabContent && typeof renderSettingsTab === 'function') tabContent.innerHTML = renderSettingsTab();
}

function _clearApiKey() {
  if (typeof clearAdminApiKey === 'function') clearAdminApiKey();
  showToast('🗑 Đã xóa API key.', 'info');
  const tabContent = document.getElementById('settingsTabContent');
  if (tabContent && typeof renderSettingsTab === 'function') tabContent.innerHTML = renderSettingsTab();
}

async function _testApiKey() {
  if (typeof _adminApiKey === 'undefined' || !_adminApiKey) {
    showToast('Chưa có key để kiểm tra.', 'warning');
    return;
  }
  try {
    showToast('⏳ Đang kiểm tra key...', 'info');
    // /api/customers là endpoint protected đơn giản, không có side-effects
    await apiCall('/api/customers');
    showToast('✅ Key hợp lệ — backend xác thực thành công!', 'success');
  } catch (err) {
    if (err.message && err.message.includes('401')) {
      showToast('❌ Key không hợp lệ — backend trả về 401. Kiểm tra lại ADMIN_API_KEY trên Render.', 'error');
    } else {
      showToast('⚠️ Không thể kết nối backend: ' + err.message, 'warning');
    }
  }
}

function activateGuidance(cmd) {
  document.getElementById('guidanceActiveCmd').style.display = 'flex';
  document.getElementById('guidanceActiveCmdText').textContent = cmd;
  showToast(`AI đã nhận chỉ thị: "${cmd.substring(0, 50)}${cmd.length>50?'...':''}"`, 'success');
}

async function handlePageClick(e) {
  // ── Ưu tiên: Các nút dùng class (chat inbox buttons) ──
  const chatBtn = e.target.closest(
    '.btn-chat-accept, .btn-chat-edit, .btn-chat-send-edited, .btn-chat-cancel-edit'
  );
  if (chatBtn) {
    // Gửi ngay
    if (chatBtn.classList.contains('btn-chat-accept')) {
      const msgs = MOCK.chat_messages[currentChatId] || [];
      const draftMsg = msgs.find(m => m.from === 'ai_draft');
      if (draftMsg) {
        const now = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        MOCK.chat_messages[currentChatId] = msgs.filter(m => m.from !== 'ai_draft' && m.from !== 'ai_thinking');
        MOCK.chat_messages[currentChatId].push({ from: 'ai_sent', time: now, text: draftMsg.text });
        const conv = MOCK.conversations.find(c => c.id === currentChatId);
        if (conv) { conv.status = 'auto'; conv.unread = 0; conv.wait_min = 0;
          conv.preview = draftMsg.text.substring(0, 55) + (draftMsg.text.length > 55 ? '...' : '');
          conv.time = now; }
      }
      chatDraftEditMode = false;
      showToast('✅ Tin nhắn đã gửi cho khách. AI ghi nhận để học.', 'success');
      setTimeout(() => navigate('chat'), 200);
      return;
    }
    // Sửa nháp
    if (chatBtn.classList.contains('btn-chat-edit')) {
      chatDraftEditMode = true;
      navigate('chat');
      setTimeout(() => {
        const ta = document.getElementById('chatDraftEditArea');
        if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
      }, 120);
      return;
    }
    // Gửi bản đã sửa
    if (chatBtn.classList.contains('btn-chat-send-edited')) {
      const ta = document.getElementById('chatDraftEditArea');
      const editedText = ta ? ta.value.trim() : '';
      if (!editedText) { showToast('⚠️ Nội dung không được để trống!', 'warning'); return; }
      const msgs = MOCK.chat_messages[currentChatId] || [];
      const now = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      MOCK.chat_messages[currentChatId] = msgs.filter(m => m.from !== 'ai_draft' && m.from !== 'ai_thinking');
      MOCK.chat_messages[currentChatId].push({ from: 'ai_sent', time: now, text: editedText, edited: true });
      const conv = MOCK.conversations.find(c => c.id === currentChatId);
      if (conv) { conv.status = 'auto'; conv.unread = 0; conv.wait_min = 0;
        conv.preview = editedText.substring(0, 55) + (editedText.length > 55 ? '...' : '');
        conv.time = now; }
      chatDraftEditMode = false;
      showToast('✅ Đã gửi bản nháp đã chỉnh sửa cho khách!', 'success');
      setTimeout(() => navigate('chat'), 200);
      return;
    }
    // Hủy chỉnh sửa
    if (chatBtn.classList.contains('btn-chat-cancel-edit')) {
      chatDraftEditMode = false;
      navigate('chat');
      return;
    }
  }

  const target = e.target.closest('[data-action], [data-nav], [data-tab], [data-type], [data-stab], [data-conv]');
  if (!target) return;

  // Navigation links inside content
  if (target.dataset.nav) {
    e.preventDefault();
    navigate(target.dataset.nav);
    return;
  }

  // AI Suggestions tabs
  if (target.dataset.tab) {
    currentSugTab = target.dataset.tab;
    navigate('ai-suggestions');
    return;
  }
  if (target.dataset.type) {
    currentSugType = target.dataset.type;
    navigate('ai-suggestions');
    return;
  }

  // Settings tabs
  if (target.dataset.stab) {
    currentSettingsTab = target.dataset.stab;
    document.querySelectorAll('.settings-tab').forEach(t => t.classList.toggle('active', t.dataset.stab === currentSettingsTab));
    document.getElementById('settingsTabContent').innerHTML = renderSettingsTab();
    return;
  }

  // Chat conversation switch
  if (target.dataset.chatfilter) {
    chatFilter = target.dataset.chatfilter;
    navigate('chat');
    return;
  }
  if (target.dataset.conv) {
    currentChatId = target.dataset.conv;
    navigate('chat');
    return;
  }

  // Suggestion actions
  if (target.dataset.action) {
    const action = target.dataset.action;
    const id = target.dataset.id;
    const sug = MOCK.suggestions.find(s => s.id === id);

    if (action === 'detail' && sug) {
      openSlideover(sug);
    } else if (action === 'approve' && sug) {
      sug.status = 'approved';
      showToast(`Đã duyệt: "${sug.title}" — AI đang triển khai...`, 'success');
      setTimeout(() => navigate(currentPage), 800);
    } else if (action === 'deny' && sug) {
      openFeedbackModal(id);
    } else if (action === 'ai-reply') {
      const author = target.dataset.author;
      const dbId = target.dataset.dbId;
      if (!dbId || !_backendConnected) {
        showToast('Không thể soạn phản hồi: review chưa đồng bộ với server.', 'warning');
        return;
      }
      target.disabled = true;
      target.textContent = '⏳ Đang soạn...';
      try {
        const result = await apiCall(`/api/review-replies/generate/${dbId}`, 'POST');
        if (result && result.auto_reply) {
          // Gắn auto_reply vào MOCK.reviews để card re-render có dữ liệu
          const review = MOCK.reviews.find(r => r.author === author);
          if (review) {
            review.auto_reply = {
              public_reply: result.auto_reply.public_reply,
              inbox_message: result.auto_reply.inbox_message,
              reply_type: result.auto_reply.reply_type,
              status: result.auto_reply.status,
              _db_id: result.auto_reply.id,
              inbox_queued: result.auto_reply.reply_type === 'negative' && !!result.auto_reply.inbox_message,
            };
          }
          showToast(`✅ Đã soạn phản hồi cho ${author}!`, 'success');
          if (typeof _origNavigate === 'function') setTimeout(() => _origNavigate('reviews'), 300);
        }
      } catch (err) {
        showToast('Lỗi khi soạn phản hồi: ' + err.message, 'error');
        target.disabled = false;
        target.innerHTML = `${ICON.brain} AI soạn phản hồi`;
      }
    } else if (action === 'deny-chat') {
      // Xóa nháp AI, thêm thông báo hệ thống, re-render
      const msgs = MOCK.chat_messages[currentChatId] || [];
      MOCK.chat_messages[currentChatId] = msgs.filter(m => m.from !== 'ai_draft' && m.from !== 'ai_thinking');
      MOCK.chat_messages[currentChatId].push({
        from: 'system',
        text: 'Nháp bị từ chối'
      });
      chatDraftEditMode = false;
      showToast('Đã từ chối nháp AI.', 'warning');
      setTimeout(() => navigate('chat'), 300);
    } else if (action === 'chat-send-msg') {
      // Gửi tin nhắn từ chủ shop qua ô input
      const input = document.getElementById('chatMsgInput');
      const text = input ? input.value.trim() : '';
      if (!text) return;
      input.value = '';
      if (!MOCK.chat_messages[currentChatId]) MOCK.chat_messages[currentChatId] = [];
      const now = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      MOCK.chat_messages[currentChatId].push({ from: 'shop_owner', time: now, text });
      const conv = MOCK.conversations.find(c => c.id === currentChatId);
      if (conv) { conv.preview = text.substring(0, 55) + (text.length > 55 ? '...' : ''); conv.time = now; }
      navigate('chat');
      return;
    }
  }

  // Quick-reply template buttons in chat input area
  if (target.dataset.chattemplate) {
    const text = target.dataset.chattemplate;
    if (!MOCK.chat_messages[currentChatId]) MOCK.chat_messages[currentChatId] = [];
    const now = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    MOCK.chat_messages[currentChatId].push({ from: 'shop_owner', time: now, text });
    const conv = MOCK.conversations.find(c => c.id === currentChatId);
    if (conv) { conv.preview = text.substring(0, 55); conv.time = now; }
    navigate('chat');
    return;
  }

  // Restock button
  if (target.id === 'btnRestock') {
    showToast('🤖 AI đã soạn email yêu cầu nhập hàng cho 3 SKU. Mở để xem trước khi gửi.', 'success');
  }

  // Competitor product change
  if (target.id === 'compProductSelect') {
    return; // handled by change event
  }

  // Crisis Center events — toàn bộ xử lý action và tab đã chuyển sang api_integration.js.
  // app4.js chỉ giữ lại việc điều hướng từ banner (btn-crisis-view).

  // Crisis banner click → navigate to crisis center
  if (target.classList.contains('btn-crisis-view')) {
    currentCrisisProductId = target.dataset.crisis || null;  // product_id thực (P011, v.v.)
    navigate('crisis-center');
    return;
  }

  // Crisis tab selector — được xử lý trong api_integration.js (data-crisisproduct)
  // Giữ lại selector cũ (data-crisisid) để không bị lỗi nếu còn sót ở đâu
  if (target.dataset.crisisid && !target.dataset.actid) {
    currentCrisisProductId = target.dataset.crisisid;
    navigate('crisis-center');
    return;
  }

}

/* =====================================================================
   7. INIT
   ===================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  initEvents();
  navigate('dashboard');

  // Listen for change events on selects
  document.body.addEventListener('change', (e) => {
    if (e.target.id === 'compProductSelect') {
      currentCompetitorProduct = e.target.value;
      navigate('competitor');
    }
  });

  // Welcome toast
  setTimeout(() => {
    showToast('Chào mừng đến với Agicom v2.0! AI Agent đang phân tích shop của bạn...', 'success');
  }, 500);
});
