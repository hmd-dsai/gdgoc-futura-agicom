/* =====================================================================
   AGICOM API INTEGRATION v2.0
   Kết nối Frontend Dashboard với FastAPI Backend

   File này được load SAU app4.js và ghi đè các hàm cần thiết
   để tích hợp các tính năng thực tế của backend.

   Backend endpoints được tích hợp:
   - POST /chat-v3                 → Live Chat với AI (RAG + lịch sử hội thoại)
   - GET  /api/reviews             → Lấy reviews từ database
   - POST /learn-from-review       → Gửi review để AI học hỏi
   - GET  /daily-summary           → Tóm tắt AI hàng ngày
   - POST /export-daily-summary    → Xuất & lưu trữ báo cáo ngày
   - POST /slow-track-strategy     → Phân tích chiến lược giá
   - POST /act-and-learn           → Phê duyệt / từ chối đề xuất AI
   - GET  /api/chatbot/features    → Danh sách tính năng chatbot
   - GET  /api/quality/overview    → Tổng quan chất lượng AI
   - DELETE /chat/{id}             → Xóa lịch sử chat
   - POST /system/reset-all        → Reset toàn bộ dữ liệu
   ===================================================================== */

/* ──────────────────────────────────────────────────────────────────────
   1. CONFIGURATION
   ────────────────────────────────────────────────────────────────────── */

// ⚠️ Đổi URL này nếu backend chạy ở port khác hoặc địa chỉ khác
const API_BASE = window.AGICOM_API_BASE || 'http://localhost:8000';

let _backendConnected = false;

// ── Admin API Key ─────────────────────────────────────────────────────────────
// Lưu vào localStorage để tồn tại qua các lần reload.
// Được đọc ở đây một lần; thay đổi runtime qua saveAdminApiKey().
let _adminApiKey = (() => {
  try { return localStorage.getItem('agicom_admin_api_key') || ''; } catch (_) { return ''; }
})();

/** Cập nhật key trong bộ nhớ và lưu vào localStorage. */
function saveAdminApiKey(key) {
  _adminApiKey = (key || '').trim();
  try { localStorage.setItem('agicom_admin_api_key', _adminApiKey); } catch (_) {}
}

/** Xóa key hoàn toàn. */
function clearAdminApiKey() {
  _adminApiKey = '';
  try { localStorage.removeItem('agicom_admin_api_key'); } catch (_) {}
}

/* ──────────────────────────────────────────────────────────────────────
   CHAT SESSION STATS — Theo dõi realtime trong phiên làm việc
   ────────────────────────────────────────────────────────────────────── */
const chatSessionStats = {
  totalUserMsgs: 0,      // Tổng tin nhắn từ khách
  totalAIReplies: 0,     // Tổng phản hồi AI
  totalSafe: 0,          // Số lượng tự động gửi (safe)
  totalEscalated: 0,     // Số lượng chờ duyệt (escalated)
  confidenceScores: [],  // Mảng confidence để tính trung bình
  sentiments: [],        // Mảng sentiment strings
  startTime: null,       // Thời điểm bắt đầu session
  avgResponseMs: [],     // Thời gian phản hồi (ms)

  reset() {
    this.totalUserMsgs = 0;
    this.totalAIReplies = 0;
    this.totalSafe = 0;
    this.totalEscalated = 0;
    this.confidenceScores = [];
    this.sentiments = [];
    this.startTime = null;
    this.avgResponseMs = [];
  },

  avgConfidence() {
    if (!this.confidenceScores.length) return 0;
    return Math.round(this.confidenceScores.reduce((a, b) => a + b, 0) / this.confidenceScores.length * 100);
  },

  sentimentCounts() {
    const counts = { positive: 0, neutral: 0, negative: 0 };
    this.sentiments.forEach(s => {
      const lower = (s || '').toLowerCase();
      if (lower.includes('tích cực') || lower.includes('positive') || lower.includes('hài lòng') || lower.includes('vui')) counts.positive++;
      else if (lower.includes('tiêu cực') || lower.includes('negative') || lower.includes('bức xúc') || lower.includes('tức') || lower.includes('phàn nàn')) counts.negative++;
      else counts.neutral++;
    });
    return counts;
  },

  safeRate() {
    if (!this.totalAIReplies) return 100;
    return Math.round(this.totalSafe / this.totalAIReplies * 100);
  },

  sessionDuration() {
    if (!this.startTime) return '—';
    const diff = Math.floor((Date.now() - this.startTime) / 1000);
    if (diff < 60) return `${diff}s`;
    return `${Math.floor(diff / 60)}m ${diff % 60}s`;
  },

  avgResponse() {
    if (!this.avgResponseMs.length) return '—';
    return Math.round(this.avgResponseMs.reduce((a, b) => a + b, 0) / this.avgResponseMs.length) + 'ms';
  }
};

/* ──────────────────────────────────────────────────────────────────────
   2. API HELPER
   ────────────────────────────────────────────────────────────────────── */

async function apiCall(endpoint, method = 'GET', body = null, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const headers = { 'Content-Type': 'application/json' };
  if (_adminApiKey) headers['X-API-Key'] = _adminApiKey;

  const opts = {
    method,
    headers,
    signal: controller.signal,
  };
  if (body) opts.body = JSON.stringify(body);

  try {
    const res = await fetch(API_BASE + endpoint, opts);
    clearTimeout(timeoutId);
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }
    return res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('Request timed out after ' + timeoutMs + 'ms');
    throw err;
  }
}

/* ──────────────────────────────────────────────────────────────────────
   3. HEALTH CHECK — Kiểm tra kết nối khi trang tải
   ────────────────────────────────────────────────────────────────────── */

async function checkBackendHealth() {
  const indicator = document.getElementById('backendStatusIndicator');
  // Hiện trạng thái đang kết nối
  if (indicator) {
    indicator.textContent = '⏳ Đang kết nối...';
    indicator.style.color = 'var(--text-muted)';
  }
  // Render free tier có thể ngủ — retry tối đa 2 lần, timeout 12s mỗi lần
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(API_BASE + '/health', { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'healthy') {
          _backendConnected = true;
          showToast('🟢 Backend kết nối thành công! Tất cả tính năng AI đang hoạt động.', 'success');
          if (indicator) { indicator.textContent = '🟢 Backend Online'; indicator.style.color = 'var(--accent-emerald)'; }
          return;
        }
      }
    } catch (err) {
      if (attempt < 2) {
        // Render đang wake up — thử lần 2 sau 8s
        if (indicator) { indicator.textContent = '⏳ Đang khởi động backend...'; indicator.style.color = '#f59e0b'; }
        showToast('⏳ Backend đang khởi động (Render cold start) — thử lại sau 8 giây...', 'info');
        await new Promise(r => setTimeout(r, 8000));
        continue;
      }
      console.warn('[Agicom] Backend không khả dụng:', err.message);
    }
  }
  // Hết retry — chuyển về Demo mode
  _backendConnected = false;
  showToast('🟡 Backend chưa kết nối — Đang chạy chế độ Demo (dữ liệu mẫu). Kiểm tra URL trong config.js.', 'warning');
  if (indicator) { indicator.textContent = '🔴 Backend Offline (Demo Mode)'; indicator.style.color = 'var(--accent-rose)'; }
}

/* ──────────────────────────────────────────────────────────────────────
   3b. SHOP PROFILE — Load từ backend + cập nhật sidebar & settings form
   ────────────────────────────────────────────────────────────────────── */

// In-memory cache cho shop profile
let _shopProfile = null;

/**
 * Tải thông tin shop từ /api/shop-profile và cập nhật:
 *  - Sidebar (avatar initials, tên shop, gói dịch vụ)
 *  - MOCK.shop.name (để các nơi dùng MOCK.shop.name hiển thị đúng)
 *  - Form "Cài đặt > Thông tin doanh nghiệp" nếu đang mở
 */
async function _loadShopProfile() {
  try {
    const profile = _backendConnected
      ? await apiCall('/api/shop-profile')
      : null;

    // Fallback về giá trị từ MOCK.shop nếu backend offline
    _shopProfile = profile || {
      shop_name:  (typeof MOCK !== 'undefined' && MOCK.shop) ? MOCK.shop.name : 'GIAO FARA Official Store',
      initials:   'GF',
      platform:   'Shopee',
      plan:       'Growth',
      role_label: 'Gói Growth · Shopee',
      owner_name: 'Nguyễn Thị Hương',
      email:      'owner@giaofara.vn',
      status:     'connected',
    };

    _updateSidebarProfile(_shopProfile);

    // Đồng bộ vào MOCK.shop.name để các render function dùng được
    if (typeof MOCK !== 'undefined' && MOCK.shop) {
      MOCK.shop.name = _shopProfile.shop_name;
    }
  } catch (err) {
    console.warn('[Agicom] _loadShopProfile failed:', err.message);
  }
}

/**
 * Cập nhật DOM sidebar với profile data.
 */
function _updateSidebarProfile(profile) {
  const avatarEl   = document.getElementById('sidebarUserAvatar');
  const nameEl     = document.getElementById('sidebarShopName');
  const roleEl     = document.getElementById('sidebarShopRole');
  if (avatarEl) avatarEl.textContent = profile.initials || 'GF';
  if (nameEl)   nameEl.textContent   = profile.shop_name || 'GIAO FARA';
  if (roleEl)   roleEl.textContent   = profile.role_label || 'Gói Growth · Shopee';
}

/**
 * Điền dữ liệu vào form Cài đặt > Thông tin doanh nghiệp khi tab mở.
 * Gọi sau khi renderSettings() đã gắn HTML vào DOM.
 */
function _populateSettingsForm() {
  if (!_shopProfile) return;
  // Điền tên shop vào input field
  document.querySelectorAll('.settings-field').forEach(field => {
    const label = field.querySelector('.settings-label');
    const input = field.querySelector('input.settings-input, textarea.settings-input');
    if (!label || !input) return;
    const ltext = label.textContent.trim();
    if (ltext === 'Tên shop') input.value = _shopProfile.shop_name || input.value;
    if (ltext === 'Khách hàng mục tiêu'  && _shopProfile.target_customers)  input.value = _shopProfile.target_customers;
    if (ltext === 'Định hướng chiến lược' && _shopProfile.strategic_vision)  input.value = _shopProfile.strategic_vision;
  });
  // Đồng bộ logo avatar trong settings form
  const avatarEl = document.getElementById('settingsLogoAvatar');
  if (avatarEl) avatarEl.textContent = _shopProfile.initials || 'GF';
}

/* ──────────────────────────────────────────────────────────────────────
   4. SCAN THỊ TRƯỜNG — Gọi /slow-track-strategy
   ────────────────────────────────────────────────────────────────────── */

// Lưu bản gốc
const _origRunScan = typeof runScan === 'function' ? runScan : null;

runScan = async function () {
  const overlay = document.getElementById('scanOverlay');
  const btn = document.getElementById('btnScan');
  if (overlay) overlay.classList.add('show');
  if (btn) btn.classList.add('scanning');

  try {
    // Đọc chỉ thị từ guidance toolbar nếu có
    const directive =
      document.getElementById('guidanceActiveCmdText')?.textContent?.trim() ||
      'Không có chỉ thị đặc biệt';

    // Sản phẩm scan mặc định: P009 — Bộ Cọ 13 Món (bestseller, 3500 sold/tháng)
    // product_id phải khớp với data/catalog/product_catalog.json
    const result = await apiCall('/slow-track-strategy', 'POST', {
      product_id: 'P009',
      product_name: 'Bộ Cọ Trang Điểm 13 Món Lông Mềm',
      internal_data: {
        current_price: 87000,
        stock_level: 850,
        cost_price: 40000,
        min_margin_percent: 15,
        conversion_rate: 0.22,
      },
      market_data: {
        competitor_min_price: 79000,
        market_trend: 'Dụng cụ trang điểm handmade và brush set đang trending trên TikTok',
        competitor_name: 'Shopee Mall / BeautyZone',
        competitor_rating: 4.7,
        our_rating: 4.9,
        platform_campaign: 'Shopee Siêu Sale tháng 5',
      },
      customer_context: {
        recent_sentiment: 'hài lòng, hỏi về chất lượng lông cọ',
        frequent_question: 'Cọ có rụng lông không? Vệ sinh cọ bằng gì?',
      },
      shop_profile: {
        target_customers:
          'Nữ 16-30 tuổi mới học trang điểm, sinh viên và nhân viên văn phòng, thu nhập 5-15 triệu/tháng',
        strategic_vision: 'Tối ưu lợi nhuận dài hạn, định vị sản phẩm chất lượng giá tốt',
        brand_tone: 'Thân thiện, gần gũi, tư vấn chân thật',
      },
      manager_directive: directive,
    }, 90000); // LLM call — Gemini Flash có thể mất 15-20s trên Render

    if (overlay) overlay.classList.remove('show');
    if (btn) btn.classList.remove('scanning');

    if (result && result.data) {
      const d = result.data;
      const newSug = {
        id: result.proposal_id || 'sug-live-' + Date.now(),
        type: 'price',
        status: 'pending',
        time: 'Vừa xong',
        title: d.action_required
          ? `[AI LIVE] Đề xuất giá mới: ${d.proposed_price?.toLocaleString('vi-VN')}đ`
          : '[AI LIVE] Giữ nguyên giá — thị trường ổn định',
        reason:
          d.pricing_reasoning ||
          (d.content_update_suggestion
            ? `Gợi ý nội dung: ${d.content_update_suggestion}`
            : 'AI đã phân tích toàn diện và đưa ra khuyến nghị.'),
        metrics: [
          { label: 'Margin dự kiến', value: (d.expected_margin_percent || 0) + '%' },
          { label: 'Trạng thái', value: d.action_required ? '⚠ Cần thay đổi' : '✅ Ổn định' },
          { label: 'Mức độ khẩn', value: d.urgency_level || 'Trung bình' },
        ],
        confidence: 92,
      };

      // Thêm vào đầu danh sách suggestions
      MOCK.suggestions.unshift(newSug);

      showToast(
        '✅ Quét hoàn tất! Gemini AI đã phân tích và tạo đề xuất mới (LIVE) → xem trang Đề xuất AI',
        'success'
      );

      // Nếu đang ở trang ai-suggestions thì cập nhật luôn
      if (typeof currentPage !== 'undefined' && currentPage === 'ai-suggestions') {
        setTimeout(() => navigate('ai-suggestions'), 600);
      }
    } else {
      showToast('Quét hoàn tất! AI không cần thay đổi gì lúc này.', 'info');
    }
  } catch (err) {
    if (overlay) overlay.classList.remove('show');
    if (btn) btn.classList.remove('scanning');

    // Fallback: Demo mode
    console.warn('[Agicom] Scan API lỗi, chạy demo:', err.message);
    setTimeout(() => {
      showToast('Quét hoàn tất (Demo Mode — Backend chưa kết nối)', 'warning');
    }, 200);
  }
};

/* ──────────────────────────────────────────────────────────────────────
   5. REVIEWS — /api/reviews + /learn-from-review
   ────────────────────────────────────────────────────────────────────── */

async function loadReviewsFromAPI() {
  try {
    const data = await apiCall('/api/reviews?limit=20');
    if (data && data.data && data.data.length > 0) {
      const dbReviews = data.data.map((r) => ({
        db_id: r.id,
        author: r.customer_name || 'Ẩn danh',
        date: new Date(r.timestamp).toLocaleDateString('vi-VN'),
        rating: r.rating,
        text: r.review_text,
        product_id: r.product_id,
        product_name: r.product_name || r.product_id || '',
        tag:
          r.sentiment === 'Tích cực' || r.rating >= 4
            ? { type: 'pos', label: r.sentiment_tag || r.ai_insight || 'Phản hồi tích cực' }
            : { type: 'neg', label: r.sentiment_tag || r.ai_insight || 'Cần cải thiện' },
        fromDB: true,
      }));

      // Gộp: DB reviews đứng đầu, sau đó mock reviews
      MOCK.reviews = [...dbReviews, ...MOCK.reviews.filter((r) => !r.fromDB)];

      // Load auto-replies và gắn vào từng review
      await loadReviewRepliesFromAPI();

      // Cập nhật sentiment stats thực từ DB (không await để không chặn render)
      loadReviewSentimentStats();

      showToast(`📥 Đã tải ${data.total_fetched} review từ database`, 'info');

      // Re-render nếu đang ở trang reviews (dùng _origNavigate để tránh vòng lặp)
      if (typeof currentPage !== 'undefined' && currentPage === 'reviews') {
        _origNavigate('reviews');
        setTimeout(injectReviewForm, 80);
      }
    } else {
      showToast('Chưa có review nào trong database (dùng form bên dưới để thêm)', 'info');
    }
  } catch (err) {
    showToast('Không thể tải reviews từ backend: ' + err.message, 'warning');
    console.warn('[Agicom] Reviews API lỗi:', err.message);
  }
}

/**
 * Tải danh sách auto-replies từ /api/review-replies và gắn vào MOCK.reviews.
 * Đồng thời sync các inbox message tiêu cực vào MOCK.conversations nếu chưa có.
 */
async function loadReviewRepliesFromAPI() {
  try {
    const data = await apiCall('/api/review-replies?status=all&limit=50');
    if (!data || !data.data || !data.data.length) return;

    data.data.forEach(reply => {
      // Tìm review theo db_id trước, fallback sang customer_name
      const review = MOCK.reviews.find(r => r.db_id === reply.review_log_id)
        || MOCK.reviews.find(r => r.author === reply.customer_name);
      if (review && !review.auto_reply) {
        review.auto_reply = {
          public_reply: reply.public_reply,
          inbox_message: reply.inbox_message,
          reply_type: reply.reply_type,
          status: reply.status,
          inbox_queued: reply.reply_type === 'negative' && !!reply.inbox_message,
          _db_id: reply.id,
        };
      }

      // Sync inbox message vào hộp thư nếu review tiêu cực và chưa có conversation
      if (reply.reply_type === 'negative' && reply.inbox_message) {
        const existingConv = MOCK.conversations.find(c => c.id === reply.customer_name || c.name === reply.customer_name);
        if (!existingConv) {
          _syncReviewInboxToConversations(
            { customer_name: reply.customer_name, product_id: reply.product_id, rating: reply.rating, review_text: '' },
            { inbox_message: reply.inbox_message, inbox_queued: true }
          );
        }
      }
    });
  } catch (err) {
    console.warn('[Agicom] Không thể tải review-replies:', err.message);
  }
}

/**
 * Tải thống kê sentiment thực từ /api/reviews/sentiment-stats
 * và cập nhật MOCK.reviews_kpi + MOCK.review_tags_pos/neg.
 * Nếu backend offline hoặc chưa có data → giữ nguyên mock values.
 */
async function loadReviewSentimentStats(productId = null) {
  try {
    const url = productId
      ? `/api/reviews/sentiment-stats?product_id=${encodeURIComponent(productId)}`
      : '/api/reviews/sentiment-stats';
    const data = await apiCall(url);
    if (!data || data.total === 0) return; // Chưa có data thực → giữ mock

    // Cập nhật phần trăm sentiment
    MOCK.reviews_kpi.positive = data.positive_pct;
    MOCK.reviews_kpi.neutral  = data.neutral_pct;
    MOCK.reviews_kpi.negative = data.negative_pct;

    // Cập nhật rating + count nếu backend trả về
    if (data.avg_rating !== undefined) MOCK.reviews_kpi.rating = data.avg_rating;
    if (data.review_count !== undefined) MOCK.reviews_kpi.count = data.review_count;

    // Cập nhật tags từ DB
    if (data.tags_positive && data.tags_positive.length > 0) {
      MOCK.review_tags_pos = data.tags_positive.map(t => t.tag);
    }
    if (data.tags_negative && data.tags_negative.length > 0) {
      MOCK.review_tags_neg = data.tags_negative.map(t => t.tag);
    }

    // Re-render panel nếu đang ở trang reviews
    if (typeof currentPage !== 'undefined' && currentPage === 'reviews') {
      // Patch KPI rating card
      const ratingEl = document.querySelector('.content-card [style*="3.5rem"]');
      if (ratingEl) ratingEl.textContent = MOCK.reviews_kpi.rating;
      const countEl = document.querySelector('.content-card [style*="Đánh giá"]');
      if (countEl) countEl.textContent = `${MOCK.reviews_kpi.count.toLocaleString()} Đánh giá`;

      const sentimentPanel = document.querySelector('.rating-bars');
      if (sentimentPanel) {
        // Cập nhật các bar fill mà không cần re-render toàn trang
        const bars = sentimentPanel.querySelectorAll('.rating-bar-fill');
        const counts = sentimentPanel.querySelectorAll('.rating-bar-count');
        const vals = [data.positive_pct, data.neutral_pct, data.negative_pct];
        bars.forEach((bar, i) => { bar.style.width = vals[i] + '%'; });
        counts.forEach((el, i) => { el.textContent = vals[i] + '%'; });

        // Cập nhật tags container (nằm liền sau .rating-bars)
        const tagsContainer = sentimentPanel.parentElement.querySelector('[data-sentiment-tags]');
        if (tagsContainer) {
          tagsContainer.innerHTML =
            MOCK.review_tags_pos.map(t => `<span class="tag-item" style="background:var(--accent-emerald-bg);color:var(--accent-emerald);">✅ ${t}</span>`).join('') +
            MOCK.review_tags_neg.map(t => `<span class="tag-item" style="background:var(--accent-rose-bg);color:var(--accent-rose);">❌ ${t}</span>`).join('');
        }
      }
    }
  } catch (err) {
    console.warn('[Agicom] sentiment-stats không khả dụng:', err.message);
  }
}

async function submitReviewToAPI(formData) {
  // Sync ngay vào MOCK để Crisis panel luôn có dữ liệu (kể cả khi backend offline)
  _syncReviewToMock(formData);

  try {
    const result = await apiCall('/learn-from-review', 'POST', formData, 90000); // LLM call
    const rating = parseInt(formData.rating) || 3;
    const autoReply = result?.auto_reply;

    if (autoReply?.public_reply) {
      // Cập nhật review vừa thêm trong MOCK với dữ liệu auto_reply từ backend
      const mockReview = MOCK.reviews.find(r => r._isDemo && r.product_id === formData.product_id);
      if (mockReview) {
        mockReview.auto_reply = autoReply;
      }

      if (rating >= 4) {
        showToast('✅ Review tích cực! AI đã soạn lời cảm ơn tự động.', 'success');
      } else {
        showToast('✅ Review đã ghi nhận! AI đã soạn phản hồi xin lỗi công khai + tin nhắn inbox.', 'success');
        // Sync tin nhắn inbox vào hộp thư chatbot để chờ duyệt
        if (autoReply.inbox_queued && autoReply.inbox_message) {
          _syncReviewInboxToConversations(formData, autoReply);
        }
      }
    } else {
      showToast('✅ Review đã gửi! AI đang phân tích và học hỏi từ dữ liệu này.', 'success');
    }

    setTimeout(loadReviewsFromAPI, 1500);
    // Refresh sentiment stats sau khi review mới được xử lý
    setTimeout(loadReviewSentimentStats, 2000);
    // Nếu review tiêu cực → nhắc chuyển sang Crisis Center
    if (rating <= 3) {
      setTimeout(() => _alertCrisisFromReview(formData), 1800);
    }
    // Re-render trang reviews nếu đang ở đó
    if (typeof currentPage !== 'undefined' && currentPage === 'reviews') {
      setTimeout(() => _origNavigate('reviews'), 500);
    }
    return result;
  } catch (err) {
    // Kể cả backend offline, MOCK đã được cập nhật — vẫn thông báo thành công cho demo
    const rating = parseInt(formData.rating) || 3;
    if (rating <= 3) {
      // Demo mode: sync tin nhắn inbox giả lập vào hộp thư
      const demoReply = {
        public_reply: `[Demo] GIAO FARA xin lỗi bạn ${formData.customer_name} vì trải nghiệm chưa tốt. Vui lòng inbox shop để được hỗ trợ ngay!`,
        inbox_message: `[Demo] Chào bạn ${formData.customer_name}, shop xin lỗi về vấn đề bạn gặp phải. Shop muốn hỗ trợ bù đắp cho bạn — bạn có thể chia sẻ thêm chi tiết để shop xử lý ngay không ạ?`,
        reply_type: 'negative',
        inbox_queued: true,
        status: 'pending',
      };
      const mockReview = MOCK.reviews.find(r => r._isDemo && r.product_id === formData.product_id);
      if (mockReview) mockReview.auto_reply = demoReply;
      _syncReviewInboxToConversations(formData, demoReply);
      showToast('🔴 Review tiêu cực đã ghi nhận (Demo) — Tin nhắn inbox đã đưa vào Hộp Thư chờ duyệt!', 'danger');
      setTimeout(() => _alertCrisisFromReview(formData), 600);
    } else {
      showToast('✅ Review đã lưu (Demo Mode — Backend offline)', 'info');
    }
  }
}

/**
 * Đưa tin nhắn inbox do AI soạn từ review tiêu cực vào MOCK.conversations
 * với status 'pending' để xuất hiện trong mục "Tin nhắn cần duyệt" của Chatbot.
 * Kèm lịch sử mua hàng nếu có trong CustomerProfile.
 */
function _syncReviewInboxToConversations(formData, autoReply) {
  if (typeof MOCK === 'undefined') return;
  const customerId = formData.customer_name || 'Khách Review';
  const now = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const rating = parseInt(formData.rating) || 1;

  // Tìm conversation hiện có hoặc tạo mới
  let conv = MOCK.conversations.find(c => c.id === customerId || c.name === customerId);
  if (!conv) {
    conv = {
      id: customerId,
      name: customerId,
      avatar: customerId.charAt(0).toUpperCase(),
      time: now,
      status: 'pending',
      unread: 1,
      preview: `[Review ${rating}★] ${(formData.review_text || '').substring(0, 50)}...`,
      category: 'Review',
      sentiment: 20,   // tiêu cực
      wait_min: 1,
      priority: 1,
      ltv: 0, orders: 0,
      platform: 'Review',
      angry: rating <= 2,
      vip: false,
      returning: false,
      customer: {
        note: `Review ${rating}★ — ${formData.product_id || 'Sản phẩm'} · Cần phản hồi inbox`,
        risk: rating <= 2 ? 'high' : 'medium',
        churn: rating <= 2 ? '70%' : '40%',
        purchases: [],
      }
    };
    MOCK.conversations.unshift(conv);
  } else {
    // Cập nhật conversation đã có
    conv.status = 'pending';
    conv.unread = (conv.unread || 0) + 1;
    conv.preview = `[Review ${rating}★] ${(formData.review_text || '').substring(0, 50)}...`;
    conv.time = now;
    MOCK.conversations = [conv, ...MOCK.conversations.filter(c => c !== conv)];
  }

  // Thêm tin nhắn vào lịch sử hội thoại
  if (!MOCK.chat_messages[customerId]) MOCK.chat_messages[customerId] = [];
  // Tin nhắn khách (nội dung review)
  MOCK.chat_messages[customerId].push({
    from: 'customer',
    time: now,
    text: `[Review ${rating}★ — ${formData.product_id}] ${formData.review_text || ''}`,
  });
  // Nháp AI — cần duyệt trước khi gửi
  MOCK.chat_messages[customerId] = MOCK.chat_messages[customerId].filter(
    m => m.from !== 'ai_thinking' && m.from !== 'ai_draft'
  );
  MOCK.chat_messages[customerId].push(
    {
      from: 'ai_thinking',
      text: 'AI phân tích review và soạn tin nhắn xin lỗi + đề xuất giải pháp...',
      context: [
        `Rating: ${rating}★`,
        `Sản phẩm: ${formData.product_id}`,
        'Loại: Phản hồi review tiêu cực',
        'is_safe: ⏳ Chờ duyệt trước khi inbox',
      ],
    },
    { from: 'ai_draft', text: autoReply.inbox_message, confidence: 88 }
  );

  // Cập nhật badge số tin nhắn cần duyệt trong sidebar
  const pendingCount = MOCK.conversations.filter(c => c.status === 'escalate' || c.status === 'pending').length;
  const chatBadge = document.querySelector('.nav-child-item[data-page="chat"] .nav-item-badge');
  if (chatBadge) chatBadge.textContent = pendingCount;

  showToast(`📬 Tin nhắn inbox cho ${customerId} đã vào Hộp Thư · Chờ duyệt`, 'info');

  // Nếu đang ở trang chat → re-render để inbox hiển thị ngay
  if (typeof currentPage !== 'undefined' && currentPage === 'chat' && typeof navigate === 'function') {
    setTimeout(() => navigate('chat'), 300);
  }
}

/** Thêm review vào MOCK.reviews ngay lập tức (không cần backend). */
function _syncReviewToMock(formData) {
  if (typeof MOCK === 'undefined') return;
  const rating = parseInt(formData.rating) || 3;
  const tagLabel = rating <= 1 ? 'Chất lượng SP'
                 : rating <= 2 ? 'Phản hồi tiêu cực'
                 : rating <= 3 ? 'Cần cải thiện'
                 : 'Phản hồi tích cực';
  const review = {
    author: formData.customer_name || 'Khách Demo',
    date: 'Vừa xong',
    rating,
    text: formData.review_text || '',
    product_id: formData.product_id || 'General',
    tag: { type: rating <= 3 ? 'neg' : 'pos', label: tagLabel },
    _isDemo: true
  };
  // Thay thế review demo cũ cùng sản phẩm để không trùng lặp
  MOCK.reviews = MOCK.reviews.filter(r => !(r._isDemo && r.product_id === review.product_id));
  MOCK.reviews.unshift(review);
}

/** Hiển thị toast + banner sau khi có review tiêu cực. */
function _alertCrisisFromReview(formData) {
  const pid = formData.product_id || 'sản phẩm';
  // Toast với nút bấm điều hướng
  const toastId = 'toast_crisis_' + Date.now();
  const toastEl = document.createElement('div');
  toastEl.id = toastId;
  toastEl.style.cssText = `
    position:fixed;bottom:80px;right:20px;z-index:9999;
    background:#1e1b4b;border:2px solid #ef4444;border-radius:12px;
    padding:12px 16px;max-width:340px;box-shadow:0 8px 32px rgba(0,0,0,0.4);
    animation:slideInRight 0.3s ease;`;
  toastEl.innerHTML = `
    <div style="font-size:0.8rem;font-weight:700;color:#ef4444;margin-bottom:6px;">
      🔴 Review tiêu cực đã được ghi nhận!
    </div>
    <div style="font-size:0.75rem;color:#c7d2fe;margin-bottom:10px;line-height:1.5;">
      Sản phẩm <strong>${pid}</strong> nhận đánh giá ⭐${formData.rating}/5 — AI đã phân tích và cập nhật vào hệ thống cảnh báo.
    </div>
    <div style="display:flex;gap:8px;">
      <button onclick="navigate('crisis-center');document.getElementById('${toastId}')?.remove();"
        style="flex:1;font-size:0.75rem;padding:6px;border-radius:8px;background:#ef4444;
          color:white;border:none;cursor:pointer;font-weight:700;">
        🛡 Xem Quản trị Khủng hoảng
      </button>
      <button onclick="document.getElementById('${toastId}')?.remove();"
        style="font-size:0.75rem;padding:6px 10px;border-radius:8px;border:1px solid #6366f1;
          background:transparent;color:#a5b4fc;cursor:pointer;">
        ✕
      </button>
    </div>`;
  document.body.appendChild(toastEl);
  setTimeout(() => toastEl?.remove(), 12000);
}

/* ──────────────────────────────────────────────────────────────────────
   6. LIVE CHAT — /chat-v3
   ────────────────────────────────────────────────────────────────────── */

// Giữ nguyên ID khách hàng demo qua các lần Cmd+R (localStorage)
let liveChatCustomerId = (function () {
  try {
    const saved = localStorage.getItem('agicom_live_chat_id');
    if (saved) return saved;
    const newId = 'demo_customer_' + Math.random().toString(36).substring(2, 8);
    localStorage.setItem('agicom_live_chat_id', newId);
    return newId;
  } catch (_) {
    return 'demo_customer_' + Math.random().toString(36).substring(2, 8);
  }
})();

function buildLiveChatWidgetHTML() {
  return `
    <div class="content-card" style="margin-top:20px;border:2px solid var(--accent-emerald);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
        <div>
          <div class="content-card-title" style="margin:0;color:var(--accent-emerald);">
            🤖 Live Chat với AI Agent (Kết nối Backend)
          </div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">
            RAG + lịch sử hội thoại · ChromaDB · Gemini Flash
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">

          <!-- ── Khu vực ID khách hàng (có thể chỉnh sửa) ── -->
          <div id="liveChatIdArea" style="display:flex;align-items:center;gap:6px;">

            <!-- Trạng thái hiển thị (badge + nút sửa) -->
            <div id="liveChatIdDisplay" style="display:flex;align-items:center;gap:4px;">
              <span id="liveChatIdBadge"
                title="Click ✏️ để đổi ID khách hàng"
                style="font-size:0.7rem;background:var(--accent-emerald-bg);color:var(--accent-emerald);
                  padding:3px 10px;border-radius:6px;font-weight:600;white-space:nowrap;">
                🪪 ${liveChatCustomerId}
              </span>
              <button id="btnEditLiveChatId"
                title="Chỉnh sửa ID khách hàng"
                style="background:none;border:none;cursor:pointer;font-size:0.85rem;
                  color:var(--text-muted);padding:2px 4px;border-radius:4px;line-height:1;
                  transition:color 0.15s;"
                onmouseover="this.style.color='var(--accent-emerald)'"
                onmouseout="this.style.color='var(--text-muted)'">
                ✏️
              </button>
            </div>

            <!-- Trạng thái chỉnh sửa (input + xác nhận + hủy) — ẩn ban đầu -->
            <div id="liveChatIdEdit" style="display:none;align-items:center;gap:4px;">
              <input id="liveChatIdInput" type="text"
                value="${liveChatCustomerId}"
                style="font-size:0.72rem;padding:3px 8px;border-radius:6px;
                  border:1px solid var(--accent-emerald);background:var(--bg-card);
                  color:var(--text-primary);width:160px;font-family:monospace;"
                placeholder="Nhập ID khách hàng..."
              />
              <button id="btnConfirmLiveChatId"
                title="Xác nhận"
                style="font-size:0.72rem;padding:3px 8px;border-radius:6px;
                  background:var(--accent-emerald);color:white;border:none;cursor:pointer;font-weight:700;">
                ✓
              </button>
              <button id="btnCancelLiveChatId"
                title="Hủy"
                style="font-size:0.72rem;padding:3px 8px;border-radius:6px;
                  border:1px solid var(--border-primary);background:var(--bg-glass);
                  cursor:pointer;color:var(--text-muted);">
                ✕
              </button>
            </div>

          </div>

          <button id="btnClearLiveChat" style="font-size:0.72rem;padding:5px 10px;border-radius:6px;border:1px solid var(--border-primary);background:var(--bg-glass);cursor:pointer;color:var(--text-muted);">
            🗑 Xóa lịch sử
          </button>
        </div>
      </div>

      <div id="liveChatMessages"
        style="height:320px;overflow-y:auto;background:var(--bg-secondary);border-radius:10px;
               padding:14px;margin-bottom:12px;display:flex;flex-direction:column;gap:10px;">
        <div style="text-align:center;color:var(--text-muted);font-size:0.82rem;padding:20px 0;">
          💬 Nhập tin nhắn của khách hàng bên dưới để test AI Agent
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:10px;">
        <input id="liveChatInput" type="text" class="settings-input" style="flex:1;font-size:0.85rem;"
          placeholder="Nhập tin nhắn khách hàng... (VD: 'Cáp bị hỏng, đổi giúp mình!')">
        <button id="btnLiveChatSend" class="btn-approve" style="white-space:nowrap;">Gửi ↗</button>
      </div>

      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
        ${[
          'Shop ơi hàng có auth không?',
          'Mua 2 cái có giảm không?',
          'Kem bị chảy nước rồi shop ơi!',
          'Anessa có hợp da dầu không ạ?',
          'Ship mấy ngày thì đến ạ?',
        ]
          .map(
            (t) =>
              `<button class="guidance-tag live-chat-quick" data-msg="${t}"
                style="font-size:0.7rem;padding:4px 8px;">${t}</button>`
          )
          .join('')}
      </div>

      <div style="padding:8px 12px;background:var(--accent-indigo-bg);border-radius:8px;font-size:0.75rem;color:var(--accent-indigo);">
        ℹ️ Mỗi tin nhắn được lưu vào SQLite. AI tra cứu chính sách + sản phẩm từ ChromaDB trước khi trả lời.
        Lịch sử 10 tin nhắn gần nhất được đưa vào context.
      </div>

      <!-- Real-time session analytics panel -->
      <div id="chatStatsPanel">
        <div style="margin-top:16px;border:1px solid var(--border-primary);border-radius:12px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#1e1b4b 0%,#312e81 100%);padding:10px 16px;display:flex;align-items:center;gap:8px;">
            <span style="font-size:1rem;">📊</span>
            <span style="font-size:0.82rem;font-weight:700;color:#e0e7ff;">Báo Cáo Phiên Chat – Realtime Analytics</span>
          </div>
          <div style="padding:20px;background:var(--bg-secondary);text-align:center;color:var(--text-muted);font-size:0.82rem;">
            💬 Gửi tin nhắn đầu tiên để xem phân tích realtime từ AI Agent...
          </div>
        </div>
      </div>

      <!-- Hồ sơ khách hàng panel -->
      <div id="customerProfilePanel" style="margin-top:14px;">
        <div style="border:1px solid var(--border-primary);border-radius:12px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#064e3b 0%,#065f46 100%);padding:10px 16px;
            display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:1rem;">👤</span>
              <span style="font-size:0.82rem;font-weight:700;color:#d1fae5;">Hồ Sơ Khách Hàng</span>
            </div>
            <button id="btnRefreshProfile"
              title="Tải lại hồ sơ"
              style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);
                border-radius:6px;cursor:pointer;padding:3px 8px;font-size:0.7rem;color:#d1fae5;">
              ↻ Làm mới
            </button>
          </div>
          <div id="customerProfileContent"
            style="padding:16px;background:var(--bg-secondary);color:var(--text-muted);
              font-size:0.82rem;text-align:center;">
            ⏳ Đang tải hồ sơ khách hàng...
          </div>
        </div>
      </div>
    </div>

    <!-- Chatbot Features & Quality Card (từ backend) -->
    <div class="content-card" id="chatbotFeaturesCard" style="margin-top:16px;">
      <div class="content-card-title">🧠 Tính Năng AI & Chất Lượng Chatbot</div>
      <div id="chatbotFeaturesContent" style="color:var(--text-muted);font-size:0.82rem;padding:8px 0;">
        ⏳ Đang tải từ backend...
      </div>
    </div>
  `;
}

function appendLiveChatBubble(role, text, meta = {}) {
  const container = document.getElementById('liveChatMessages');
  if (!container) return;

  const isUser = role === 'user';
  const div = document.createElement('div');
  div.style.cssText = `align-self:${isUser ? 'flex-end' : 'flex-start'};max-width:88%;`;

  if (role === 'thinking') {
    div.id = 'liveChatThinkingBubble';
    div.innerHTML = `
      <div style="padding:8px 14px;background:var(--accent-amber-bg);
        border-radius:10px;font-size:0.8rem;color:var(--accent-amber);
        border-left:3px solid var(--accent-amber);display:flex;align-items:center;gap:8px;">
        <span style="animation:spin 1s linear infinite;display:inline-block;">⏳</span>
        AI đang phân tích (RAG + Gemini)...
      </div>`;
  } else {
    const conf = (meta.confidence_score !== undefined && meta.confidence_score !== null)
      ? Math.round(meta.confidence_score * 100)
      : null;
    const safe = meta.is_safe;
    const sentiment = meta.sentiment_analysis;
    const isDemo = !!meta._isDemo;

    let metaBadges = '';
    if (!isUser) {
      if (isDemo) {
        // Backend offline — hiển thị trạng thái an toàn nhưng không có confidence score thật
        metaBadges = `<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">
          <span style="font-size:0.67rem;padding:2px 6px;border-radius:4px;
            background:var(--bg-glass);color:var(--text-muted);border:1px dashed var(--border-primary);">
            📴 Demo Mode
          </span>
          <span style="font-size:0.67rem;padding:2px 6px;border-radius:4px;
            background:${safe ? 'var(--accent-emerald-bg)' : 'var(--accent-rose-bg)'};
            color:${safe ? 'var(--accent-emerald)' : 'var(--accent-rose)'};">
            ${safe ? '✅ Tự động' : '⚠ Chờ duyệt'}
          </span>
          ${sentiment ? `<span style="font-size:0.67rem;padding:2px 6px;border-radius:4px;
              background:var(--bg-glass);color:var(--text-muted);">😶 ${sentiment}</span>` : ''}
        </div>`;
      } else if (conf !== null) {
        // Backend online — hiển thị confidence thật từ Gemini
        metaBadges = `<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">
          <span style="font-size:0.67rem;padding:2px 6px;border-radius:4px;
            background:${conf >= 70 ? 'var(--accent-emerald-bg)' : 'var(--accent-rose-bg)'};
            color:${conf >= 70 ? 'var(--accent-emerald)' : 'var(--accent-rose)'};">
            🎯 Confidence: ${conf}%
          </span>
          <span style="font-size:0.67rem;padding:2px 6px;border-radius:4px;
            background:${safe ? 'var(--accent-emerald-bg)' : 'var(--accent-rose-bg)'};
            color:${safe ? 'var(--accent-emerald)' : 'var(--accent-rose)'};">
            ${safe ? '✅ Tự động' : '⚠ Chờ duyệt'}
          </span>
          ${sentiment ? `<span style="font-size:0.67rem;padding:2px 6px;border-radius:4px;
              background:var(--bg-glass);color:var(--text-muted);">😶 ${sentiment}</span>` : ''}
        </div>`;
      }
    }

    div.innerHTML = `
      <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:3px;">
        ${isUser ? '👤 Khách hàng' : '🤖 AI Agent'}
      </div>
      <div style="background:${isUser ? '#dbeafe' : 'var(--bg-card)'};
        padding:10px 14px;border-radius:${isUser ? '12px 0 12px 12px' : '0 12px 12px 12px'};
        font-size:0.85rem;line-height:1.55;border:1px solid var(--border-primary);">
        ${text}
        ${metaBadges}
      </div>`;
  }

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

async function sendLiveChatMessage(msg) {
  if (!msg || !msg.trim()) return;

  const input = document.getElementById('liveChatInput');
  if (input) input.value = '';

  // Track session start
  if (!chatSessionStats.startTime) chatSessionStats.startTime = Date.now();
  chatSessionStats.totalUserMsgs++;

  appendLiveChatBubble('user', msg);

  // Thinking indicator
  const container = document.getElementById('liveChatMessages');
  const thinkingDiv = document.createElement('div');
  thinkingDiv.id = 'liveChatThinkingBubble';
  thinkingDiv.style.cssText = 'align-self:flex-start;';
  thinkingDiv.innerHTML = `<div style="padding:8px 14px;background:var(--accent-amber-bg);
    border-radius:10px;font-size:0.8rem;color:var(--accent-amber);
    border-left:3px solid var(--accent-amber);">⏳ AI đang phân tích (RAG + Gemini)...</div>`;
  if (container) { container.appendChild(thinkingDiv); container.scrollTop = container.scrollHeight; }

  const t0 = Date.now();

  try {
    const result = await apiCall('/chat-v3', 'POST', {
      customer_id: liveChatCustomerId,
      message: msg,
      brand_tone: 'Chuyên nghiệp, nhiệt tình',
    }, 90000); // LLM call (RAG + Gemini) — có thể mất 15-20s trên Render

    const elapsed = Date.now() - t0;
    const thinking = document.getElementById('liveChatThinkingBubble');
    if (thinking) thinking.remove();

    if (result && result.reply) {
      // Lấy evaluation từ backend. Đảm bảo confidence_score luôn có giá trị
      // dựa trên is_safe nếu Gemini trả thiếu trường này.
      const eval_ = result.ai_evaluation || {};

      // Thông báo riêng khi Gemini hết quota (vẫn hiển thị reply nhưng kèm cảnh báo)
      if (eval_._quota_exhausted) {
        showToast('Gemini API đã hết quota hôm nay. Vui lòng kiểm tra Google AI Studio hoặc đợi đến 00:00 UTC để reset.', 'warning');
      }
      if (eval_.confidence_score === undefined || eval_.confidence_score === null) {
        eval_.confidence_score = eval_.is_safe === false ? 0.4 : 0.7;
      }
      appendLiveChatBubble('ai', result.reply, eval_);

      // --- Update session stats ---
      chatSessionStats.totalAIReplies++;
      chatSessionStats.avgResponseMs.push(elapsed);

      if (eval_.confidence_score !== undefined) {
        chatSessionStats.confidenceScores.push(eval_.confidence_score);
      }
      if (eval_.is_safe === true) chatSessionStats.totalSafe++;
      else if (eval_.is_safe === false) chatSessionStats.totalEscalated++;
      else chatSessionStats.totalSafe++; // default safe

      if (eval_.sentiment_analysis) {
        chatSessionStats.sentiments.push(eval_.sentiment_analysis);
      }

      // Refresh the stats panel
      renderChatSessionStats();

      // Tự động cập nhật hồ sơ khách hàng sau mỗi lượt chat thực
      // (fire-and-forget: cập nhật panel ngầm, không block UI)
      loadCustomerProfile(liveChatCustomerId);

      // ── Đồng bộ tin nhắn vào Hộp Thư (Tin nhắn cần duyệt) ──
      _syncLiveChatToInbox(msg, result.reply, eval_);

    } else {
      appendLiveChatBubble('ai', 'Dạ em đang gặp chút trục trặc, anh/chị thử lại nhé ạ 🙏');
    }
  } catch (err) {
    const thinking = document.getElementById('liveChatThinkingBubble');
    if (thinking) thinking.remove();

    // ── Demo Mode: Mô phỏng AI response khi backend offline ──
    const negKeywords = ['hỏng', 'hư', 'lỗi', 'đổi trả', 'hoàn tiền', 'kém', 'thất vọng',
                         'chậm', 'bức xúc', 'tức', 'giả', 'fake', 'không sạc', 'tệ', 'dở'];
    const isNegative = negKeywords.some(k => msg.toLowerCase().includes(k));

    // Demo Mode: Backend offline — hiển thị phản hồi mẫu nhưng KHÔNG fake confidence score.
    // Confidence score CHỈ được lấy từ backend thực tế.
    if (isNegative) {
      const mockReply = 'Dạ em xin lỗi anh/chị về trải nghiệm không tốt này ạ 🙏 Em đã ghi nhận phản hồi của anh/chị và sẽ chuyển ngay cho bộ phận kỹ thuật + CSKH kiểm tra. Anh/chị vui lòng cho em xin số đơn hàng để được hỗ trợ đổi/trả miễn phí ạ.';
      // is_safe=false, nhưng confidence_score bị ẩn (undefined) vì không có AI thật phân tích
      const mockEval = { is_safe: false, confidence_score: undefined, sentiment_analysis: 'tức giận', identified_product_id: 'P009', risk_level: 'Cao', risk_category: 'Chất lượng sản phẩm', _isDemo: true };
      appendLiveChatBubble('ai', mockReply + ' <em style="font-size:0.68rem;color:var(--text-muted);">[Demo Mode — Confidence N/A]</em>', mockEval);
      _syncLiveChatToInbox(msg, mockReply, mockEval);
      chatSessionStats.totalAIReplies++;
      chatSessionStats.totalEscalated++;
      // Không push vào confidenceScores — chỉ tính điểm thật từ backend
      chatSessionStats.sentiments.push('tức giận');
      renderChatSessionStats();
    } else {
      const mockReply = 'Dạ anh/chị ơi! GIAO FARA hân hạnh được phục vụ ạ. Em có thể giúp gì cho anh/chị?';
      const mockEval = { is_safe: true, confidence_score: undefined, sentiment_analysis: 'bình thường', _isDemo: true };
      appendLiveChatBubble('ai', mockReply + ' <em style="font-size:0.68rem;color:var(--text-muted);">[Demo Mode — Confidence N/A]</em>', mockEval);
      _syncLiveChatToInbox(msg, mockReply, mockEval);
      chatSessionStats.totalAIReplies++;
      chatSessionStats.totalSafe++;
      // Không push vào confidenceScores — chỉ tính điểm thật từ backend
      chatSessionStats.sentiments.push('bình thường');
      renderChatSessionStats();
    }
    // Hiển thị thông tin lỗi thực sự lên chat để dễ debug
    const errMsg = err.message || String(err);
    console.warn('[Agicom] Chat API offline — Demo mode kích hoạt:', errMsg);

    // Luôn hiển thị lỗi thực sự để dễ debug (bất kể loại lỗi gì)
    const debugBubble = document.createElement('div');
    debugBubble.style.cssText = 'align-self:center;padding:6px 12px;background:#fff3cd;border:1px solid #ffc107;border-radius:8px;font-size:0.72rem;color:#856404;margin:4px 0;max-width:90%;word-break:break-word;';
    debugBubble.textContent = `⚠️ Lỗi kết nối backend: "${errMsg}" — Đang dùng Demo Mode tạm thời.`;
    const c = document.getElementById('liveChatMessages');
    if (c) { c.appendChild(debugBubble); c.scrollTop = c.scrollHeight; }
  }
}

/* ──────────────────────────────────────────────────────────────────────
   CHAT SESSION REPORT — Render real-time analytics panel
   ────────────────────────────────────────────────────────────────────── */
function renderChatSessionStats() {
  const panel = document.getElementById('chatStatsPanel');
  if (!panel) return;

  const s = chatSessionStats;
  const conf = s.avgConfidence();
  const sRate = s.safeRate();
  const sentCounts = s.sentimentCounts();
  const total = s.sentiments.length || 1;

  const posW  = Math.round(sentCounts.positive  / total * 100);
  const neutW = Math.round(sentCounts.neutral   / total * 100);
  const negW  = Math.round(sentCounts.negative  / total * 100);

  const confColor  = conf >= 80 ? '#10b981' : conf >= 60 ? '#f59e0b' : '#ef4444';
  const srateColor = sRate >= 80 ? '#10b981' : sRate >= 60 ? '#f59e0b' : '#ef4444';

  panel.innerHTML = `
    <div style="margin-top:16px;border:1px solid var(--border-primary);border-radius:12px;overflow:hidden;">

      <!-- Header -->
      <div style="background:linear-gradient(135deg,#1e1b4b 0%,#312e81 100%);
        padding:10px 16px;display:flex;align-items:center;gap:8px;">
        <span style="font-size:1rem;">📊</span>
        <span style="font-size:0.82rem;font-weight:700;color:#e0e7ff;letter-spacing:0.3px;">
          Báo Cáo Phiên Chat – Realtime Analytics
        </span>
        <span style="margin-left:auto;font-size:0.68rem;color:#a5b4fc;background:#312e81;
          padding:2px 8px;border-radius:10px;border:1px solid #4f46e5;">
          🕐 ${s.sessionDuration()}
        </span>
      </div>

      <div style="padding:14px;background:var(--bg-secondary);">

        <!-- KPI row -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px;">

          <div style="background:var(--bg-card);border-radius:8px;padding:10px;text-align:center;border:1px solid var(--border-primary);">
            <div style="font-size:1.4rem;font-weight:800;color:var(--accent-indigo);">${s.totalUserMsgs}</div>
            <div style="font-size:0.65rem;color:var(--text-muted);margin-top:2px;">Tin nhắn<br>khách hàng</div>
          </div>

          <div style="background:var(--bg-card);border-radius:8px;padding:10px;text-align:center;border:1px solid var(--border-primary);">
            <div style="font-size:1.4rem;font-weight:800;color:${confColor};">${conf || '—'}${conf ? '%' : ''}</div>
            <div style="font-size:0.65rem;color:var(--text-muted);margin-top:2px;">Avg<br>Confidence</div>
          </div>

          <div style="background:var(--bg-card);border-radius:8px;padding:10px;text-align:center;border:1px solid var(--border-primary);">
            <div style="font-size:1.4rem;font-weight:800;color:${srateColor};">${s.totalAIReplies ? sRate + '%' : '—'}</div>
            <div style="font-size:0.65rem;color:var(--text-muted);margin-top:2px;">Tỉ lệ<br>Auto-Reply</div>
          </div>

          <div style="background:var(--bg-card);border-radius:8px;padding:10px;text-align:center;border:1px solid var(--border-primary);">
            <div style="font-size:1.4rem;font-weight:800;color:var(--accent-amber);">${s.avgResponse()}</div>
            <div style="font-size:0.65rem;color:var(--text-muted);margin-top:2px;">Avg Response<br>Time</div>
          </div>
        </div>

        <!-- Routing breakdown -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
          <div style="background:#dcfce7;border-radius:8px;padding:10px;border-left:3px solid #16a34a;display:flex;align-items:center;gap:10px;">
            <span style="font-size:1.4rem;">✅</span>
            <div>
              <div style="font-size:1.1rem;font-weight:800;color:#15803d;">${s.totalSafe}</div>
              <div style="font-size:0.68rem;color:#166534;">Tự động gửi<br><span style="opacity:0.7;">(Safe · Confidence ≥ 70%)</span></div>
            </div>
          </div>
          <div style="background:#fef3c7;border-radius:8px;padding:10px;border-left:3px solid #d97706;display:flex;align-items:center;gap:10px;">
            <span style="font-size:1.4rem;">⚠️</span>
            <div>
              <div style="font-size:1.1rem;font-weight:800;color:#b45309;">${s.totalEscalated}</div>
              <div style="font-size:0.68rem;color:#92400e;">Chờ duyệt người<br><span style="opacity:0.7;">(Escalated · Cần review)</span></div>
            </div>
          </div>
        </div>

        ${s.sentiments.length > 0 ? `
        <!-- Sentiment distribution -->
        <div style="margin-bottom:10px;">
          <div style="font-size:0.75rem;font-weight:700;color:var(--text-secondary);margin-bottom:6px;">
            😶 Phân bố cảm xúc khách hàng (${s.sentiments.length} phân tích)
          </div>
          <!-- Bar chart -->
          <div style="border-radius:6px;overflow:hidden;height:12px;display:flex;gap:1px;margin-bottom:6px;">
            ${posW  > 0 ? `<div style="width:${posW}%;background:#10b981;transition:width 0.4s;" title="Tích cực ${posW}%"></div>` : ''}
            ${neutW > 0 ? `<div style="width:${neutW}%;background:#94a3b8;transition:width 0.4s;" title="Trung lập ${neutW}%"></div>` : ''}
            ${negW  > 0 ? `<div style="width:${negW}%;background:#ef4444;transition:width 0.4s;" title="Tiêu cực ${negW}%"></div>` : ''}
          </div>
          <div style="display:flex;gap:12px;font-size:0.68rem;color:var(--text-muted);">
            <span><span style="color:#10b981;font-weight:700;">●</span> Tích cực ${sentCounts.positive} (${posW}%)</span>
            <span><span style="color:#94a3b8;font-weight:700;">●</span> Trung lập ${sentCounts.neutral} (${neutW}%)</span>
            <span><span style="color:#ef4444;font-weight:700;">●</span> Tiêu cực ${sentCounts.negative} (${negW}%)</span>
          </div>
        </div>` : `
        <div style="text-align:center;padding:8px;font-size:0.78rem;color:var(--text-muted);
          background:var(--bg-glass);border-radius:8px;">
          💬 Gửi tin nhắn để xem phân tích cảm xúc theo thời gian thực
        </div>`}

        <!-- Confidence gauge (simple) -->
        ${conf > 0 ? `
        <div style="margin-top:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-size:0.72rem;color:var(--text-muted);">Độ tin cậy trung bình AI</span>
            <span style="font-size:0.72rem;font-weight:700;color:${confColor};">${conf}%</span>
          </div>
          <div style="height:6px;background:var(--bg-glass);border-radius:3px;overflow:hidden;">
            <div style="height:100%;width:${conf}%;background:${confColor};border-radius:3px;transition:width 0.5s;"></div>
          </div>
          <div style="font-size:0.65rem;color:var(--text-muted);margin-top:3px;">
            ${conf >= 80 ? '🟢 Rất tốt — AI tự tin trả lời' : conf >= 60 ? '🟡 Khá — một số câu hỏi cần escalate' : '🔴 Thấp — nhiều câu hỏi nằm ngoài knowledge base'}
          </div>
        </div>` : ''}

      </div>
    </div>
  `;
}

/* ──────────────────────────────────────────────────────────────────────
   7. DAILY SUMMARY — /daily-summary + /export-daily-summary
   ────────────────────────────────────────────────────────────────────── */

async function loadDailySummary() {
  const container = document.getElementById('dailySummaryContent');
  if (!container) return;

  // Backend offline — hiển thị bản demo ngay, không thử kết nối
  if (!_backendConnected) {
    container.innerHTML = `
      <div style="padding:14px;background:rgba(245,158,11,0.08);border-radius:10px;
        border:1px solid rgba(245,158,11,0.25);">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <span style="font-size:1.1rem;">🟡</span>
          <span style="font-size:0.82rem;font-weight:700;color:#f59e0b;">
            Demo Mode — Backend offline
          </span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px;">
          <div style="padding:10px;background:var(--accent-emerald-bg);border-radius:8px;text-align:center;">
            <div style="font-size:1.5rem;">✅</div>
            <div style="font-size:0.7rem;font-weight:700;color:var(--accent-emerald);">Rủi ro: An toàn</div>
          </div>
          <div style="padding:10px;background:var(--accent-amber-bg);border-radius:8px;text-align:center;">
            <div style="font-size:1.5rem;font-weight:800;color:var(--accent-amber);">3</div>
            <div style="font-size:0.7rem;font-weight:700;color:var(--accent-amber);">Tác vụ chờ xử lý</div>
          </div>
          <div style="padding:10px;background:var(--accent-indigo-bg);border-radius:8px;text-align:center;">
            <div style="font-size:1.5rem;font-weight:800;color:var(--accent-indigo);">5</div>
            <div style="font-size:0.7rem;font-weight:700;color:var(--accent-indigo);">Insights CSKH</div>
          </div>
        </div>
        <div style="font-size:0.78rem;color:var(--text-muted);line-height:1.6;margin-bottom:10px;">
          Đây là dữ liệu mẫu. Kết nối backend để xem tóm tắt thực từ cơ sở dữ liệu của bạn.
        </div>
        <button onclick="loadDailySummary()" class="btn-modal-cancel" style="font-size:0.76rem;padding:6px 14px;">
          🔄 Thử tải lại
        </button>
      </div>`;
    return;
  }

  container.innerHTML =
    '<div style="text-align:center;padding:24px;color:var(--text-muted);">⏳ Đang tải tóm tắt từ backend...</div>';

  try {
    const data = await apiCall('/daily-summary');

    const risk = data.risk_management || {};
    const growth = data.growth_strategy || {};
    const insights = data.customer_sentiment_overview || [];
    const riskStatus = risk.status || 'An toàn';
    const riskTasks = risk.urgent_actions || [];
    const pricingTasks = growth.pricing_proposals || [];
    const contentTasks = growth.content_optimizations || [];
    const totalTasks = riskTasks.length + pricingTasks.length + contentTasks.length;

    const renderTaskList = (items, color) =>
      items.length
        ? items
            .map(
              (t) =>
                `<div style="padding:7px 10px;background:${color}18;border-radius:6px;
                  font-size:0.8rem;margin-bottom:4px;border-left:3px solid ${color};">
                  ${t}
                </div>`
            )
            .join('')
        : `<div style="font-size:0.8rem;color:var(--text-muted);padding:4px 0;">Không có tác vụ nào.</div>`;

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px;">
        <div style="padding:12px;background:${riskStatus === 'Cảnh báo' ? 'var(--accent-rose-bg)' : 'var(--accent-emerald-bg)'};
          border-radius:8px;text-align:center;">
          <div style="font-size:1.6rem;">${riskStatus === 'Cảnh báo' ? '⚠️' : '✅'}</div>
          <div style="font-size:0.72rem;font-weight:700;
            color:${riskStatus === 'Cảnh báo' ? 'var(--accent-rose)' : 'var(--accent-emerald)'};">
            Rủi ro: ${riskStatus}
          </div>
        </div>
        <div style="padding:12px;background:var(--accent-amber-bg);border-radius:8px;text-align:center;">
          <div style="font-size:1.6rem;font-weight:800;color:var(--accent-amber);">${totalTasks}</div>
          <div style="font-size:0.72rem;font-weight:700;color:var(--accent-amber);">Tác vụ chờ xử lý</div>
        </div>
        <div style="padding:12px;background:var(--accent-indigo-bg);border-radius:8px;text-align:center;">
          <div style="font-size:1.6rem;font-weight:800;color:var(--accent-indigo);">${insights.length}</div>
          <div style="font-size:0.72rem;font-weight:700;color:var(--accent-indigo);">Insights CSKH</div>
        </div>
      </div>

      ${riskTasks.length ? `
        <div style="margin-bottom:12px;">
          <div style="font-weight:700;font-size:0.82rem;color:var(--accent-rose);margin-bottom:6px;">
            🚨 Cảnh báo rủi ro (${riskTasks.length})
          </div>
          ${renderTaskList(riskTasks, '#ef4444')}
        </div>` : ''}

      ${pricingTasks.length ? `
        <div style="margin-bottom:12px;">
          <div style="font-weight:700;font-size:0.82rem;color:var(--accent-amber);margin-bottom:6px;">
            💰 Đề xuất chiến lược giá (${pricingTasks.length})
          </div>
          ${renderTaskList(pricingTasks, '#f59e0b')}
        </div>` : ''}

      ${contentTasks.length ? `
        <div style="margin-bottom:12px;">
          <div style="font-weight:700;font-size:0.82rem;color:var(--accent-indigo);margin-bottom:6px;">
            📝 Đề xuất cập nhật nội dung (${contentTasks.length})
          </div>
          ${renderTaskList(contentTasks, '#6366f1')}
        </div>` : ''}

      ${insights.length ? `
        <div style="margin-bottom:12px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <div style="font-weight:700;font-size:0.82rem;color:var(--accent-emerald);">
              💬 Insights từ CSKH — Chatbot Report (${insights.length})
            </div>
            <span style="font-size:0.68rem;background:var(--accent-emerald-bg);color:var(--accent-emerald);
              padding:2px 8px;border-radius:8px;font-weight:600;">Live từ DB</span>
          </div>

          ${/* Phân loại insight theo keyword */
            (() => {
              const cats = {
                '⚠️ Giao hàng & Vận chuyển': [],
                '🔧 Chất lượng sản phẩm': [],
                '💰 Giá & Khuyến mãi': [],
                '💬 Dịch vụ & Thái độ': [],
                '📦 Khác': [],
              };
              insights.forEach(i => {
                const lower = i.toLowerCase();
                if (lower.includes('giao') || lower.includes('ship') || lower.includes('vận chuyển') || lower.includes('đặt hàng')) cats['⚠️ Giao hàng & Vận chuyển'].push(i);
                else if (lower.includes('chất lượng') || lower.includes('hỏng') || lower.includes('lỗi') || lower.includes('sản phẩm') || lower.includes('pin')) cats['🔧 Chất lượng sản phẩm'].push(i);
                else if (lower.includes('giá') || lower.includes('đắt') || lower.includes('rẻ') || lower.includes('khuyến') || lower.includes('sale')) cats['💰 Giá & Khuyến mãi'].push(i);
                else if (lower.includes('nhân viên') || lower.includes('shop') || lower.includes('tư vấn') || lower.includes('hỗ trợ') || lower.includes('phản hồi')) cats['💬 Dịch vụ & Thái độ'].push(i);
                else cats['📦 Khác'].push(i);
              });
              return Object.entries(cats)
                .filter(([,arr]) => arr.length > 0)
                .map(([cat, arr]) => `
                  <div style="margin-bottom:10px;">
                    <div style="font-size:0.73rem;font-weight:700;color:var(--text-secondary);
                      margin-bottom:5px;display:flex;align-items:center;gap:6px;">
                      ${cat}
                      <span style="font-weight:400;font-size:0.67rem;background:var(--bg-glass);
                        padding:1px 6px;border-radius:8px;color:var(--text-muted);">${arr.length}</span>
                    </div>
                    ${arr.slice(0, 3).map(i => `
                      <div style="padding:7px 10px;background:var(--accent-emerald-bg);
                        border-radius:6px;font-size:0.78rem;margin-bottom:4px;
                        border-left:3px solid var(--accent-emerald);line-height:1.45;">${i}</div>
                    `).join('')}
                    ${arr.length > 3 ? `<div style="font-size:0.7rem;color:var(--text-muted);padding:2px 4px;">
                      +${arr.length - 3} insight khác trong ngày
                    </div>` : ''}
                  </div>
                `).join('');
            })()
          }

          <!-- Summary bar -->
          <div style="padding:8px 12px;background:var(--bg-secondary);border-radius:8px;
            display:flex;gap:16px;flex-wrap:wrap;margin-top:4px;">
            <div style="font-size:0.72rem;color:var(--text-muted);">
              📈 <strong style="color:var(--text-primary);">${insights.length}</strong> tín hiệu từ chatbot hôm nay
            </div>
            <div style="font-size:0.72rem;color:var(--text-muted);">
              🤖 AI đã tự động xử lý và phân loại
            </div>
          </div>
        </div>` : ''}

      ${totalTasks === 0 && insights.length === 0
        ? `<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:0.85rem;">
            ✅ Hệ thống ổn định — Không có tác vụ khẩn cấp hôm nay.
          </div>`
        : ''}

      <div style="display:flex;align-items:center;justify-content:space-between;
        margin-top:12px;flex-wrap:wrap;gap:8px;">
        <div style="font-size:0.72rem;color:var(--text-muted);">📅 Ngày báo cáo: ${data.date}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button onclick="generateContentSuggestionsFromSummary(window._lastDailySummaryData)"
            class="btn-approve"
            style="font-size:0.76rem;padding:6px 12px;background:var(--accent-indigo);border-color:var(--accent-indigo);">
            📝 Tạo đề xuất Content
          </button>
          <button onclick="exportDailySummary()" class="btn-approve" style="font-size:0.76rem;padding:6px 12px;">
            📤 Xuất & Lưu trữ
          </button>
          <button onclick="loadDailySummary()" class="btn-modal-cancel" style="font-size:0.76rem;padding:6px 12px;">
            🔄 Làm mới
          </button>
        </div>
      </div>
    `;
    // Lưu lại để nút "Tạo đề xuất Content" dùng
    window._lastDailySummaryData = data;
  } catch (err) {
    container.innerHTML = `
      <div style="color:var(--accent-rose);font-size:0.85rem;padding:12px;
        background:var(--accent-rose-bg);border-radius:8px;">
        ❌ Không thể tải từ backend.<br>
        <small style="color:var(--text-muted);">${err.message}</small><br>
        <small>Kiểm tra backend đang chạy tại: <strong>${API_BASE}</strong></small>
      </div>`;
    console.warn('[Agicom] Daily summary API lỗi:', err.message);
  }
}

async function exportDailySummary() {
  try {
    await apiCall('/export-daily-summary', 'POST');
    showToast('✅ Đã xuất báo cáo ngày và lưu vào archive thành công!', 'success');
    setTimeout(loadDailySummary, 800);
  } catch (err) {
    showToast('❌ Lỗi xuất báo cáo: ' + err.message, 'danger');
  }
}

/* ──────────────────────────────────────────────────────────────────────
   8. HUMAN APPROVAL — /act-and-learn
   ────────────────────────────────────────────────────────────────────── */

async function sendApprovalToBackend(proposalId, status, feedback = '') {
  try {
    await apiCall('/act-and-learn', 'POST', {
      proposal_id: proposalId,
      status,
      feedback,
    });
    console.log(`[Agicom] Approval sent: ${proposalId} → ${status}`);
  } catch (err) {
    console.warn('[Agicom] Approval API lỗi:', err.message);
  }
}

/* ──────────────────────────────────────────────────────────────────────
   9. RESET ALL — /system/reset-all
   ────────────────────────────────────────────────────────────────────── */

async function handleResetAll() {
  const confirmed = window.confirm(
    '⚠️ BẠN CÓ CHẮC CHẮN?\n\n' +
      'Thao tác này sẽ XÓA TOÀN BỘ:\n' +
      '  • Lịch sử chat\n' +
      '  • Lịch sử review\n' +
      '  • Tác vụ đang chờ\n' +
      '  • Kiến thức ChromaDB\n\n' +
      'Không thể hoàn tác!'
  );
  if (!confirmed) return;

  try {
    await apiCall('/system/reset-all', 'POST', null, 45000); // Xóa + seed lại vector DB
    showToast('✅ Đã reset toàn bộ dữ liệu AI về trạng thái trắng.', 'success');
  } catch (err) {
    showToast('❌ Lỗi reset: ' + err.message, 'danger');
    console.warn('[Agicom] Reset API lỗi:', err.message);
  }
}

async function handleSeedCrisisDemo() {
  const confirmed = window.confirm(
    '🛡 Seed dữ liệu Crisis Demo?\n\n' +
    'Sẽ chèn thêm vào DB:\n' +
    '  • 6 review tiêu cực (P011, P002, P003)\n' +
    '  • 2 RiskManager tasks (P011, P002)\n' +
    '  • 3 chat log có tín hiệu rủi ro\n\n' +
    'Dữ liệu hiện có KHÔNG bị xóa.'
  );
  if (!confirmed) return;

  try {
    const res = await apiCall('/system/seed-crisis-demo', 'POST', null, 15000);
    showToast('✅ ' + (res.message || 'Đã seed crisis demo thành công!'), 'success');
    // Tự động chuyển sang Crisis Center để xem kết quả
    setTimeout(() => navigate('crisis-center'), 1200);
  } catch (err) {
    showToast('❌ Lỗi seed crisis: ' + err.message, 'danger');
  }
}

/* ──────────────────────────────────────────────────────────────────────
   10. INJECT UI VÀO CÁC TRANG — Override navigate()
   ────────────────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────────────────────
   DASHBOARD LIVE DATA
   Điền 2 block động vào Tổng quan:
     • #dashCrisisBanner  ← /api/crisis-overview  (tín hiệu khủng hoảng thực)
     • #dashAIPerf        ← /api/dashboard/ai-stats (counts từ DB)
   Cả hai được tải song song; mỗi block tự xử lý trạng thái offline/lỗi.
   ──────────────────────────────────────────────────────────────────────── */
async function _loadDashboardLiveData() {
  const bannerEl = document.getElementById('dashCrisisBanner');
  const perfEl   = document.getElementById('dashAIPerf');
  if (!bannerEl && !perfEl) return;

  // Skeleton loading cho AI perf
  if (perfEl) perfEl.innerHTML = `
    <div class="content-card" style="border:1px dashed var(--border-primary);">
      <div style="height:14px;border-radius:6px;background:var(--border-primary);
        margin-bottom:10px;width:60%;"></div>
      <div style="height:10px;border-radius:6px;background:var(--border-primary);
        margin-bottom:6px;width:90%;"></div>
      <div style="height:10px;border-radius:6px;background:var(--border-primary);
        width:70%;"></div>
      <div style="font-size:0.72rem;color:var(--text-muted);margin-top:10px;">
        ⏳ Đang tải hiệu suất AI...
      </div>
    </div>`;

  // Tải song song
  const [crisisRes, statsRes] = await Promise.allSettled([
    _backendConnected ? apiCall('/api/crisis-overview') : Promise.reject(new Error('offline')),
    _backendConnected ? apiCall('/api/dashboard/ai-stats') : Promise.reject(new Error('offline')),
  ]);

  // ── CRISIS BANNER ─────────────────────────────────────────────────────
  if (bannerEl) {
    if (crisisRes.status === 'fulfilled' && crisisRes.value?.crises?.length) {
      const overview  = crisisRes.value;
      const criticals = overview.crises.filter(c => c.severity === 'critical');
      const warnings  = overview.crises.filter(c => c.severity === 'warning');
      bannerEl.innerHTML = [...criticals, ...warnings].map(cr => {
        const isCrit  = cr.severity === 'critical';
        const bg      = isCrit
          ? 'linear-gradient(90deg,#7f1d1d,#991b1b)'
          : 'linear-gradient(90deg,#78350f,#92400e)';
        const border  = isCrit ? '#ef4444' : '#f59e0b';
        const textCol = isCrit ? '#fca5a5' : '#fde68a';
        const badge   = isCrit ? '🚨 MỨC ĐỎ' : '⚠️ CẢNH BÁO';
        const signals = [
          cr.neg_review_count  > 0 ? `📝 ${cr.neg_review_count} review tiêu cực`  : null,
          cr.risk_task_count   > 0 ? `⚡ ${cr.risk_task_count} tác vụ rủi ro`     : null,
          cr.chat_signal_count > 0 ? `💬 ${cr.chat_signal_count} chat signal`     : null,
        ].filter(Boolean).join(' · ');
        return `
          <div style="display:flex;align-items:center;gap:14px;padding:10px 16px;
            margin-bottom:10px;background:${bg};border-radius:12px;
            border:1px solid ${border};box-shadow:0 0 20px ${border}40;">
            <div style="font-size:1.4rem;flex-shrink:0;">${isCrit ? '🔥' : '⚠️'}</div>
            <div style="flex:1;min-width:0;">
              <div style="color:${textCol};font-size:0.65rem;font-weight:700;
                letter-spacing:1px;text-transform:uppercase;">
                Orchestrator · ${badge}
              </div>
              <div style="color:#fff;font-weight:800;font-size:0.92rem;
                white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                ${cr.product_name || cr.product_id}
                — Severity <span style="color:${textCol};">${cr.severity_score}/100</span>
              </div>
              <div style="font-size:0.72rem;color:${textCol};margin-top:3px;">${signals}</div>
            </div>
            <button onclick="navigate('crisis-center')"
              style="flex-shrink:0;background:${border};color:white;border:none;
                padding:8px 16px;border-radius:8px;font-weight:700;cursor:pointer;
                font-size:0.8rem;white-space:nowrap;">
              Xử lý →
            </button>
          </div>`;
      }).join('') + `<div style="margin-bottom:6px;"></div>`;
    }
    // Safe or offline: no banner — đừng chiếm space
  }

  // ── AI PERFORMANCE CARD ───────────────────────────────────────────────
  if (perfEl) {
    if (statsRes.status === 'fulfilled' && statsRes.value) {
      const s     = statsRes.value;
      const sug   = s.suggestions || {};
      const chats = s.chats       || {};
      const rev   = s.reviews     || {};
      const tasks = s.tasks       || {};
      const cr    = s.crisis      || {};

      const autoRate  = chats.total  > 0
        ? Math.round((chats.auto       / chats.total)  * 100) : 0;
      const negPct    = rev.total    > 0
        ? Math.round((rev.negative     / rev.total)    * 100) : 0;
      const actionPct = cr.actions_total > 0
        ? Math.round((cr.actions_done  / cr.actions_total) * 100) : 0;

      perfEl.innerHTML = `
        <div class="content-card">
          <div style="display:flex;justify-content:space-between;align-items:center;
            margin-bottom:14px;flex-wrap:wrap;gap:8px;">
            <div class="content-card-title" style="margin:0;">
              🤖 Hiệu suất AI Agent — Dữ liệu thực từ DB
            </div>
            <span style="font-size:0.7rem;background:var(--accent-emerald-bg);
              color:var(--accent-emerald);padding:3px 9px;border-radius:20px;
              font-weight:700;">● LIVE</span>
          </div>

          <div class="grid-3" style="gap:12px;margin-bottom:14px;">
            <div class="big-metric" style="cursor:pointer;"
              onclick="navigate('content-suggestions')">
              <div class="big-metric-value" style="color:var(--accent-amber);">
                ${sug.total || 0}
              </div>
              <div class="big-metric-label">Đề xuất AI tổng</div>
              <div class="big-metric-trend">
                ✅ ${sug.approved || 0} duyệt ·
                ⏳ ${sug.pending  || 0} chờ ·
                ❌ ${sug.rejected || 0} từ chối
              </div>
            </div>
            <div class="big-metric" style="cursor:pointer;" onclick="navigate('chat')">
              <div class="big-metric-value" style="color:var(--accent-emerald);">
                ${chats.total || 0}
              </div>
              <div class="big-metric-label">Hội thoại đã xử lý</div>
              <div class="big-metric-trend">
                ${autoRate}% tự động · ${chats.escalated || 0} cần can thiệp
              </div>
            </div>
            <div class="big-metric" style="cursor:pointer;" onclick="navigate('reviews')">
              <div class="big-metric-value"
                style="color:${negPct >= 40 ? 'var(--accent-rose)' : 'var(--accent-blue)'};">
                ${rev.total || 0}
              </div>
              <div class="big-metric-label">Reviews phân tích</div>
              <div class="big-metric-trend">
                ${negPct}% tiêu cực · ${rev.positive || 0} tích cực
              </div>
            </div>
          </div>

          <div style="display:flex;gap:12px;flex-wrap:wrap;">
            <div style="flex:1;min-width:150px;padding:10px 14px;
              background:var(--accent-amber-bg);border-radius:10px;">
              <div style="font-size:0.72rem;font-weight:700;
                color:var(--accent-amber);margin-bottom:4px;">
                ⚡ Tác vụ AI → Người
              </div>
              <div style="font-size:1.35rem;font-weight:800;color:var(--text-primary);">
                ${tasks.pending || 0}
                <span style="font-size:0.74rem;font-weight:400;color:var(--text-muted);">
                  chờ xử lý / ${tasks.total || 0} tổng
                </span>
              </div>
            </div>
            <div style="flex:1;min-width:150px;padding:10px 14px;
              background:var(--accent-rose-bg);border-radius:10px;cursor:pointer;"
              onclick="navigate('crisis-center')">
              <div style="font-size:0.72rem;font-weight:700;
                color:var(--accent-rose);margin-bottom:4px;">
                🛡 Kế hoạch Khủng hoảng AI
              </div>
              <div style="font-size:1.35rem;font-weight:800;color:var(--text-primary);">
                ${cr.plans_generated || 0}
                <span style="font-size:0.74rem;font-weight:400;color:var(--text-muted);">
                  kế hoạch · ${cr.actions_done || 0}/${cr.actions_total || 0} hành động ✓
                </span>
              </div>
              ${cr.actions_total > 0 ? `
                <div style="margin-top:6px;height:4px;background:var(--border-primary);
                  border-radius:4px;overflow:hidden;">
                  <div style="height:100%;width:${actionPct}%;
                    background:var(--accent-rose);border-radius:4px;"></div>
                </div>` : ''}
            </div>
          </div>
        </div>`;

    } else {
      // Backend offline — fallback với MOCK.ai_today
      const ai = (typeof MOCK !== 'undefined' && MOCK.ai_today) || {};
      perfEl.innerHTML = `
        <div class="content-card"
          style="border-color:var(--accent-amber);opacity:0.9;">
          <div style="display:flex;justify-content:space-between;align-items:center;
            margin-bottom:14px;flex-wrap:wrap;gap:8px;">
            <div class="content-card-title" style="margin:0;">
              🤖 Hiệu suất AI Agent hôm nay
            </div>
            <span style="font-size:0.7rem;background:var(--accent-amber-bg);
              color:var(--accent-amber);padding:3px 9px;border-radius:20px;
              font-weight:700;">Demo</span>
          </div>
          <div class="grid-3" style="gap:12px;">
            <div class="big-metric">
              <div class="big-metric-value" style="color:var(--accent-amber);">
                ${ai.suggestions_created || 12}
              </div>
              <div class="big-metric-label">Đề xuất AI tạo ra</div>
              <div class="big-metric-trend">
                ✅ ${ai.suggestions_approved || 8} duyệt ·
                ⏳ ${ai.suggestions_pending  || 3} chờ ·
                ❌ ${ai.suggestions_rejected || 1} từ chối
              </div>
            </div>
            <div class="big-metric">
              <div class="big-metric-value" style="color:var(--accent-emerald);">
                ${ai.chats_handled || 142}
              </div>
              <div class="big-metric-label">Tin nhắn xử lý</div>
              <div class="big-metric-trend">
                ~79% tự động · ${ai.chats_escalated || 30} cần can thiệp
              </div>
            </div>
            <div class="big-metric">
              <div class="big-metric-value" style="color:var(--accent-blue);">—</div>
              <div class="big-metric-label">Kế hoạch Khủng hoảng AI</div>
              <div class="big-metric-trend">Kết nối backend để xem</div>
            </div>
          </div>
        </div>`;
    }
  }
}

const _origNavigate = navigate;

navigate = function (page) {
  _origNavigate(page);

  // Inject thêm UI sau khi page render xong
  setTimeout(() => {
    if (page === 'dashboard') {
      injectDailySummaryCard();
      _loadDashboardLiveData();
    } else if (page === 'reviews') {
      // Chỉ tải dữ liệu — form submit đã chuyển sang trang Demo khách hàng
      loadReviewsFromAPI();
    } else if (page === 'chat') {
      // Live Chat widget đã chuyển sang trang Demo khách hàng
    } else if (page === 'settings') {
      injectResetButton();
      setTimeout(_populateSettingsForm, 50);
    } else if (page === 'crisis-center') {
      loadCrisisFromBackend();
    } else if (page === 'demo-customer') {
      _injectDemoCustomerPage();
    } else if (page === 'content-suggestions') {
      loadContentSuggestionsFromBackend().then(() => _injectContentSuggestionsBar());
    }
  }, 80);
};

/* ── Load content suggestions từ backend, merge vào MOCK ── */
async function loadContentSuggestionsFromBackend() {
  if (typeof MOCK === 'undefined') return { success: false, count: 0 };
  try {
    const data = await apiCall('/api/content-suggestions');
    if (!data || !Array.isArray(data.suggestions)) return { success: false, count: 0 };

    // Xoá các suggestion đã load từ backend trước đó
    MOCK.content_suggestions_generated =
      MOCK.content_suggestions_generated.filter(s => !s._fromBackend);

    // Merge: backend suggestions lên trước, giữ lại các suggestion từ daily summary
    const fromDailySummary = MOCK.content_suggestions_generated.filter(s => s._fromDailySummary);
    const fromOther        = MOCK.content_suggestions_generated.filter(s => !s._fromDailySummary);

    // Backend suggestions (đã có status thực từ DB)
    const backendSugs = data.suggestions.map(s => ({ ...s, _fromBackend: true }));

    MOCK.content_suggestions_generated = [...fromDailySummary, ...backendSugs, ...fromOther];

    // Lưu meta để dùng trong bar
    window._contentBackendMeta = data.meta || {};
    return { success: true, count: backendSugs.length };
  } catch (_err) {
    // Backend offline — giữ MOCK nguyên
    window._contentBackendMeta = null;
    return { success: false, count: 0 };
  }
}

/* ── Cập nhật status đề xuất: MOCK + backend (fire-and-forget) ── */
async function updateContentSuggestionStatus(sugId, newStatus) {
  if (typeof MOCK === 'undefined') return;
  const sug = MOCK.content_suggestions_generated.find(s => s.id === sugId);
  if (sug) sug.status = newStatus;
  try {
    await apiCall(`/api/content-suggestions/${encodeURIComponent(sugId)}/status`, 'PATCH', {
      status: newStatus,
      title: sug?.title || sugId,
      type: sug?.type || 'guide',
      platform: sug?.platform || '',
      priority: sug?.priority || 'medium',
      combined_score: sug?.combined_score || 0,
      chatbot_count: sug?.chatbot_signal?.count || 0,
      chatbot_topic: sug?.chatbot_signal?.topic || '',
      review_count: sug?.review_signal?.count || 0,
      review_neg_pct: sug?.review_signal?.neg_pct || 0,
      sample_questions: sug?.chatbot_signal?.sample_questions || [],
      sample_reviews: sug?.review_signal?.sample_reviews || [],
      angle: sug?.angle || '',
      estimated_impact: sug?.estimated_impact || '',
      estimated_production: sug?.estimated_production || '',
      source: sug?._source || 'frontend'
    });
  } catch (_e) {
    // silent — MOCK đã được cập nhật rồi
  }
}

/* ── Các hàm action cho nút trong thẻ đề xuất content ── */
function scheduleSuggestion(sugId) {
  updateContentSuggestionStatus(sugId, 'scheduled');
  showToast('✅ Đã lên lịch sản xuất content!', 'success');
  setTimeout(() => navigate('content-suggestions'), 300);
}

function saveSuggestion(sugId) {
  updateContentSuggestionStatus(sugId, 'saved');
  showToast('📌 Đã lưu vào danh sách theo dõi!', 'info');
  setTimeout(() => navigate('content-suggestions'), 300);
}

function ignoreSuggestion(sugId) {
  updateContentSuggestionStatus(sugId, 'ignored');
  showToast('✕ Đã ẩn đề xuất này', 'warning');
  setTimeout(() => navigate('content-suggestions'), 300);
}

function restoreSuggestion(sugId) {
  updateContentSuggestionStatus(sugId, 'pending');
  showToast('↩ Đã khôi phục về trạng thái chờ', 'info');
  setTimeout(() => navigate('content-suggestions'), 300);
}

/* ── Inject: Action bar trên trang Content Suggestions ── */
function _injectContentSuggestionsBar() {
  // Không inject bar khi đang ở tab Tạo Script
  if (window._csTab === 'script') return;
  const pageContent = document.getElementById('pageContent');
  if (!pageContent || document.getElementById('contentSuggestionsBar')) return;

  const allSugs = (typeof MOCK !== 'undefined' && Array.isArray(MOCK.content_suggestions_generated))
    ? MOCK.content_suggestions_generated : [];

  const fromDailySugs   = allSugs.filter(s => s._fromDailySummary && s.status !== 'ignored');
  const fromBackendSugs = allSugs.filter(s => s._fromBackend       && s.status !== 'ignored');
  const hasAISugs       = fromDailySugs.length > 0 || fromBackendSugs.length > 0;
  const meta            = window._contentBackendMeta;
  const backendOnline   = meta !== undefined && meta !== null;

  const bar = document.createElement('div');
  bar.id = 'contentSuggestionsBar';
  bar.className = 'content-card';
  bar.style.cssText = 'margin-bottom:16px;border:2px solid var(--accent-indigo);background:linear-gradient(135deg,rgba(99,102,241,0.06),rgba(16,185,129,0.03));';

  if (hasAISugs) {
    const totalAI   = fromDailySugs.length + fromBackendSugs.length;
    const highCount = [...fromDailySugs, ...fromBackendSugs].filter(s => s.priority === 'high').length;
    const savedCount = allSugs.filter(s => s.status === 'saved').length;
    const scheduledCount = allSugs.filter(s => s.status === 'scheduled').length;

    const sourceBadge = backendOnline
      ? `<span style="background:#dcfce7;color:#16a34a;font-size:0.68rem;font-weight:700;padding:2px 7px;border-radius:10px;margin-left:6px;">🟢 Backend</span>`
      : `<span style="background:#fef9c3;color:#854d0e;font-size:0.68rem;font-weight:700;padding:2px 7px;border-radius:10px;margin-left:6px;">🟡 Demo</span>`;

    bar.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:40px;height:40px;border-radius:10px;background:var(--accent-indigo-bg);
            display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;">📊</div>
          <div>
            <div style="font-size:0.85rem;font-weight:800;color:var(--accent-indigo);display:flex;align-items:center;gap:4px;">
              ${totalAI} đề xuất AI${sourceBadge}
            </div>
            <div style="font-size:0.73rem;color:var(--text-muted);margin-top:2px;">
              ${highCount > 0 ? `<span style="color:#ef4444;font-weight:700;">${highCount} ưu tiên cao</span> · ` : ''}
              ${savedCount > 0 ? `<span style="color:#f59e0b;font-weight:700;">${savedCount} đã lưu</span> · ` : ''}
              ${scheduledCount > 0 ? `<span style="color:#10b981;font-weight:700;">${scheduledCount} đã lên lịch</span> · ` : ''}
              ${backendOnline && meta
                ? `Backend: ${meta.neg_review_count || 0} reviews · ${meta.content_tasks_count || 0} tasks`
                : 'Phân tích từ chat signals, reviews & MOCK data'}
            </div>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button onclick="generateContentSuggestionsFromSummary(window._lastDailySummaryData)"
            class="btn-approve" style="font-size:0.75rem;padding:6px 12px;
              background:var(--accent-indigo);border-color:var(--accent-indigo);">
            🔄 Tạo lại từ báo cáo
          </button>
          ${backendOnline ? `<button onclick="loadContentSuggestionsFromBackend().then(()=>navigate('content-suggestions'))"
            class="btn-approve" style="font-size:0.75rem;padding:6px 12px;
              background:#10b981;border-color:#10b981;">
            ↓ Sync Backend
          </button>` : ''}
          <button onclick="MOCK.content_suggestions_generated=MOCK.content_suggestions_generated.filter(s=>!s._fromDailySummary&&!s._fromBackend);navigate('content-suggestions')"
            class="btn-modal-cancel" style="font-size:0.75rem;padding:6px 12px;">
            ✕ Xóa đề xuất AI
          </button>
        </div>
      </div>`;
  } else {
    // Chưa có — prompt hướng dẫn tạo
    const hasDailySummary = !!window._lastDailySummaryData;
    const backendBadge = backendOnline
      ? `<span style="background:#dcfce7;color:#16a34a;font-size:0.68rem;font-weight:700;padding:2px 6px;border-radius:8px;">● Backend online</span>`
      : `<span style="background:#fef9c3;color:#854d0e;font-size:0.68rem;font-weight:700;padding:2px 6px;border-radius:8px;">○ Offline — dùng MOCK</span>`;
    bar.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:40px;height:40px;border-radius:10px;background:rgba(99,102,241,0.1);
            display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;">🤖</div>
          <div>
            <div style="font-size:0.85rem;font-weight:700;color:var(--text-primary);display:flex;align-items:center;gap:6px;">
              Tạo đề xuất content từ dữ liệu thực ${backendBadge}
            </div>
            <div style="font-size:0.73rem;color:var(--text-muted);margin-top:2px;">
              ${hasDailySummary ? 'Đã có báo cáo hôm nay — nhấn để phân tích'
                : 'Tải Báo cáo từ Dashboard hoặc dùng dữ liệu Demo để bắt đầu'}
            </div>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${hasDailySummary ? `<button onclick="generateContentSuggestionsFromSummary(window._lastDailySummaryData)"
            class="btn-approve" style="font-size:0.75rem;padding:6px 14px;
              background:var(--accent-indigo);border-color:var(--accent-indigo);">
            📝 Tạo từ Báo cáo hôm nay
          </button>` : ''}
          <button onclick="generateContentSuggestionsFromSummary(null)"
            class="btn-approve" style="font-size:0.75rem;padding:6px 14px;">
            ⚡ Tạo từ dữ liệu Demo
          </button>
          <button onclick="navigate('dashboard')"
            class="btn-modal-cancel" style="font-size:0.75rem;padding:6px 12px;">
            📋 Tải Báo cáo
          </button>
        </div>
      </div>`;
  }

  pageContent.insertBefore(bar, pageContent.firstChild);
}

/* ── Inject: Daily Summary Card vào Dashboard ── */
function injectDailySummaryCard() {
  const pageContent = document.getElementById('pageContent');
  if (!pageContent || document.getElementById('dailySummaryCard')) return;

  const card = document.createElement('div');
  card.id = 'dailySummaryCard';
  card.className = 'content-card';
  card.style.cssText =
    'margin-top:20px;border:2px solid var(--accent-indigo);';
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;
      margin-bottom:14px;flex-wrap:wrap;gap:8px;">
      <div>
        <div class="content-card-title" style="margin:0;color:var(--accent-indigo);">
          📋 Tóm tắt AI Hàng ngày — Live từ Backend
        </div>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">
          Tổng hợp từ chat logs, reviews và coordination tasks trong ngày
        </div>
      </div>
      <button onclick="loadDailySummary()" class="btn-approve"
        style="font-size:0.76rem;padding:7px 14px;">
        📥 Tải tóm tắt
      </button>
    </div>
    <div id="dailySummaryContent">
      <div style="text-align:center;padding:16px;color:var(--text-muted);font-size:0.85rem;">
        Nhấn "Tải tóm tắt" để lấy dữ liệu thực từ backend
      </div>
    </div>
  `;
  pageContent.appendChild(card);
}

/* ── Inject: Review Form vào Reviews Page ── */
function injectReviewForm() {
  const pageContent = document.getElementById('pageContent');
  if (!pageContent || document.getElementById('reviewSubmitForm')) return;

  const form = document.createElement('div');
  form.id = 'reviewSubmitForm';
  form.className = 'content-card';
  form.style.cssText = 'margin-bottom:20px;border:2px solid var(--accent-amber);';
  form.innerHTML = `
    <div class="content-card-title" style="color:var(--accent-amber);">
      📝 Thêm Review Mới → AI Phân tích & Học hỏi
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px;">
      <div class="settings-field">
        <label class="settings-label">Sản phẩm</label>
        <select id="rev_product_id" class="settings-input">
          ${(typeof PRODUCT_CATALOG !== 'undefined' ? PRODUCT_CATALOG : []).map(p =>
            `<option value="${p.id}" ${p.id==='P011'?'selected':''}>${p.id} · ${p.name}</option>`
          ).join('')}
        </select>
      </div>
      <div class="settings-field">
        <label class="settings-label">Tên khách hàng</label>
        <input id="rev_customer_name" class="settings-input" placeholder="VD: Nguyễn Văn A">
      </div>
      <div class="settings-field">
        <label class="settings-label">Số sao</label>
        <select id="rev_rating" class="settings-input">
          <option value="5">⭐⭐⭐⭐⭐ 5 sao</option>
          <option value="4">⭐⭐⭐⭐ 4 sao</option>
          <option value="3">⭐⭐⭐ 3 sao</option>
          <option value="2" selected>⭐⭐ 2 sao</option>
          <option value="1">⭐ 1 sao</option>
        </select>
      </div>
    </div>
    <div class="settings-field" style="margin-bottom:12px;">
      <label class="settings-label">Nội dung đánh giá</label>
      <textarea id="rev_text" class="settings-input" rows="3"
        placeholder="Nhập nội dung đánh giá của khách hàng...">Sản phẩm giao nhanh nhưng hộp bị móp một chút. Chất lượng ổn.</textarea>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      <button id="btnSubmitReview" class="btn-approve">
        🤖 Gửi & AI học hỏi
      </button>
      <button id="btnLoadDBReviews" class="btn-modal-cancel">
        📥 Tải reviews từ Database
      </button>
    </div>
    <div style="margin-top:10px;padding:8px;background:var(--accent-amber-bg);
      border-radius:8px;font-size:0.75rem;color:var(--accent-amber);">
      💡 Review được lưu vào SQLite + AI trích xuất insight → lưu vào ChromaDB để chatbot học hỏi
    </div>
  `;

  pageContent.insertBefore(form, pageContent.firstChild);
}

/* ── Inject: Live Chat Widget vào Chat Page ── */
function injectLiveChatWidget() {
  const pageContent = document.getElementById('pageContent');
  if (!pageContent || document.getElementById('liveChatWidgetContainer')) return;

  const widget = document.createElement('div');
  widget.id = 'liveChatWidgetContainer';
  widget.innerHTML = buildLiveChatWidgetHTML();
  pageContent.appendChild(widget);

  // Attach events
  const sendBtn = document.getElementById('btnLiveChatSend');
  const input = document.getElementById('liveChatInput');
  const clearBtn = document.getElementById('btnClearLiveChat');

  sendBtn?.addEventListener('click', () => {
    const msg = input?.value?.trim();
    if (msg) sendLiveChatMessage(msg);
  });

  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const msg = input.value.trim();
      if (msg) sendLiveChatMessage(msg);
    }
  });

  clearBtn?.addEventListener('click', async () => {
    try {
      await apiCall('/chat/' + liveChatCustomerId, 'DELETE');
      const container = document.getElementById('liveChatMessages');
      if (container)
        container.innerHTML =
          '<div style="text-align:center;color:var(--text-muted);font-size:0.8rem;padding:20px 0;">💬 Lịch sử đã xóa. Bắt đầu cuộc hội thoại mới.</div>';
      // Reset session stats
      chatSessionStats.reset();
      const statsPanel = document.getElementById('chatStatsPanel');
      if (statsPanel) statsPanel.innerHTML = `
        <div style="margin-top:16px;border:1px solid var(--border-primary);border-radius:12px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#1e1b4b 0%,#312e81 100%);padding:10px 16px;display:flex;align-items:center;gap:8px;">
            <span style="font-size:1rem;">📊</span>
            <span style="font-size:0.82rem;font-weight:700;color:#e0e7ff;">Báo Cáo Phiên Chat – Realtime Analytics</span>
          </div>
          <div style="padding:20px;background:var(--bg-secondary);text-align:center;color:var(--text-muted);font-size:0.82rem;">
            💬 Phiên mới — Gửi tin nhắn để bắt đầu theo dõi...
          </div>
        </div>`;
      showToast('Đã xóa lịch sử chat với AI', 'info');
    } catch (err) {
      showToast('Lỗi xóa lịch sử: ' + err.message, 'danger');
    }
  });

  // Quick message buttons
  document.querySelectorAll('.live-chat-quick').forEach((btn) => {
    btn.addEventListener('click', () => sendLiveChatMessage(btn.dataset.msg));
  });

  // ── Chỉnh sửa ID khách hàng ──
  _attachLiveChatIdEditorEvents();

  // ── Nút làm mới hồ sơ khách hàng ──
  const refreshProfileBtn = document.getElementById('btnRefreshProfile');
  if (refreshProfileBtn) {
    refreshProfileBtn.addEventListener('click', () => loadCustomerProfile(liveChatCustomerId));
  }

  // Load chatbot features & quality data from backend
  loadChatbotFeatures();

  // Load customer profile lần đầu
  loadCustomerProfile(liveChatCustomerId);

  // Replay lịch sử chat từ backend (sau Cmd+R ID vẫn giữ nguyên → tải lại được)
  _reloadChatHistoryFromBackend(liveChatCustomerId);
}

/**
 * Gắn toàn bộ event logic cho khu vực chỉnh sửa ID khách hàng.
 * Tách ra để dễ gọi lại nếu widget được rebuild.
 */
function _attachLiveChatIdEditorEvents() {
  const display   = document.getElementById('liveChatIdDisplay');
  const editArea  = document.getElementById('liveChatIdEdit');
  const badge     = document.getElementById('liveChatIdBadge');
  const editBtn   = document.getElementById('btnEditLiveChatId');
  const input     = document.getElementById('liveChatIdInput');
  const confirmBtn= document.getElementById('btnConfirmLiveChatId');
  const cancelBtn = document.getElementById('btnCancelLiveChatId');
  if (!editBtn || !input || !confirmBtn || !cancelBtn) return;

  // Mở chế độ chỉnh sửa
  function openEdit() {
    input.value = liveChatCustomerId;
    display.style.display  = 'none';
    editArea.style.display = 'flex';
    input.focus();
    input.select();
  }

  // Lưu ID mới và cập nhật phiên làm việc
  function confirmEdit() {
    const newId = input.value.trim().replace(/\s+/g, '_');  // dùng _ thay khoảng trắng
    if (!newId) {
      input.style.borderColor = '#ef4444';
      input.placeholder = 'ID không được để trống!';
      setTimeout(() => { input.style.borderColor = ''; }, 1200);
      return;
    }

    const changed = newId !== liveChatCustomerId;
    liveChatCustomerId = newId;
    try { localStorage.setItem('agicom_live_chat_id', liveChatCustomerId); } catch (_) {}

    // Cập nhật badge
    if (badge) badge.textContent = '🪪 ' + liveChatCustomerId;

    // Đóng chế độ chỉnh sửa
    editArea.style.display = 'none';
    display.style.display  = 'flex';

    if (changed) {
      // Xóa lịch sử chat cũ trên UI
      const msgContainer = document.getElementById('liveChatMessages');
      if (msgContainer) {
        msgContainer.innerHTML =
          '<div style="text-align:center;color:var(--text-muted);font-size:0.82rem;padding:20px 0;">' +
          '🔄 Đã chuyển sang ID mới. Bắt đầu cuộc hội thoại mới.</div>';
      }
      // Reset session stats
      chatSessionStats.reset();
      const statsPanel = document.getElementById('chatStatsPanel');
      if (statsPanel) {
        statsPanel.innerHTML =
          '<div style="margin-top:16px;border:1px solid var(--border-primary);border-radius:12px;overflow:hidden;">' +
          '<div style="background:linear-gradient(135deg,#1e1b4b 0%,#312e81 100%);padding:10px 16px;display:flex;align-items:center;gap:8px;">' +
          '<span style="font-size:1rem;">📊</span>' +
          '<span style="font-size:0.82rem;font-weight:700;color:#e0e7ff;">Báo Cáo Phiên Chat – Realtime Analytics</span>' +
          '</div>' +
          '<div style="padding:20px;background:var(--bg-secondary);text-align:center;color:var(--text-muted);font-size:0.82rem;">' +
          '💬 Phiên mới — Gửi tin nhắn để bắt đầu theo dõi...</div></div>';
      }
      showToast(`🪪 Đã đổi ID khách hàng sang: <strong>${liveChatCustomerId}</strong>`, 'success');
      // Tải lại hồ sơ khách hàng mới
      loadCustomerProfile(liveChatCustomerId);
    } else {
      closeEdit();
    }
  }

  // Hủy chỉnh sửa
  function closeEdit() {
    input.value = liveChatCustomerId;
    editArea.style.display = 'none';
    display.style.display  = 'flex';
  }

  editBtn.addEventListener('click', openEdit);
  badge?.addEventListener('click', openEdit);          // click vào badge cũng mở edit
  confirmBtn.addEventListener('click', confirmEdit);
  cancelBtn.addEventListener('click', closeEdit);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); confirmEdit(); }
    if (e.key === 'Escape') { e.preventDefault(); closeEdit(); }
  });
}

/* ── Load Chatbot Features & Quality từ backend ── */
async function loadChatbotFeatures() {
  const el = document.getElementById('chatbotFeaturesContent');
  if (!el) return;

  // Backend offline — hiển thị dữ liệu demo tĩnh ngay lập tức, không thử kết nối
  if (!_backendConnected) {
    el.innerHTML = `
      <div style="margin-bottom:8px;display:flex;align-items:center;gap:6px;">
        <span style="font-size:0.68rem;padding:2px 8px;border-radius:6px;
          background:rgba(245,158,11,0.15);color:#f59e0b;font-weight:700;
          border:1px solid rgba(245,158,11,0.3);">🟡 Demo Mode — Backend offline</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
        <div style="padding:10px 12px;background:var(--bg-secondary);border-radius:8px;
          border:1px solid var(--border-primary);border-left:3px solid #10b981;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
            <span style="font-size:0.8rem;font-weight:700;color:var(--text-primary);">Phân tích cảm xúc</span>
            <span style="font-size:0.65rem;padding:2px 7px;border-radius:8px;font-weight:600;
              background:#10b98122;color:#10b981;">Ổn định</span>
          </div>
          <div style="font-size:0.73rem;color:var(--text-muted);line-height:1.45;">
            Theo dõi trạng thái cảm xúc theo từng cụm hội thoại để cảnh báo sớm nhóm khách tiêu cực.
          </div>
        </div>
        <div style="padding:10px 12px;background:var(--bg-secondary);border-radius:8px;
          border:1px solid var(--border-primary);border-left:3px solid #f59e0b;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
            <span style="font-size:0.8rem;font-weight:700;color:var(--text-primary);">Báo cáo thắc mắc</span>
            <span style="font-size:0.65rem;padding:2px 7px;border-radius:8px;font-weight:600;
              background:#f59e0b22;color:#f59e0b;">Đang cập nhật</span>
          </div>
          <div style="font-size:0.73rem;color:var(--text-muted);line-height:1.45;">
            Tổng hợp câu hỏi lặp lại trong ngày, ưu tiên theo tần suất và mức độ ảnh hưởng.
          </div>
        </div>
      </div>
      <div style="border-top:1px solid var(--border-primary);padding-top:10px;">
        <div style="font-size:0.72rem;font-weight:700;color:var(--text-secondary);margin-bottom:8px;">
          🔍 Chất Lượng Hệ Thống AI
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div style="padding:10px 12px;background:var(--accent-indigo-bg);border-radius:8px;">
            <div style="font-size:0.77rem;font-weight:700;color:var(--accent-indigo);margin-bottom:3px;">Tổng hợp từ chat bot</div>
            <div style="font-size:0.82rem;font-weight:800;color:var(--text-primary);margin-bottom:3px;">128 tín hiệu/7 ngày</div>
            <div style="font-size:0.7rem;color:var(--text-muted);line-height:1.4;">
              Hệ thống gom nhóm phản hồi theo chủ đề sản phẩm, kênh bán và thời điểm phát sinh.
            </div>
          </div>
          <div style="padding:10px 12px;background:var(--accent-indigo-bg);border-radius:8px;">
            <div style="font-size:0.77rem;font-weight:700;color:var(--accent-indigo);margin-bottom:3px;">Quản trị khủng hoảng</div>
            <div style="font-size:0.82rem;font-weight:800;color:var(--text-primary);margin-bottom:3px;">1 cảnh báo cần xử lý</div>
            <div style="font-size:0.7rem;color:var(--text-muted);line-height:1.4;">
              Phát hiện cụm phản hồi tiêu cực tăng nhanh ở nhóm giao vận, đề xuất xử lý ưu tiên trong 24 giờ.
            </div>
          </div>
        </div>
      </div>`;
    return;
  }

  try {
    const [featData, qualData] = await Promise.all([
      apiCall('/api/chatbot/features'),
      apiCall('/api/quality/overview'),
    ]);

    const features = (featData && featData.features) || [];
    const quality  = (qualData && qualData.items)    || [];

    const statusColor = (s) => {
      if (!s) return 'var(--text-muted)';
      if (s.toLowerCase().includes('ổn') || s.toLowerCase().includes('tốt')) return '#10b981';
      if (s.toLowerCase().includes('cập nhật') || s.toLowerCase().includes('đang')) return '#f59e0b';
      return '#ef4444';
    };

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
        ${features.map(f => `
          <div style="padding:10px 12px;background:var(--bg-secondary);border-radius:8px;
            border:1px solid var(--border-primary);border-left:3px solid ${statusColor(f.status)};">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
              <span style="font-size:0.8rem;font-weight:700;color:var(--text-primary);">${f.title}</span>
              <span style="font-size:0.65rem;padding:2px 7px;border-radius:8px;font-weight:600;
                background:${statusColor(f.status)}22;color:${statusColor(f.status)};">${f.status}</span>
            </div>
            <div style="font-size:0.73rem;color:var(--text-muted);line-height:1.45;">${f.detail || ''}</div>
          </div>
        `).join('')}
      </div>

      ${quality.length ? `
      <div style="border-top:1px solid var(--border-primary);padding-top:10px;">
        <div style="font-size:0.72rem;font-weight:700;color:var(--text-secondary);margin-bottom:8px;">
          🔍 Chất Lượng Hệ Thống AI
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          ${quality.map(q => `
            <div style="padding:10px 12px;background:var(--accent-indigo-bg);border-radius:8px;
              border:1px solid var(--accent-indigo)30;">
              <div style="font-size:0.77rem;font-weight:700;color:var(--accent-indigo);margin-bottom:3px;">${q.title}</div>
              <div style="font-size:0.82rem;font-weight:800;color:var(--text-primary);margin-bottom:3px;">${q.value}</div>
              <div style="font-size:0.7rem;color:var(--text-muted);line-height:1.4;">${q.note || ''}</div>
            </div>
          `).join('')}
        </div>
      </div>` : ''}
    `;
  } catch (err) {
    if (el) el.innerHTML = `<div style="font-size:0.8rem;color:var(--text-muted);padding:8px;">
      Không thể tải từ backend. <small>${err.message}</small>
    </div>`;
  }
}

/* ── Inject: Reset Button vào Settings Page ── */
function injectResetButton() {
  const pageContent = document.getElementById('pageContent');
  if (!pageContent || document.getElementById('resetSystemCard')) return;

  const card = document.createElement('div');
  card.id = 'resetSystemCard';
  card.className = 'content-card';
  card.style.cssText = 'margin-top:16px;border:2px solid var(--accent-rose);';
  card.innerHTML = `
    <div class="content-card-title" style="color:var(--accent-rose);">
      ⚠️ Quản trị Hệ thống — Nguy hiểm
    </div>
    <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:14px;">
      Các thao tác dưới đây sẽ ảnh hưởng vĩnh viễn đến dữ liệu hệ thống.
    </p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      <button onclick="handleResetAll()"
        style="padding:8px 18px;border-radius:8px;border:2px solid var(--accent-rose);
          background:var(--accent-rose-bg);color:var(--accent-rose);
          font-weight:700;cursor:pointer;font-size:0.85rem;">
        🗑 Reset toàn bộ dữ liệu AI
      </button>
      <button onclick="handleSeedCrisisDemo()"
        style="padding:8px 18px;border-radius:8px;border:2px solid #f59e0b;
          background:rgba(245,158,11,0.08);color:#f59e0b;
          font-weight:700;cursor:pointer;font-size:0.85rem;">
        🛡 Seed dữ liệu Crisis Demo
      </button>
      <button onclick="loadDailySummary().catch(()=>{});navigate('dashboard')"
        style="padding:8px 18px;border-radius:8px;border:1px solid var(--border-primary);
          background:var(--bg-glass);color:var(--text-secondary);
          font-weight:600;cursor:pointer;font-size:0.85rem;">
        📋 Xem tóm tắt hôm nay
      </button>
    </div>
    <div style="margin-top:12px;font-size:0.75rem;color:var(--text-muted);">
      Backend URL hiện tại: <code style="background:var(--bg-secondary);padding:2px 6px;
        border-radius:4px;">${API_BASE}</code>
    </div>
  `;
  pageContent.appendChild(card);
}

/* ──────────────────────────────────────────────────────────────────────
   11. EVENT DELEGATION — Override handlePageClick + Modal Submit
   ────────────────────────────────────────────────────────────────────── */

// Intercept review form buttons
document.addEventListener('click', function (e) {
  // Submit review
  if (e.target.id === 'btnSubmitReview') {
    const product_id = document.getElementById('rev_product_id')?.value?.trim() || 'UNKNOWN';
    const rating = parseInt(document.getElementById('rev_rating')?.value || '3', 10);
    const review_text = document.getElementById('rev_text')?.value?.trim() || '';
    const customer_name = document.getElementById('rev_customer_name')?.value?.trim() || 'Ẩn danh';

    if (!review_text) {
      showToast('⚠️ Vui lòng nhập nội dung đánh giá!', 'warning');
      return;
    }
    submitReviewToAPI({ product_id, rating, review_text, customer_name });
  }

  // Load reviews from DB
  if (e.target.id === 'btnLoadDBReviews') {
    loadReviewsFromAPI();
  }
});

// Override modal submit to also send to backend
const _modalSubmitBtn = document.getElementById('modalSubmitBtn');
if (_modalSubmitBtn) {
  _modalSubmitBtn.addEventListener('click', function () {
    const reason = document.getElementById('feedbackText')?.value || '';
    if (typeof pendingFeedbackId !== 'undefined' && pendingFeedbackId) {
      sendApprovalToBackend(pendingFeedbackId, 'declined', reason);
    }
  });
}

// Override approval button click to send to backend
const _origHandlePageClick = typeof handlePageClick === 'function' ? handlePageClick : null;
if (_origHandlePageClick) {
  handlePageClick = function (e) {
    const target = e.target.closest('[data-action]');
    if (target?.dataset?.action === 'approve' && target?.dataset?.id) {
      sendApprovalToBackend(target.dataset.id, 'approved', '');
    }
    _origHandlePageClick(e);
  };
}

/* ──────────────────────────────────────────────────────────────────────
   10b. DEMO KHÁCH HÀNG — Inject review form + live chat widget
   ────────────────────────────────────────────────────────────────────── */

/**
 * Xây dựng nội dung trang "Demo Khách Hàng":
 *  1. Xóa placeholder skeleton
 *  2. Inject form "Thêm Review Mới → AI Phân tích & Học hỏi"
 *  3. Inject widget "Live Chat với AI Agent"
 *  4. Tải sẵn review list từ DB
 */
/**
 * Kịch bản demo: điền sẵn form review + chat input để demo nhanh.
 * Gọi từ nút trong demo scenario card.
 */
function _applyDemoScenario(scenario) {
  const SCENARIOS = {
    // product_id phải khớp với data/catalog/product_catalog.json
    anker: {
      product_id: 'P009',
      customer_name: 'Hoang_Manh_Demo',
      rating: '1',
      review_text: 'Bộ cọ 13 món mua ở đây về dùng được 1 tuần là lông cọ rụng ào ào, cọ phấn má còn bị gãy cán. Tôi rất thất vọng, yêu cầu đổi trả ngay!',
      chat_msg: 'Shop ơi bộ cọ 13 món tôi mua ở đây dùng 1 tuần là lông rụng hết rồi! Cọ còn bị gãy cán nữa. Tôi muốn đổi trả, shop xử lý thế nào?',
      label: 'Cọ 13 Món - Lông rụng, cán gãy'
    },
    shipping: {
      product_id: 'P011',
      customer_name: 'Khach_VIP_Demo',
      rating: '2',
      review_text: 'Kem rửa mặt Hada Labo giao đến bị móp vỏ hộp, nắp không đóng kín. May mà tuýp kem vẫn còn dùng được. Shop cần đóng gói cẩn thận hơn, tôi rất thất vọng.',
      chat_msg: 'Shop ơi kem rửa mặt Hada Labo tôi vừa nhận được mà hộp bị móp, nắp bị hở rồi! Tôi rất bức xúc, shop xử lý thế nào đây?',
      label: 'Vận chuyển hư hỏng - Hada Labo'
    }
  };

  const s = SCENARIOS[scenario];
  if (!s) return;

  // Điền form review
  const fields = {
    'rev_product_id': s.product_id,
    'rev_customer_name': s.customer_name,
    'rev_rating': s.rating,
    'rev_text': s.review_text
  };
  Object.entries(fields).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  });

  // Điền chat input
  const chatInput = document.getElementById('liveChatInput');
  if (chatInput) chatInput.value = s.chat_msg;

  // Cập nhật status guide
  const statusEl = document.getElementById('demoScenarioStatus');
  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.innerHTML = `
      ✅ Đã điền kịch bản <strong>"${s.label}"</strong> — Thực hiện theo thứ tự:
      <span style="color:#ef4444;font-weight:700;">①</span> Nhấn "🤖 Gửi & AI học hỏi" ở phần review →
      <span style="color:#f59e0b;font-weight:700;">②</span> Nhấn "Gửi ↗" ở khung chat →
      <span style="color:#6366f1;font-weight:700;">③</span> Nhấn "🛡 Xem Crisis Center" trong popup hoặc từ sidebar`;
  }

  // Scroll đến form review để tiện điền
  setTimeout(() => document.getElementById('reviewSubmitForm')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
}

function _injectDemoCustomerPage() {
  const pageContent = document.getElementById('pageContent');
  if (!pageContent) return;

  // Xóa placeholder (nếu còn)
  const ph = document.getElementById('demoCustomerPlaceholder');
  if (ph) ph.remove();

  // ── Section 1: Review Form ──
  if (!document.getElementById('reviewSubmitForm')) {
    const reviewSection = document.createElement('div');
    reviewSection.innerHTML = `
      <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;
        letter-spacing:0.8px;color:var(--text-muted);margin-bottom:8px;">
        📋 Gửi đánh giá sản phẩm
      </div>`;

    const form = document.createElement('div');
    form.id = 'reviewSubmitForm';
    form.className = 'content-card';
    form.style.cssText = 'margin-bottom:8px;border:2px solid var(--accent-amber);';
    form.innerHTML = `
      <div class="content-card-title" style="color:var(--accent-amber);">
        📝 Thêm Review Mới → AI Phân tích & Học hỏi
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px;">
        <div class="settings-field">
          <label class="settings-label">ID Sản phẩm</label>
          <input id="rev_product_id" class="settings-input" value="P011"
            placeholder="VD: P009, P011, GF-LGLOSS-M01">
        </div>
        <div class="settings-field">
          <label class="settings-label">Tên khách hàng</label>
          <input id="rev_customer_name" class="settings-input" placeholder="VD: Nguyễn Văn A">
        </div>
        <div class="settings-field">
          <label class="settings-label">Số sao</label>
          <select id="rev_rating" class="settings-input">
            <option value="5">⭐⭐⭐⭐⭐ 5 sao</option>
            <option value="4">⭐⭐⭐⭐ 4 sao</option>
            <option value="3">⭐⭐⭐ 3 sao</option>
            <option value="2" selected>⭐⭐ 2 sao</option>
            <option value="1">⭐ 1 sao</option>
          </select>
        </div>
      </div>
      <div class="settings-field" style="margin-bottom:12px;">
        <label class="settings-label">Nội dung đánh giá</label>
        <textarea id="rev_text" class="settings-input" rows="3"
          placeholder="Nhập nội dung đánh giá của khách hàng...">Sản phẩm giao nhanh nhưng hộp bị móp một chút. Chất lượng ổn.</textarea>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button id="btnSubmitReview" class="btn-approve">
          🤖 Gửi & AI học hỏi
        </button>
        <button id="btnLoadDBReviews" class="btn-modal-cancel">
          📥 Tải reviews từ Database
        </button>
      </div>
      <div style="margin-top:10px;padding:8px;background:var(--accent-amber-bg);
        border-radius:8px;font-size:0.75rem;color:var(--accent-amber);">
        💡 Review được lưu vào SQLite + AI trích xuất insight → lưu vào ChromaDB để chatbot học hỏi
      </div>`;

    reviewSection.appendChild(form);
    pageContent.appendChild(reviewSection);

    // Tải ngay danh sách review từ DB
    loadReviewsFromAPI();
  }

  // ── Section 2: Live Chat Widget ──
  if (!document.getElementById('liveChatWidgetContainer')) {
    const chatSection = document.createElement('div');
    chatSection.innerHTML = `
      <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;
        letter-spacing:0.8px;color:var(--text-muted);margin:20px 0 8px;">
        💬 Chat trực tiếp với AI Agent
      </div>`;
    pageContent.appendChild(chatSection);

    // Dùng lại hàm inject sẵn có (tự xử lý DOM, events)
    injectLiveChatWidget();
  }
}

/* ──────────────────────────────────────────────────────────────────────
   10b. CUSTOMER PROFILE — Tải và hiển thị hồ sơ khách hàng
   ────────────────────────────────────────────────────────────────────── */

/** Màu + label theo ngưỡng xác suất rời bỏ */
function _churnColor(prob) {
  if (prob >= 0.6) return { color: 'var(--accent-rose)',   bg: 'var(--accent-rose-bg)',   label: 'Nguy cơ cao' };
  if (prob >= 0.3) return { color: 'var(--accent-amber)',  bg: 'var(--accent-amber-bg)',  label: 'Trung bình' };
  return              { color: 'var(--accent-emerald)', bg: 'var(--accent-emerald-bg)', label: 'Thấp' };
}

/** Render thanh màu */
function _profileBar(value, color) {
  const pct = Math.round(value * 100);
  return `<div style="height:6px;background:var(--bg-glass);border-radius:3px;overflow:hidden;margin-top:4px;">
    <div style="width:${pct}%;height:100%;background:${color};border-radius:3px;transition:width 0.4s;"></div>
  </div>`;
}

/** Tải hồ sơ khách từ backend, render vào #customerProfileContent */
async function loadCustomerProfile(customerId) {
  const panel = document.getElementById('customerProfileContent');
  if (!panel) return;

  if (!_backendConnected) {
    panel.innerHTML = `<div style="text-align:center;color:var(--text-muted);font-size:0.8rem;padding:8px 0;">
      📴 Demo Mode — Backend offline<br>Kết nối backend để tải hồ sơ thật
    </div>`;
    return;
  }

  panel.innerHTML = `<div style="text-align:center;color:var(--text-muted);font-size:0.8rem;padding:8px 0;">⏳ Đang tải...</div>`;

  try {
    const data = await apiCall(`/api/customer-profile/${encodeURIComponent(customerId)}`);
    if (!data || data.status !== 'success') throw new Error('No data');

    const churn = data.churn_probability ?? 0.1;
    const emotion = data.emotion_index ?? 0.5;
    const churnStyle = _churnColor(churn);
    const emotionColor = emotion <= 0.3 ? 'var(--accent-rose)' : emotion <= 0.6 ? 'var(--accent-amber)' : 'var(--accent-emerald)';
    const emotionLabel = emotion <= 0.2 ? 'Rất tiêu cực' : emotion <= 0.4 ? 'Tiêu cực' : emotion <= 0.6 ? 'Bình thường' : emotion <= 0.8 ? 'Tích cực' : 'Rất tích cực';

    const segmentBadge = {
      vip:      '<span style="background:#7c3aed;color:white;font-size:0.65rem;padding:2px 8px;border-radius:10px;font-weight:800;">👑 VIP</span>',
      regular:  '<span style="background:#2563eb;color:white;font-size:0.65rem;padding:2px 8px;border-radius:10px;font-weight:700;">⭐ Quen</span>',
      at_risk:  '<span style="background:#dc2626;color:white;font-size:0.65rem;padding:2px 8px;border-radius:10px;font-weight:700;">⚠️ Rủi ro</span>',
      new:      '<span style="background:#059669;color:white;font-size:0.65rem;padding:2px 8px;border-radius:10px;font-weight:700;">🆕 Mới</span>',
    }[data.customer_segment] || '<span style="background:var(--bg-glass);color:var(--text-muted);font-size:0.65rem;padding:2px 8px;border-radius:10px;">Không rõ</span>';

    const purchases = (data.purchase_history || []).slice(0, 4);
    const purchaseRows = purchases.length
      ? purchases.map(p => `
          <div style="display:flex;justify-content:space-between;align-items:center;
            padding:5px 0;border-bottom:1px solid var(--border-primary);font-size:0.76rem;">
            <div>
              <div style="font-weight:600;color:var(--text-primary);">${p.item || '?'}</div>
              <div style="color:var(--text-muted);font-size:0.68rem;">${p.date || ''}${p.status ? ' · ' + p.status : ''}</div>
            </div>
            <div style="font-weight:700;color:var(--accent-indigo);white-space:nowrap;margin-left:8px;">
              ${p.value ? Number(p.value).toLocaleString('vi-VN') + 'đ' : '—'}
            </div>
          </div>`).join('')
      : `<div style="color:var(--text-muted);font-size:0.78rem;padding:4px 0;">Chưa có lịch sử mua hàng</div>`;

    panel.innerHTML = `
      <!-- Header: tên + segment -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div style="font-weight:700;font-size:0.88rem;color:var(--text-primary);">${customerId}</div>
        ${segmentBadge}
      </div>

      <!-- Metrics grid -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
        <!-- Xác suất rời bỏ -->
        <div style="background:${churnStyle.bg};border-radius:8px;padding:10px;">
          <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:2px;">Xác suất rời bỏ</div>
          <div style="font-size:1.15rem;font-weight:800;color:${churnStyle.color};">${Math.round(churn * 100)}%</div>
          ${_profileBar(churn, churnStyle.color)}
          <div style="font-size:0.65rem;color:${churnStyle.color};margin-top:3px;">${churnStyle.label}</div>
        </div>
        <!-- Chỉ số cảm xúc -->
        <div style="background:var(--bg-glass);border-radius:8px;padding:10px;">
          <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:2px;">Chỉ số cảm xúc</div>
          <div style="font-size:1.15rem;font-weight:800;color:${emotionColor};">${Math.round(emotion * 100)}/100</div>
          ${_profileBar(emotion, emotionColor)}
          <div style="font-size:0.65rem;color:${emotionColor};margin-top:3px;">${emotionLabel}</div>
        </div>
      </div>

      <!-- Tổng đơn + chi tiêu -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
        <div style="background:var(--bg-glass);border-radius:8px;padding:8px;text-align:center;">
          <div style="font-size:1rem;font-weight:800;color:var(--accent-indigo);">${data.total_orders ?? 0}</div>
          <div style="font-size:0.68rem;color:var(--text-muted);">Tổng đơn hàng</div>
        </div>
        <div style="background:var(--bg-glass);border-radius:8px;padding:8px;text-align:center;">
          <div style="font-size:0.9rem;font-weight:800;color:var(--accent-amber);">${data.total_spent ? Number(data.total_spent).toLocaleString('vi-VN') : 0}đ</div>
          <div style="font-size:0.68rem;color:var(--text-muted);">Tổng chi tiêu</div>
        </div>
      </div>

      ${data.notes ? `<div style="font-size:0.75rem;padding:8px;background:var(--accent-indigo-bg);border-radius:6px;
        color:var(--accent-indigo);margin-bottom:12px;line-height:1.5;">
        🧠 ${data.notes}
      </div>` : ''}

      <!-- Lịch sử mua hàng -->
      <div style="font-size:0.75rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;
        letter-spacing:0.4px;margin-bottom:6px;">Lịch sử mua hàng</div>
      ${purchaseRows}
      ${data.last_purchase_date ? `<div style="font-size:0.68rem;color:var(--text-muted);margin-top:6px;">
        Lần mua cuối: ${data.last_purchase_date}
      </div>` : ''}
    `;

    // Lưu vào biến global để các hàm khác dùng (vd: sendLiveChatMessage)
    window._currentCustomerProfile = data;

  } catch (err) {
    panel.innerHTML = `<div style="text-align:center;color:var(--text-muted);font-size:0.8rem;padding:8px 0;">
      ⚠️ Không tải được hồ sơ. Hồ sơ mới sẽ được tạo khi gửi tin nhắn đầu tiên.
    </div>`;
    window._currentCustomerProfile = null;
  }
}

/* ──────────────────────────────────────────────────────────────────────
   11a. SYNC LIVE CHAT → HỘP THƯ (Tin nhắn cần duyệt)
   ────────────────────────────────────────────────────────────────────── */

/**
 * Sau mỗi tin nhắn trong Live Chat widget, đưa cặp (câu hỏi khách + nháp AI)
 * vào MOCK.conversations và MOCK.chat_messages để hiển thị trong Hộp Thư.
 *
 * - is_safe === false  → status 'escalate'  (chờ duyệt khẩn)
 * - is_safe === true   → status 'pending'   (đã tự trả lời, lưu làm log)
 */
function _syncLiveChatToInbox(customerMsg, aiReply, evalData) {
  if (typeof MOCK === 'undefined') return;

  const isEscalated = evalData.is_safe === false;
  const conf = evalData.confidence_score !== undefined
    ? Math.round(evalData.confidence_score * 100)
    : null;
  const sentiment = evalData.sentiment_analysis || '';

  const now = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

  // Tính sentiment score cho thanh màu trong danh sách (0-100)
  const sentimentScore = (() => {
    const s = sentiment.toLowerCase();
    if (s.includes('tích cực') || s.includes('positive') || s.includes('hài lòng')) return 80;
    if (s.includes('tiêu cực') || s.includes('negative') || s.includes('bức xúc') || s.includes('tức giận')) return 20;
    return 55;
  })();

  const displayName = (typeof liveChatCustomerId !== 'undefined' && liveChatCustomerId)
    ? liveChatCustomerId
    : 'Khách Live Chat';
  const avatarChar = displayName.charAt(0).toUpperCase();

  // ── Tìm conversation hiện có của cùng customer (tránh tạo box trùng) ──
  // Ưu tiên: khớp tên+platform (live chat đang hoạt động), sau đó khớp id (conv đã load từ backend)
  let existingConv = MOCK.conversations.find(c => c.name === displayName && c.platform === 'Live Chat')
                  || MOCK.conversations.find(c => c.id === displayName);

  // Lấy hồ sơ thực từ backend (đã được load bởi loadCustomerProfile)
  const _profile = window._currentCustomerProfile;
  const _churnPct = _profile ? Math.round((_profile.churn_probability ?? 0.1) * 100) + '%' : '—';
  const _riskLevel = _profile
    ? (_profile.churn_probability >= 0.6 ? 'high' : _profile.churn_probability >= 0.3 ? 'medium' : 'low')
    : (isEscalated ? 'high' : 'low');
  const _purchases = _profile?.purchase_history || [];

  if (existingConv) {
    // Cập nhật conversation đã có thay vì tạo mới
    existingConv.time    = now;
    existingConv.unread  = (existingConv.unread || 0) + 1;
    existingConv.preview = customerMsg.length > 55 ? customerMsg.substring(0, 55) + '...' : customerMsg;
    existingConv.status  = isEscalated ? 'escalate' : existingConv.status;
    existingConv.sentiment = sentimentScore;
    existingConv.angry   = sentimentScore < 30;
    existingConv.customer.note = `Live Chat · ID: ${displayName} · Confidence: ${conf !== null ? conf + '%' : '—'} · Cảm xúc: ${sentiment || 'bình thường'}`;
    // Đồng bộ dữ liệu hồ sơ thực
    existingConv.customer.churn     = _churnPct;
    existingConv.customer.risk      = _riskLevel;
    existingConv.customer.purchases = _purchases;
    // Đưa lên đầu danh sách
    MOCK.conversations = [existingConv, ...MOCK.conversations.filter(c => c !== existingConv)];
  } else {
    // Tạo conversation mới lần đầu
    const newId = 'live_' + displayName.replace(/\W/g, '_');
    existingConv = {
      id: newId,
      name: displayName,
      avatar: avatarChar,
      time: now,
      status: isEscalated ? 'escalate' : 'pending',
      unread: 1,
      preview: customerMsg.length > 55 ? customerMsg.substring(0, 55) + '...' : customerMsg,
      category: isEscalated ? 'Cần duyệt' : 'Live Chat',
      sentiment: sentimentScore,
      wait_min: isEscalated ? 1 : 0,
      priority: isEscalated ? 0 : 2,
      ltv: 0, orders: 0,
      platform: 'Live Chat',
      angry: sentimentScore < 30,
      customer: {
        note: `Live Chat · ID: ${displayName} · Confidence: ${conf !== null ? conf + '%' : '—'} · Cảm xúc: ${sentiment || 'bình thường'}`,
        risk: _riskLevel,
        churn: _churnPct,
        purchases: _purchases
      }
    };
    MOCK.conversations.unshift(existingConv);
    MOCK.chat_messages[existingConv.id] = [];
  }

  const convId = existingConv.id;

  // ── Append tin nhắn vào lịch sử hội thoại ──
  if (!MOCK.chat_messages[convId]) MOCK.chat_messages[convId] = [];
  MOCK.chat_messages[convId].push({ from: 'customer', time: now, text: customerMsg });

  if (isEscalated) {
    // Xoá nháp cũ (nếu có) trước khi thêm nháp mới
    MOCK.chat_messages[convId] = MOCK.chat_messages[convId].filter(
      m => m.from !== 'ai_thinking' && m.from !== 'ai_draft'
    );
    MOCK.chat_messages[convId].push(
      { from: 'ai_thinking', text: 'AI phân tích ngữ cảnh và tìm kiếm trong knowledge base...', context: [
          `Confidence: ${conf !== null ? conf + '%' : '—'}`,
          `Cảm xúc: ${sentiment || 'bình thường'}`,
          'is_safe: ❌ Cần duyệt thủ công'
        ]
      },
      { from: 'ai_draft', text: aiReply, confidence: conf }
    );
    // Không hiện toast khi replay lịch sử (tránh spam khi Cmd+R)
    if (!evalData._isHistory) {
      showToast(`⚠️ Tin nhắn Live Chat cần duyệt — đã chuyển vào Hộp Thư!`, 'warning');
    }
  } else {
    MOCK.chat_messages[convId].push({ from: 'ai_sent', time: now, text: aiReply });
  }

  // ── Cập nhật badge số tin nhắn trong sidebar ──
  const pendingCount = MOCK.conversations.filter(c => c.status === 'escalate' || c.status === 'pending').length;
  const chatBadge = document.querySelector('.nav-child-item[data-page="chat"] .nav-item-badge');
  if (chatBadge) chatBadge.textContent = pendingCount;

  // ── Nếu đang ở trang chat → re-render để inbox cập nhật ngay ──
  if (typeof currentPage !== 'undefined' && currentPage === 'chat' && typeof navigate === 'function') {
    setTimeout(() => navigate('chat'), 300);
  }
}

/**
 * Tải lịch sử chat từ backend và replay vào UI (chatbox + inbox).
 * Gọi một lần khi injectLiveChatWidget() khởi tạo để phục hồi sau Cmd+R.
 */
async function _reloadChatHistoryFromBackend(customerId) {
  if (!_backendConnected) return;
  try {
    const data = await apiCall(`/api/chat-messages/${encodeURIComponent(customerId)}`);
    if (!data || data.status !== 'success' || !data.messages || data.messages.length === 0) return;

    const msgs = data.messages;
    const container = document.getElementById('liveChatMessages');
    if (container) {
      // Xóa placeholder "gửi tin nhắn để bắt đầu"
      container.innerHTML = '';
      // Replay từng tin nhắn vào chatbox (không có eval meta cho tin lịch sử)
      msgs.forEach(m => appendLiveChatBubble(m.role === 'user' ? 'user' : 'ai', m.content));
    }

    // Tạo duy nhất 1 inbox entry với cặp cuối cùng (tránh spam toast)
    // Tìm cặp user → assistant cuối
    let lastUserMsg = null;
    let lastAiMsg = null;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (!lastAiMsg && msgs[i].role === 'assistant') lastAiMsg = msgs[i].content;
      if (!lastUserMsg && msgs[i].role === 'user') { lastUserMsg = msgs[i].content; break; }
    }
    if (lastUserMsg && lastAiMsg) {
      // Sử dụng flag _isHistory=true để _syncLiveChatToInbox bỏ qua showToast
      _syncLiveChatToInbox(lastUserMsg, lastAiMsg, {
        is_safe: true, confidence_score: undefined,
        sentiment_analysis: 'bình thường', _isHistory: true
      });
    }
  } catch (err) {
    console.warn('[Agicom] Không thể replay lịch sử chat:', err.message);
  }
}

/* ──────────────────────────────────────────────────────────────────────
   11b. CRISIS CENTER — /api/crisis-overview + /api/crisis-plan
   ────────────────────────────────────────────────────────────────────── */

// ── Module-level state ──────────────────────────────────────────────────
let _crisisOverviewData = null;   // data from /api/crisis-overview
let _crisisSelectedPid  = null;   // product_id of active tab

// ── Keep _renderCrisisCard for internal evidence rendering ───────────────
/** Render một thẻ sản phẩm có tín hiệu khủng hoảng (dùng chung cho live + mock). */
function _renderCrisisCard(c) {
  const csev = c.severity === 'critical' ? { color: '#ef4444', label: '🔴 Khẩn cấp' }
             : c.severity === 'warning'  ? { color: '#f59e0b', label: '🟡 Cảnh báo' }
             :                              { color: '#6366f1', label: '🔵 Theo dõi' };

  // Safe array access — tránh lỗi khi backend trả về null
  const reviews      = Array.isArray(c.reviews)      ? c.reviews      : [];
  const risk_tasks   = Array.isArray(c.risk_tasks)   ? c.risk_tasks   : [];
  const chat_signals = Array.isArray(c.chat_signals) ? c.chat_signals : [];

  // Helper tạo HTML cho 1 review item
  const reviewItemHtml = (r) => `
    <div style="padding:6px 10px;background:rgba(239,68,68,0.05);border-radius:6px;
      font-size:0.77rem;margin-bottom:4px;border-left:3px solid #ef4444;">
      <strong style="color:#ef4444;">${r.rating}⭐ — ${r.customer}</strong>
      <span style="color:var(--text-muted);font-size:0.7rem;margin-left:6px;">${r.time || ''}</span>
      <div style="color:var(--text-secondary);margin-top:2px;line-height:1.4;">${r.text}</div>
      ${r.insight ? `<div style="font-size:0.7rem;color:var(--accent-indigo);margin-top:2px;">💡 ${r.insight}</div>` : ''}
    </div>`;

  // Chỉ hiện 5 review đầu, còn lại ẩn sau nút "Xem thêm"
  const PREVIEW_COUNT = 5;
  const cardId = 'crisis_' + (c.product_id || '').replace(/\W/g, '_') + '_' + Date.now();
  let reviewsHtml = '';
  if (reviews.length > 0) {
    const visible = reviews.slice(0, PREVIEW_COUNT);
    const hidden  = reviews.slice(PREVIEW_COUNT);
    reviewsHtml = visible.map(reviewItemHtml).join('');
    if (hidden.length > 0) {
      reviewsHtml += `
        <div id="${cardId}_extra" style="display:none;">
          ${hidden.map(reviewItemHtml).join('')}
        </div>
        <button
          onclick="
            var el = document.getElementById('${cardId}_extra');
            var btn = this;
            if (el.style.display === 'none') {
              el.style.display = 'block';
              btn.textContent = '▲ Ẩn bớt';
            } else {
              el.style.display = 'none';
              btn.textContent = '▼ Xem thêm ${hidden.length} review';
            }"
          style="margin-top:4px;margin-bottom:4px;font-size:0.72rem;padding:4px 12px;
            border:1px solid rgba(239,68,68,0.35);border-radius:6px;background:rgba(239,68,68,0.07);
            color:#ef4444;cursor:pointer;font-weight:600;">
          ▼ Xem thêm ${hidden.length} review
        </button>`;
    }
  }

  const tasksHtml = risk_tasks.length
    ? risk_tasks.map(t => `
        <div style="padding:6px 10px;background:rgba(245,158,11,0.07);border-radius:6px;
          font-size:0.76rem;margin-bottom:3px;border-left:3px solid #f59e0b;color:var(--text-secondary);">
          ⚠️ ${t}
        </div>`).join('')
    : '';

  const chatHtml = chat_signals.length
    ? chat_signals.map(s => `
        <div style="padding:5px 10px;background:rgba(99,102,241,0.06);border-radius:6px;
          font-size:0.75rem;margin-bottom:3px;border-left:3px solid #6366f1;color:var(--text-muted);">
          💬 ${s}
        </div>`).join('')
    : '';

  return `
    <div style="border:1px solid ${csev.color}40;border-radius:10px;overflow:hidden;margin-bottom:12px;">
      <div style="background:${csev.color}12;padding:10px 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span style="font-size:0.82rem;font-weight:800;color:${csev.color};">${csev.label}</span>
        <span style="font-size:0.78rem;font-weight:700;color:var(--text-primary);">
          Sản phẩm: <code style="background:var(--bg-glass);padding:1px 6px;border-radius:4px;">${c.product_id}</code>
        </span>
        <span style="margin-left:auto;font-size:0.7rem;background:${csev.color}18;
          color:${csev.color};padding:2px 8px;border-radius:8px;font-weight:700;">
          Score: ${c.severity_score}/100
        </span>
      </div>
      <div style="padding:12px 14px;background:var(--bg-secondary);">
        <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
          ${c.neg_review_count  > 0 ? `<span style="font-size:0.72rem;padding:3px 8px;border-radius:6px;background:rgba(239,68,68,0.1);color:#ef4444;font-weight:700;">📋 ${c.neg_review_count} review xấu</span>` : ''}
          ${c.risk_task_count   > 0 ? `<span style="font-size:0.72rem;padding:3px 8px;border-radius:6px;background:rgba(245,158,11,0.1);color:#f59e0b;font-weight:700;">⚠️ ${c.risk_task_count} tác vụ rủi ro</span>` : ''}
          ${c.chat_signal_count > 0 ? `<span style="font-size:0.72rem;padding:3px 8px;border-radius:6px;background:rgba(99,102,241,0.1);color:#6366f1;font-weight:700;">💬 ${c.chat_signal_count} tín hiệu chat</span>` : ''}
        </div>
        ${reviewsHtml}${tasksHtml}${chatHtml}
      </div>
    </div>`;
}

/**
 * Gọi /api/crisis-overview. Fallback sang MOCK khi offline.
 * Điền vào #crisisCenterShell với UI thống nhất.
 */
async function loadCrisisFromBackend() {
  const shell = document.getElementById('crisisCenterShell');
  if (!shell) return;

  shell.innerHTML = `
    <div class="content-card" style="text-align:center;padding:32px 20px;">
      <div style="font-size:2rem;margin-bottom:10px;">🛡</div>
      <div style="color:var(--text-muted);font-size:0.85rem;">⏳ Đang phân tích tín hiệu rủi ro...</div>
    </div>`;

  let data = null;
  let isFromMock = false;

  try {
    if (!_backendConnected) throw new Error('Backend offline');
    data = await apiCall('/api/crisis-overview');
  } catch (err) {
    console.warn('[Agicom] Crisis backend offline — dùng MOCK:', err.message);
    try {
      data = _buildCrisisFromMockData();
      isFromMock = true;
    } catch (mockErr) {
      shell.innerHTML = `<div class="content-card">
        <div style="color:var(--accent-rose);padding:12px;font-size:0.83rem;">
          ❌ Không thể tải dữ liệu khủng hoảng.<br>
          <small style="color:var(--text-muted);">${mockErr.message}</small>
        </div></div>`;
      return;
    }
  }

  _crisisOverviewData = data;

  try {
    _renderCrisisFullPage(shell, data, isFromMock);
  } catch (err) {
    shell.innerHTML = `<div class="content-card">
      <div style="color:var(--accent-rose);padding:12px;font-size:0.83rem;">
        ❌ Lỗi hiển thị.<br><small style="color:var(--text-muted);">${err.message}</small>
      </div></div>`;
  }
}

/**
 * Build the complete unified crisis center UI inside `shell`.
 * Single-page layout: KPI header → tabs per product → detail area.
 */
function _renderCrisisFullPage(shell, data, isFromMock) {
  const statusMap = {
    critical:   { color: '#ef4444', bg: 'rgba(239,68,68,0.08)',   icon: '🔴', label: 'CẢNH BÁO KHẨN CẤP' },
    warning:    { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  icon: '🟡', label: 'CẦN THEO DÕI' },
    monitoring: { color: '#6366f1', bg: 'rgba(99,102,241,0.08)', icon: '🔵', label: 'ĐANG QUAN SÁT' },
    safe:       { color: '#10b981', bg: 'rgba(16,185,129,0.08)', icon: '🟢', label: 'AN TOÀN' },
  };
  const st = statusMap[data.overall_status] || statusMap.safe;

  // Update MOCK.alerts for sidebar badge
  if (data.total_neg_reviews > 0 || data.total_risk_tasks > 0) {
    const liveAlert = {
      level: data.overall_status === 'critical' ? 'critical' : 'warning',
      icon: st.icon,
      text: `${isFromMock ? '[DEMO] ' : '[LIVE] '}${data.total_neg_reviews} review tiêu cực & ${data.total_risk_tasks} tác vụ rủi ro đang chờ xử lý`,
      cta: 'Xem ngay', cta_page: 'crisis-center', _fromBackend: !isFromMock
    };
    if (typeof MOCK !== 'undefined' && MOCK.alerts) {
      MOCK.alerts = MOCK.alerts.filter(a => !a._fromBackend);
      MOCK.alerts.unshift(liveAlert);
    }
    if (!isFromMock) {
      if (data.overall_status === 'critical') {
        showToast(`🔴 Phát hiện ${data.total_neg_reviews} review xấu & ${data.total_risk_tasks} cảnh báo rủi ro!`, 'danger');
      } else if (data.overall_status === 'warning') {
        showToast(`🟡 ${data.total_neg_reviews} review tiêu cực được ghi nhận`, 'warning');
      }
    }
  }

  const sourceBadge = isFromMock
    ? `<span style="font-size:0.65rem;padding:2px 8px;border-radius:6px;background:rgba(245,158,11,0.15);color:#f59e0b;font-weight:700;border:1px solid rgba(245,158,11,0.3);">🟡 Demo Data (Backend offline)</span>`
    : `<span style="font-size:0.65rem;padding:2px 8px;border-radius:6px;background:rgba(16,185,129,0.12);color:#10b981;font-weight:700;border:1px solid rgba(16,185,129,0.3);">🟢 Live Backend</span>`;

  const kpiHeader = `
    <div class="content-card" style="margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
        <div>
          <div class="content-card-title" style="margin:0;color:${st.color};">🛡 Trung tâm Khủng hoảng</div>
          <div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">
            Tổng hợp từ Reviews · Chat Signals · RiskManager Tasks
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          ${sourceBadge}
          <span style="font-size:0.65rem;color:var(--text-muted);">⏱ ${new Date(data.last_updated).toLocaleString('vi-VN')}</span>
          <button onclick="loadCrisisFromBackend()" class="btn-approve" style="font-size:0.72rem;padding:5px 12px;">🔄 Làm mới</button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">
        <div style="background:${st.bg};border-radius:8px;padding:10px;text-align:center;border:1px solid ${st.color}30;">
          <div style="font-size:1.3rem;font-weight:800;color:${st.color};">${st.icon}</div>
          <div style="font-size:0.65rem;color:${st.color};font-weight:700;margin-top:2px;">${st.label}</div>
        </div>
        <div style="background:rgba(239,68,68,0.07);border-radius:8px;padding:10px;text-align:center;border:1px solid rgba(239,68,68,0.2);">
          <div style="font-size:1.3rem;font-weight:800;color:#ef4444;">${data.total_neg_reviews}</div>
          <div style="font-size:0.65rem;color:var(--text-muted);margin-top:2px;">Review tiêu cực</div>
        </div>
        <div style="background:rgba(245,158,11,0.07);border-radius:8px;padding:10px;text-align:center;border:1px solid rgba(245,158,11,0.2);">
          <div style="font-size:1.3rem;font-weight:800;color:#f59e0b;">${data.total_risk_tasks}</div>
          <div style="font-size:0.65rem;color:var(--text-muted);margin-top:2px;">Tác vụ rủi ro</div>
        </div>
        <div style="background:rgba(99,102,241,0.07);border-radius:8px;padding:10px;text-align:center;border:1px solid rgba(99,102,241,0.2);">
          <div style="font-size:1.3rem;font-weight:800;color:#6366f1;">${data.total_chat_signals}</div>
          <div style="font-size:0.65rem;color:var(--text-muted);margin-top:2px;">Tín hiệu chat</div>
        </div>
      </div>
    </div>`;

  // ── Safe state ──
  if (data.crises.length === 0) {
    shell.innerHTML = kpiHeader + `
      <div class="content-card" style="text-align:center;padding:24px;border:1px solid rgba(16,185,129,0.3);">
        <div style="font-size:2.5rem;margin-bottom:8px;">✅</div>
        <div style="font-weight:700;color:#10b981;font-size:0.95rem;">Hệ thống ổn định</div>
        <div style="color:var(--text-muted);font-size:0.78rem;margin-top:6px;">
          Không phát hiện tín hiệu tiêu cực nào từ reviews & chat trong thời gian gần đây.
        </div>
      </div>`;
    return;
  }

  // ── Preserve or reset selected product tab ──
  if (!_crisisSelectedPid || !data.crises.find(c => c.product_id === _crisisSelectedPid)) {
    _crisisSelectedPid = data.crises[0].product_id;
  }

  const tabsHtml = data.crises.map(c => {
    const tc = c.severity === 'critical' ? { color: '#ef4444' }
             : c.severity === 'warning'  ? { color: '#f59e0b' }
             :                              { color: '#6366f1' };
    const sevIcon = c.severity === 'critical' ? '🔴' : c.severity === 'warning' ? '🟡' : '🔵';
    const isActive = c.product_id === _crisisSelectedPid;
    const planInfo = c.plan ? ` · ${c.plan.done_actions}/${c.plan.total_actions}` : '';
    return `
      <button onclick="window._selectCrisisProduct('${c.product_id}')"
        data-crisis-tab="${c.product_id}"
        style="padding:7px 14px;border-radius:8px;font-size:0.74rem;font-weight:700;cursor:pointer;white-space:nowrap;
          border:2px solid ${isActive ? tc.color : 'transparent'};
          background:${isActive ? tc.color + '18' : 'var(--bg-secondary)'};
          color:${isActive ? tc.color : 'var(--text-secondary)'};transition:all 0.15s;">
        ${sevIcon} ${c.product_name || c.product_id}
        <span style="font-size:0.62rem;opacity:0.75;margin-left:4px;">${c.severity_score}${planInfo}</span>
      </button>`;
  }).join('');

  shell.innerHTML = kpiHeader + `
    <div class="content-card" style="margin-bottom:0;">
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;padding-bottom:12px;
        border-bottom:1px solid var(--border-primary);">
        ${tabsHtml}
      </div>
      <div id="crisisDetailArea">
        <div style="text-align:center;padding:20px;color:var(--text-muted);font-size:0.83rem;">⏳ Đang tải...</div>
      </div>
    </div>`;

  const selectedCrisis = data.crises.find(c => c.product_id === _crisisSelectedPid);
  if (selectedCrisis) _renderCrisisDetail(selectedCrisis, isFromMock);
}

/** Switch tab: update highlight + reload detail area. */
window._selectCrisisProduct = function(product_id, forceRegenerate = false) {
  if (!_crisisOverviewData) return;
  const crisis = _crisisOverviewData.crises.find(c => c.product_id === product_id);
  if (!crisis) return;
  _crisisSelectedPid = product_id;

  // Update tab highlight
  document.querySelectorAll('[data-crisis-tab]').forEach(btn => {
    const c2 = _crisisOverviewData.crises.find(c => c.product_id === btn.dataset.crisisTab);
    if (!c2) return;
    const tc = c2.severity === 'critical' ? '#ef4444' : c2.severity === 'warning' ? '#f59e0b' : '#6366f1';
    const isActive = btn.dataset.crisisTab === product_id;
    btn.style.border       = `2px solid ${isActive ? tc : 'transparent'}`;
    btn.style.background   = isActive ? tc + '18' : 'var(--bg-secondary)';
    btn.style.color        = isActive ? tc : 'var(--text-secondary)';
  });

  _renderCrisisDetail(crisis, false, forceRegenerate);
};

/**
 * Render detail area for a selected crisis:
 * product header + evidence (reviews/tasks/chat) + AI plan (loaded async).
 */
function _renderCrisisDetail(crisis, isFromMock, forceRegenerate = false) {
  const detailEl = document.getElementById('crisisDetailArea');
  if (!detailEl) return;

  const csev = crisis.severity === 'critical'
    ? { color: '#ef4444', label: '🔴 Khẩn cấp',  bg: 'rgba(239,68,68,0.08)', icon: '🚨' }
    : crisis.severity === 'warning'
    ? { color: '#f59e0b', label: '🟡 Cảnh báo',   bg: 'rgba(245,158,11,0.08)', icon: '⚠️' }
    : { color: '#6366f1', label: '🔵 Theo dõi',   bg: 'rgba(99,102,241,0.08)', icon: '🔵' };

  const reviews      = Array.isArray(crisis.reviews)      ? crisis.reviews      : [];
  const risk_tasks   = Array.isArray(crisis.risk_tasks)   ? crisis.risk_tasks   : [];
  const chat_signals = Array.isArray(crisis.chat_signals) ? crisis.chat_signals : [];

  // ── Evidence: reviews ──
  const reviewItemHtml = (r) => `
    <div style="padding:6px 10px;background:rgba(239,68,68,0.05);border-radius:6px;
      font-size:0.77rem;margin-bottom:4px;border-left:3px solid #ef4444;">
      <strong style="color:#ef4444;">${r.rating || '?'}★ — ${r.customer || 'Ẩn danh'}</strong>
      <span style="color:var(--text-muted);font-size:0.7rem;margin-left:6px;">${r.time || ''}</span>
      <div style="color:var(--text-secondary);margin-top:2px;line-height:1.4;">${r.text || ''}</div>
      ${r.insight ? `<div style="font-size:0.7rem;color:var(--accent-indigo);margin-top:2px;">💡 ${r.insight}</div>` : ''}
    </div>`;

  const PREVIEW = 3;
  const cardId  = 'cd_' + crisis.product_id.replace(/\W/g, '_');
  let reviewsHtml = '';
  if (reviews.length > 0) {
    const vis = reviews.slice(0, PREVIEW);
    const hid = reviews.slice(PREVIEW);
    reviewsHtml = vis.map(reviewItemHtml).join('');
    if (hid.length > 0) {
      reviewsHtml += `
        <div id="${cardId}_extra" style="display:none;">${hid.map(reviewItemHtml).join('')}</div>
        <button onclick="var e=document.getElementById('${cardId}_extra');var b=this;
          if(e.style.display==='none'){e.style.display='block';b.textContent='▲ Ẩn bớt';}
          else{e.style.display='none';b.textContent='▼ Xem thêm ${hid.length} review';}"
          style="margin-top:4px;font-size:0.72rem;padding:4px 12px;border:1px solid rgba(239,68,68,0.35);
            border-radius:6px;background:rgba(239,68,68,0.07);color:#ef4444;cursor:pointer;font-weight:600;">
          ▼ Xem thêm ${hid.length} review
        </button>`;
    }
  }

  const tasksHtml = risk_tasks.map(t => `
    <div style="padding:6px 10px;background:rgba(245,158,11,0.07);border-radius:6px;
      font-size:0.76rem;margin-bottom:3px;border-left:3px solid #f59e0b;color:var(--text-secondary);">
      ⚠️ ${t}
    </div>`).join('');

  const chatHtml = chat_signals.map(s => `
    <div style="padding:5px 10px;background:rgba(99,102,241,0.06);border-radius:6px;
      font-size:0.75rem;margin-bottom:3px;border-left:3px solid #6366f1;color:var(--text-muted);">
      💬 ${s}
    </div>`).join('');

  const hasSideCol = risk_tasks.length > 0 || chat_signals.length > 0;
  const evidenceHtml = `
    <div style="display:grid;grid-template-columns:${hasSideCol ? '1fr 1fr' : '1fr'};gap:14px;margin-bottom:18px;">
      ${reviews.length > 0 ? `
        <div>
          <div style="font-size:0.73rem;font-weight:700;color:#ef4444;margin-bottom:6px;">
            📋 ${crisis.neg_review_count} Review tiêu cực
          </div>
          ${reviewsHtml}
        </div>` : ''}
      ${hasSideCol ? `
        <div>
          ${risk_tasks.length ? `
            <div style="font-size:0.73rem;font-weight:700;color:#f59e0b;margin-bottom:6px;">⚠️ Tác vụ rủi ro</div>
            ${tasksHtml}` : ''}
          ${chat_signals.length ? `
            <div style="font-size:0.73rem;font-weight:700;color:#6366f1;margin-top:10px;margin-bottom:6px;">💬 Tín hiệu chat</div>
            ${chatHtml}` : ''}
        </div>` : ''}
    </div>`;

  // Plan progress badge (from crisis-overview metadata)
  const planMeta = crisis.plan;
  const planBadge = planMeta
    ? `<span style="font-size:0.65rem;padding:2px 8px;border-radius:6px;
        background:rgba(99,102,241,0.1);color:#6366f1;border:1px solid rgba(99,102,241,0.3);">
        ✅ Có plan · ${planMeta.done_actions}/${planMeta.total_actions} xong</span>`
    : `<span style="font-size:0.65rem;padding:2px 8px;border-radius:6px;
        background:rgba(245,158,11,0.1);color:#f59e0b;border:1px solid rgba(245,158,11,0.3);">
        ⏳ Chưa có plan</span>`;

  const safePid = crisis.product_id.replace(/\W/g, '_');
  detailEl.innerHTML = `
    <!-- Product severity header -->
    <div style="background:${csev.bg};border:1px solid ${csev.color}30;border-radius:10px;
      padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <span style="font-size:1.4rem;">${csev.icon}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:0.85rem;font-weight:800;color:${csev.color};">
          ${csev.label} — ${crisis.product_name || crisis.product_id}
        </div>
        <div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">
          Score: <strong style="color:${csev.color};">${crisis.severity_score}/100</strong>
          &nbsp;·&nbsp; ${planBadge}
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${crisis.neg_review_count  > 0 ? `<span style="font-size:0.7rem;padding:3px 8px;border-radius:6px;background:rgba(239,68,68,0.1);color:#ef4444;font-weight:700;">📋 ${crisis.neg_review_count} review</span>` : ''}
        ${crisis.risk_task_count   > 0 ? `<span style="font-size:0.7rem;padding:3px 8px;border-radius:6px;background:rgba(245,158,11,0.1);color:#f59e0b;font-weight:700;">⚠️ ${crisis.risk_task_count} tác vụ</span>` : ''}
        ${crisis.chat_signal_count > 0 ? `<span style="font-size:0.7rem;padding:3px 8px;border-radius:6px;background:rgba(99,102,241,0.1);color:#6366f1;font-weight:700;">💬 ${crisis.chat_signal_count} chat</span>` : ''}
      </div>
    </div>

    <!-- Evidence -->
    ${evidenceHtml}

    <!-- AI Plan (loaded async) -->
    <div id="crisisPlanArea_${safePid}" style="margin-top:4px;">
      <div style="font-size:0.83rem;color:var(--text-muted);text-align:center;padding:16px;">
        ⏳ Đang tải kế hoạch xử lý AI...
      </div>
    </div>`;

  if (!isFromMock) {
    _loadAndRenderPlan(crisis, forceRegenerate);
  } else {
    const planArea = document.getElementById(`crisisPlanArea_${safePid}`);
    if (planArea) planArea.innerHTML = `
      <div style="background:rgba(245,158,11,0.07);border:1px dashed rgba(245,158,11,0.4);
        border-radius:10px;padding:14px;text-align:center;">
        <div style="color:#f59e0b;font-size:0.8rem;font-weight:700;">🟡 Demo Mode</div>
        <div style="color:var(--text-muted);font-size:0.75rem;margin-top:4px;">
          Kế hoạch AI chỉ khả dụng khi backend online.
        </div>
      </div>`;
  }
}

/**
 * Load existing plan via GET /api/crisis-plan/{product_id}.
 * If 404, generate via POST /api/crisis-plan.
 * If forceRegenerate=true, skip GET and call POST with force_regenerate=true.
 */
async function _loadAndRenderPlan(crisis, forceRegenerate = false) {
  const pid       = crisis.product_id;
  const safePid   = pid.replace(/\W/g, '_');
  const planArea  = document.getElementById(`crisisPlanArea_${safePid}`);
  if (!planArea) return;

  let planData = null;

  if (!forceRegenerate) {
    try {
      planData = await apiCall(`/api/crisis-plan/${pid}`);
    } catch (err) {
      const is404 = err?.status === 404 || (err?.message || '').includes('404') || String(err).includes('404');
      if (!is404) {
        planArea.innerHTML = `<div style="color:var(--accent-rose);font-size:0.8rem;padding:10px;border-radius:8px;
          background:var(--accent-rose-bg);">❌ Lỗi tải plan: ${err.message}</div>`;
        return;
      }
      // 404 → need to generate
    }
  }

  if (!planData) {
    planArea.innerHTML = `
      <div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.2);
        border-radius:10px;padding:16px;text-align:center;">
        <div style="font-size:1.5rem;margin-bottom:6px;">🤖</div>
        <div style="font-size:0.8rem;color:var(--accent-indigo);font-weight:700;">
          AI đang phân tích & tạo kế hoạch xử lý...
        </div>
        <div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px;">Quá trình này mất 5–15 giây</div>
      </div>`;

    try {
      planData = await apiCall('/api/crisis-plan', 'POST', {
        product_id:        pid,
        product_name:      crisis.product_name || pid,
        neg_review_count:  crisis.neg_review_count  || 0,
        risk_task_count:   crisis.risk_task_count   || 0,
        chat_signal_count: crisis.chat_signal_count || 0,
        reviews:           (crisis.reviews || []).map(r => ({
          rating: r.rating, review_text: r.text, customer_name: r.customer
        })),
        risk_tasks:        crisis.risk_tasks   || [],
        chat_signals:      crisis.chat_signals || [],
        force_regenerate:  forceRegenerate,
      });
    } catch (genErr) {
      planArea.innerHTML = `
        <div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);
          border-radius:10px;padding:14px;text-align:center;">
          <div style="color:#ef4444;font-size:0.8rem;font-weight:700;">❌ Không thể tạo kế hoạch AI</div>
          <div style="color:var(--text-muted);font-size:0.72rem;margin-top:4px;">${genErr.message}</div>
          <button onclick="window._selectCrisisProduct('${pid}', true)"
            class="btn-approve" style="font-size:0.72rem;padding:5px 12px;margin-top:10px;">
            🔄 Thử lại
          </button>
        </div>`;
      return;
    }
  }

  if (planData) _renderPlanSection(planArea, planData, crisis);
}

/**
 * Render AI plan into planArea:
 * urgency header + root cause + progress bar + immediate actions + mid-term actions.
 * Each action has status checkboxes that call PATCH /api/crisis-action/{action_id}.
 */
function _renderPlanSection(planArea, planData, crisis) {
  const urgencyMap = {
    critical: { color: '#ef4444', label: '🚨 Khẩn cấp — xử lý trong 2–4h',      bg: 'rgba(239,68,68,0.08)'   },
    high:     { color: '#f97316', label: '🔶 Cao — xử lý trong ngày',             bg: 'rgba(249,115,22,0.08)'  },
    medium:   { color: '#f59e0b', label: '🟡 Trung bình — xử lý trong 2–3 ngày', bg: 'rgba(245,158,11,0.08)'  },
    low:      { color: '#6366f1', label: '🔵 Thấp — theo dõi',                   bg: 'rgba(99,102,241,0.08)'  },
  };
  const urg = urgencyMap[planData.urgency] || urgencyMap.medium;

  const actions   = Array.isArray(planData.actions) ? planData.actions : [];
  const immediate = actions.filter(a => a.type === 'immediate');
  const midTerm   = actions.filter(a => a.type === 'mid_term');
  const doneCount    = actions.filter(a => a.status === 'done').length;
  const skippedCount = actions.filter(a => a.status === 'skipped').length;
  const progressPct  = actions.length ? Math.round((doneCount / actions.length) * 100) : 0;
  const generatedAt  = planData.generated_at
    ? new Date(planData.generated_at).toLocaleString('vi-VN') : 'Vừa tạo';

  const catIcon  = { apology: '🙏', escalate: '📞', logistics: '📦', quality_check: '🔍', marketing: '📢', monitor: '👀' };
  const catLabel = { apology: 'Xin lỗi', escalate: 'Leo thang', logistics: 'Vận chuyển', quality_check: 'Kiểm tra CL', marketing: 'Marketing', monitor: 'Theo dõi' };

  // Store draft messages in a window map — avoids any HTML-attribute escaping issues
  // with quotes, newlines or special chars inside the draft text.
  window._crisisDraftMessages = window._crisisDraftMessages || {};
  actions.forEach(a => {
    if (a.draft_message) window._crisisDraftMessages[a.action_id] = a.draft_message;
  });

  const renderActionItem = (a) => {
    const isDone    = a.status === 'done';
    const isSkipped = a.status === 'skipped';
    const actionColor = a.type === 'immediate' ? '#ef4444' : '#f59e0b';
    const safeAid = (a.action_id || '').replace(/['"\\]/g, '');

    return `
      <div id="act_row_${safeAid.replace(/\W/g, '_')}"
        style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:8px;
          margin-bottom:6px;transition:all 0.2s;
          border:1px solid ${isDone ? 'rgba(16,185,129,0.25)' : isSkipped ? 'rgba(100,116,139,0.2)' : actionColor + '25'};
          background:${isDone ? 'rgba(16,185,129,0.05)' : isSkipped ? 'rgba(100,116,139,0.04)' : actionColor + '06'};
          opacity:${isSkipped ? '0.55' : '1'};">
        <!-- Checkbox -->
        <button onclick="_toggleCrisisAction('${safeAid}','${a.status}','${isDone ? 'pending' : 'done'}')"
          title="${isDone ? 'Bỏ đánh dấu' : 'Đánh dấu hoàn thành'}"
          style="min-width:22px;height:22px;border-radius:5px;cursor:pointer;flex-shrink:0;margin-top:1px;
            display:flex;align-items:center;justify-content:center;font-size:0.75rem;transition:all 0.15s;
            border:2px solid ${isDone ? '#10b981' : isSkipped ? '#94a3b8' : actionColor};
            background:${isDone ? '#10b981' : 'transparent'};">
          ${isDone ? '<span style="color:white;font-weight:800;">✓</span>' : isSkipped ? '<span style="color:#94a3b8;font-size:0.9rem;">–</span>' : ''}
        </button>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:3px;">
            <span style="font-size:0.68rem;padding:1px 7px;border-radius:5px;font-weight:700;
              background:${actionColor}18;color:${actionColor};">
              ${catIcon[a.category] || '✅'} ${catLabel[a.category] || a.category}
            </span>
            <span style="font-size:0.78rem;font-weight:700;
              color:${isDone ? '#10b981' : isSkipped ? '#94a3b8' : 'var(--text-primary)'};
              text-decoration:${isSkipped ? 'line-through' : 'none'};">${a.title || ''}</span>
          </div>
          <div style="font-size:0.74rem;color:var(--text-muted);line-height:1.5;">${a.detail || ''}</div>
          ${a.draft_message ? `
            <div style="margin-top:7px;background:var(--bg-secondary);border:1px dashed var(--border-primary);
              border-radius:7px;padding:8px 10px;font-size:0.74rem;color:var(--text-secondary);
              line-height:1.6;font-style:italic;">${a.draft_message}
              <button onclick="window._copyDraftMessage('${safeAid}')"
                style="display:block;margin-top:6px;font-size:0.68rem;padding:3px 10px;border-radius:5px;
                  border:1px solid var(--accent-indigo);background:rgba(99,102,241,0.08);
                  color:var(--accent-indigo);cursor:pointer;font-weight:600;">
                📋 Copy tin nhắn
              </button>
            </div>` : ''}
          <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">
            ${!isSkipped ? `<button onclick="_toggleCrisisAction('${safeAid}','${a.status}','skipped')"
              style="font-size:0.68rem;padding:2px 9px;border-radius:5px;cursor:pointer;font-weight:600;
                border:1px solid #94a3b8;background:rgba(100,116,139,0.07);color:#94a3b8;">– Bỏ qua</button>` : ''}
            ${(isDone || isSkipped) ? `<button onclick="_toggleCrisisAction('${safeAid}','${a.status}','pending')"
              style="font-size:0.68rem;padding:2px 9px;border-radius:5px;cursor:pointer;font-weight:600;
                border:1px solid var(--accent-indigo);background:rgba(99,102,241,0.06);color:var(--accent-indigo);">↩ Hoàn tác</button>` : ''}
          </div>
        </div>
      </div>`;
  };

  planArea.innerHTML = `
    <!-- Plan header -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
      <div>
        <div style="font-size:0.82rem;font-weight:800;color:var(--text-primary);">
          🛡 Kế hoạch xử lý — AI tạo
        </div>
        <div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;">
          Tạo lúc ${generatedAt}
          ${planData.from_cache
            ? ' · <span style="color:#10b981;">Từ cache</span>'
            : ' · <span style="color:#6366f1;">Mới tạo</span>'}
        </div>
      </div>
      <button onclick="window._selectCrisisProduct('${crisis.product_id}', true)"
        class="btn-modal-cancel" style="font-size:0.7rem;padding:4px 10px;white-space:nowrap;">
        🔄 Làm mới plan
      </button>
    </div>

    <!-- Root cause + urgency -->
    <div style="background:${urg.bg};border:1px solid ${urg.color}30;border-radius:10px;
      padding:12px 14px;margin-bottom:14px;">
      <div style="font-size:0.75rem;font-weight:800;color:${urg.color};margin-bottom:5px;">
        ${urg.label}
      </div>
      <div style="font-size:0.79rem;color:var(--text-secondary);line-height:1.6;">
        ${planData.root_cause_summary || 'Chưa có phân tích.'}
      </div>
    </div>

    <!-- Progress bar -->
    <div style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
        <span style="font-size:0.7rem;color:var(--text-muted);">
          Tiến độ: ${doneCount}/${actions.length} hành động đã xong
          ${skippedCount > 0 ? ` · ${skippedCount} bỏ qua` : ''}
        </span>
        <span style="font-size:0.7rem;font-weight:700;
          color:${progressPct >= 80 ? '#10b981' : progressPct >= 40 ? '#f59e0b' : 'var(--text-muted)'};">
          ${progressPct}%
        </span>
      </div>
      <div style="height:6px;background:var(--bg-secondary);border-radius:4px;overflow:hidden;">
        <div style="height:100%;width:${progressPct}%;border-radius:4px;transition:width 0.3s;
          background:${progressPct >= 80 ? '#10b981' : '#6366f1'};"></div>
      </div>
    </div>

    <!-- Immediate actions -->
    ${immediate.length > 0 ? `
      <div style="margin-bottom:14px;">
        <div style="font-size:0.76rem;font-weight:800;color:var(--text-primary);margin-bottom:8px;
          display:flex;align-items:center;gap:8px;">
          <span style="background:#ef4444;color:white;padding:2px 9px;border-radius:6px;
            font-size:0.67rem;font-weight:800;">NGAY · 0–4h</span>
          Hành động ngay lập tức
        </div>
        ${immediate.map(renderActionItem).join('')}
      </div>` : ''}

    <!-- Mid-term actions -->
    ${midTerm.length > 0 ? `
      <div>
        <div style="font-size:0.76rem;font-weight:800;color:var(--text-primary);margin-bottom:8px;
          display:flex;align-items:center;gap:8px;">
          <span style="background:#f59e0b;color:white;padding:2px 9px;border-radius:6px;
            font-size:0.67rem;font-weight:800;">1–7 NGÀY</span>
          Xử lý trung hạn
        </div>
        ${midTerm.map(renderActionItem).join('')}
      </div>` : ''}`;
}

/**
 * Toggle an action's status. Calls PATCH /api/crisis-action/{action_id}.
 * On success, reloads the plan section for the current product.
 */
window._toggleCrisisAction = async function(action_id, currentStatus, targetStatus) {
  if (!targetStatus) {
    targetStatus = currentStatus === 'done' ? 'pending' : 'done';
  }
  try {
    await apiCall(`/api/crisis-action/${action_id}`, 'PATCH', { status: targetStatus });
    const toastMsg = targetStatus === 'done'    ? '✅ Đã đánh dấu hoàn thành'
                   : targetStatus === 'skipped' ? '– Đã bỏ qua hành động'
                   :                              '↩ Đã hoàn tác';
    showToast(toastMsg, 'success');

    // Reload plan section without reloading the whole page
    if (_crisisSelectedPid && _crisisOverviewData) {
      const crisis = _crisisOverviewData.crises.find(c => c.product_id === _crisisSelectedPid);
      if (crisis) _loadAndRenderPlan(crisis, false);
    }
  } catch (err) {
    showToast(`❌ Lỗi cập nhật: ${err.message}`, 'danger');
  }
};

/** Copy a draft message by action_id from the window map (avoids HTML-attribute escaping). */
window._copyDraftMessage = function(action_id) {
  const text = window._crisisDraftMessages?.[action_id];
  if (!text) { showToast('⚠️ Không tìm thấy nội dung tin nhắn', 'warning'); return; }
  navigator.clipboard?.writeText(text)
    .then(() => showToast('✅ Đã copy tin nhắn!', 'success'))
    .catch(() => showToast('⚠️ Trình duyệt chặn clipboard — hãy copy thủ công', 'warning'));
};

/* ──────────────────────────────────────────────────────────────────────
   11c. MOCK DATA FALLBACK — xây dựng crisis data khi backend offline
   ────────────────────────────────────────────────────────────────────── */

/**
 * Xây dựng cấu trúc dữ liệu crisis từ MOCK data (khi backend offline).
 * Phân tích: MOCK.reviews (rating ≤ 3), MOCK.chat_clusters (urgent),
 *            MOCK.conversations (status=escalate hoặc angry=true).
 */
function _buildCrisisFromMockData() {
  const productMap = {};

  const ensureProduct = (pid) => {
    if (!productMap[pid]) {
      productMap[pid] = {
        product_id: pid,
        neg_review_count: 0, risk_task_count: 0, chat_signal_count: 0,
        reviews: [], risk_tasks: [], chat_signals: [],
        severity_score: 0, severity: 'monitoring'
      };
    }
    return productMap[pid];
  };

  // 1. Reviews tiêu cực
  if (typeof MOCK !== 'undefined' && Array.isArray(MOCK.reviews)) {
    MOCK.reviews.filter(r => (r.rating || 5) <= 3).forEach(r => {
      const pid = r.product_id || r.sku_id || 'General';
      const entry = ensureProduct(pid);
      entry.neg_review_count++;
      entry.reviews.push({
        rating: r.rating,
        customer: r.author || 'Khách hàng',
        time: r.date || r.time || 'Gần đây',
        text: r.text || r.review || '',
        insight: (r.tag && r.tag.label) ? r.tag.label : null
      });
    });
  }

  // 2. Chat clusters khẩn cấp
  if (typeof MOCK !== 'undefined' && Array.isArray(MOCK.chat_clusters)) {
    MOCK.chat_clusters.filter(cl => cl.urgent).forEach(cl => {
      const pid = cl.product_id || 'General';
      const entry = ensureProduct(pid);
      entry.chat_signal_count++;
      entry.chat_signals.push(`${cl.label} (${cl.count} cuộc hội thoại)`);
    });
  }

  // 3. Conversations leo thang / khách tức giận
  if (typeof MOCK !== 'undefined' && Array.isArray(MOCK.conversations)) {
    MOCK.conversations.filter(c => c.status === 'escalate' || c.angry).forEach(c => {
      const pid = c.product_id || 'General';
      const entry = ensureProduct(pid);
      entry.risk_task_count++;
      const preview = c.last_message || c.preview || 'Tin nhắn chờ xử lý';
      entry.risk_tasks.push(`Hội thoại với ${c.customer || c.name || 'Khách'}: ${preview}`);
    });
  }

  // 4. Tính severity
  const crises = Object.values(productMap).map(p => {
    p.severity_score = Math.min(100,
      p.neg_review_count  * 20 +
      p.risk_task_count   * 25 +
      p.chat_signal_count * 15
    );
    p.severity = p.severity_score >= 60 ? 'critical'
               : p.severity_score >= 30 ? 'warning'
               :                          'monitoring';
    return p;
  }).sort((a, b) => b.severity_score - a.severity_score);

  const total_neg_reviews  = crises.reduce((s, p) => s + p.neg_review_count,  0);
  const total_risk_tasks   = crises.reduce((s, p) => s + p.risk_task_count,   0);
  const total_chat_signals = crises.reduce((s, p) => s + p.chat_signal_count, 0);

  let overall_status = 'safe';
  if      (crises.some(p => p.severity === 'critical'))  overall_status = 'critical';
  else if (crises.some(p => p.severity === 'warning'))   overall_status = 'warning';
  else if (crises.length > 0)                            overall_status = 'monitoring';

  return { overall_status, total_crisis_products: crises.length,
           total_neg_reviews, total_risk_tasks, total_chat_signals,
           crises, last_updated: new Date().toISOString() };
}

/* ──────────────────────────────────────────────────────────────────────
   13. CONTENT SUGGESTIONS — Sinh đề xuất từ Báo cáo Hàng ngày
   ────────────────────────────────────────────────────────────────────── */

/**
 * Phân tích dữ liệu báo cáo hàng ngày (hoặc MOCK khi offline)
 * → sinh đề xuất content có cấu trúc → inject vào MOCK.content_suggestions_generated
 * → navigate sang trang "content-suggestions".
 *
 * @param {object|null} summaryData  - kết quả từ /daily-summary, null = dùng MOCK thuần
 */
function generateContentSuggestionsFromSummary(summaryData) {
  if (typeof MOCK === 'undefined') return;

  // Xóa các suggestion đã generated trước đó để tránh trùng
  MOCK.content_suggestions_generated =
    MOCK.content_suggestions_generated.filter(s => !s._fromDailySummary);

  const ts = Date.now();
  const newSugs = [];

  // ── Helpers ─────────────────────────────────────────────────────────
  const detectType = (text) => {
    const t = (text || '').toLowerCase();
    if (t.includes('video') || t.includes('quay') || t.includes('tiktok') || t.includes('youtube')) return 'video';
    if (t.includes('so sánh') || t.includes('compare') || t.includes(' vs ')) return 'comparison';
    if (t.includes('faq') || t.includes('blog') || t.includes('hướng dẫn') || t.includes('câu hỏi') || t.includes('giải đáp')) return 'blog_faq';
    return 'guide';
  };

  const platformFor = (type) => ({
    video: 'TikTok + YouTube', blog_faq: 'Blog + Website',
    comparison: 'Blog + YouTube', guide: 'Website + Shopee'
  }[type] || 'Đa nền tảng');

  const prodTimeFor = (type) => ({
    video: '1-2 ngày quay + editing', blog_faq: '2-4 giờ viết + review',
    comparison: '1 ngày nghiên cứu + viết', guide: '3-5 giờ thiết kế/viết'
  }[type] || '1-2 ngày');

  const findCluster = (keyword) => {
    if (!Array.isArray(MOCK.chat_clusters)) return null;
    const kw = (keyword || '').toLowerCase();
    return MOCK.chat_clusters.find(cl =>
      cl.label.toLowerCase().split(' ').some(w => w.length > 3 && kw.includes(w))
    ) || null;
  };

  const findNegReviews = (keyword) => {
    if (!Array.isArray(MOCK.reviews)) return [];
    const kw = (keyword || '').toLowerCase().split(/\s+/)[0];
    return MOCK.reviews.filter(r =>
      r.rating <= 3 &&
      ((r.text || '').toLowerCase().includes(kw) || (r.product_id || '').toLowerCase().includes(kw))
    );
  };

  const buildSug = ({ id, taskText, source, urgency, dateLabel }) => {
    const type = detectType(taskText);
    const cluster = findCluster(taskText);
    const negRevs = findNegReviews(taskText);

    let score = urgency === 'high' ? 83 : 66;
    if (cluster?.urgent) score += 10;
    if (negRevs.length > 0) score += Math.min(negRevs.length * 4, 12);
    score = Math.min(99, score);

    const chatCount = cluster ? cluster.count : Math.max(3, Math.round(score / 8));
    const chatTopic = cluster ? cluster.label : taskText.split('—')[0].trim().substring(0, 50);
    const sampleQs = cluster
      ? [`"${cluster.label}"`, `Khách hỏi về ${cluster.label.toLowerCase().split(' ').slice(0, 3).join(' ')}`]
      : [`"${taskText.substring(0, 45)}"`, 'Khách phản ánh vấn đề liên quan'];
    const sampleRevs = negRevs.slice(0, 2).map(r => (r.text || '').substring(0, 60) + (r.text?.length > 60 ? '...' : ''));

    return {
      id,
      priority: score >= 80 ? 'high' : 'medium',
      status: 'pending',
      type,
      title: taskText,
      platform: platformFor(type),
      chatbot_signal: { count: chatCount, topic: chatTopic, sample_questions: sampleQs },
      review_signal: {
        count: negRevs.length,
        neg_pct: negRevs.length > 0 ? Math.min(99, 45 + negRevs.length * 12) : 0,
        sample_reviews: sampleRevs
      },
      combined_score: score,
      estimated_impact: `Giảm ~${Math.round(chatCount * 2.2)}% câu hỏi liên quan · tăng CR ${score >= 80 ? '8–12%' : '4–7%'}`,
      estimated_production: prodTimeFor(type),
      angle: `Nguồn: báo cáo ${dateLabel}. Ưu tiên dựa trên ${cluster ? `${chatCount} câu chatbot` : 'phân tích tín hiệu'}${negRevs.length > 0 ? ` + ${negRevs.length} review tiêu cực` : ''}.`,
      _fromDailySummary: true,
      _source: source
    };
  };

  // ── Case 1: Có dữ liệu từ backend ───────────────────────────────────
  if (summaryData) {
    const dateLabel = summaryData.date || 'hôm nay';
    const contentTasks = summaryData.growth_strategy?.content_optimizations || [];
    const riskActions  = (summaryData.risk_management?.urgent_actions || [])
      .filter(t => /nội dung|content|thông tin|mô tả|faq|video/i.test(t));
    const insights     = summaryData.customer_sentiment_overview || [];

    // Từ content_optimizations
    contentTasks.forEach((task, i) => {
      newSugs.push(buildSug({ id: `daily-co-${ts}-${i}`, taskText: task, source: 'content_optimization', urgency: 'medium', dateLabel }));
    });

    // Từ urgent_actions liên quan content
    riskActions.forEach((task, i) => {
      if (!newSugs.some(s => s.title.toLowerCase().includes(task.toLowerCase().split(' ')[2]))) {
        newSugs.push(buildSug({ id: `daily-ra-${ts}-${i}`, taskText: task, source: 'risk_action', urgency: 'high', dateLabel }));
      }
    });

    // Từ customer_sentiment_overview — nhóm theo từ khoá
    const insightMap = {};
    insights.forEach(ins => {
      const kw = /màu|son/.test(ins) ? 'màu sắc/son'
               : /phấn|bột/.test(ins) ? 'phấn/bột'
               : /kem|dưỡng|rửa mặt/.test(ins) ? 'dưỡng da'
               : /giao|ship/.test(ins) ? 'giao hàng'
               : /kích ứng|purging/.test(ins) ? 'kích ứng/purging'
               : /sỉ|b2b|đại lý/.test(ins) ? 'sỉ/B2B'
               : 'chung';
      (insightMap[kw] = insightMap[kw] || []).push(ins);
    });
    Object.entries(insightMap).forEach(([kw, arr], i) => {
      // Chỉ tạo nếu đủ tín hiệu và chưa bị cover bởi contentTasks
      const alreadyCovered = newSugs.some(s => s.title.toLowerCase().includes(kw.split('/')[0]));
      if (!alreadyCovered && arr.length >= 2) {
        const type = /video|quay/.test(arr.join(' ')) ? 'video' : 'blog_faq';
        const score = Math.min(99, 58 + arr.length * 5);
        newSugs.push({
          id: `daily-ins-${ts}-${i}`,
          priority: score >= 75 ? 'high' : 'medium',
          status: 'pending',
          type,
          title: `FAQ: Giải đáp loạt câu hỏi về "${kw}" — ${arr.length} insight từ chatbot`,
          platform: platformFor(type),
          chatbot_signal: { count: arr.length * 4, topic: `Khách hỏi về ${kw}`, sample_questions: arr.slice(0, 2) },
          review_signal: { count: 0, neg_pct: 0, sample_reviews: [] },
          combined_score: score,
          estimated_impact: `Giải đáp trực tiếp ${arr.length * 4}+ câu hỏi tương tự từ chatbot trong ngày`,
          estimated_production: prodTimeFor(type),
          angle: `Tổng hợp ${arr.length} insight hôm nay về "${kw}": ${arr.slice(0, 2).join(' | ')}`,
          _fromDailySummary: true,
          _source: 'sentiment_insight'
        });
      }
    });

  // ── Case 2: Offline / Demo mode — phân tích từ MOCK data ────────────
  } else {
    const dateLabel = new Date().toLocaleDateString('vi-VN');

    // Từ chat_clusters (urgent + lớn)
    (MOCK.chat_clusters || [])
      .filter(cl => cl.urgent || cl.count >= 10)
      .forEach((cl, i) => {
        const negRevs = findNegReviews(cl.label);
        const type = detectType(cl.label + ' ' + (cl.action || ''));
        const score = Math.min(99, (cl.urgent ? 86 : 68) + Math.min(negRevs.length * 4, 10));
        newSugs.push({
          id: `mock-cl-${ts}-${i}`,
          priority: cl.urgent ? 'high' : 'medium',
          status: 'pending',
          type,
          title: `${cl.icon || '📝'} ${cl.action} — "${cl.label}"`,
          platform: platformFor(type),
          chatbot_signal: { count: cl.count, topic: cl.label, sample_questions: [`"${cl.label}"`, `Khách hỏi về ${cl.label.split(' ').slice(0, 3).join(' ')}`] },
          review_signal: { count: negRevs.length, neg_pct: negRevs.length > 0 ? 65 : 0, sample_reviews: negRevs.slice(0, 2).map(r => (r.text || '').substring(0, 60)) },
          combined_score: score,
          estimated_impact: cl.impact || `Giảm ~${Math.round(cl.count * 2.1)}% câu hỏi về "${cl.label}"`,
          estimated_production: prodTimeFor(type),
          angle: `Demo mode — ${cl.count} khách hỏi chủ đề này. Hành động: ${cl.action}`,
          _fromDailySummary: true,
          _source: 'mock_cluster'
        });
      });

    // Từ reviews tiêu cực nhóm theo product
    const byProduct = {};
    (MOCK.reviews || []).filter(r => r.rating <= 2).forEach(r => {
      const pid = r.product_id || 'General';
      (byProduct[pid] = byProduct[pid] || []).push(r);
    });
    Object.entries(byProduct).forEach(([pid, revs], i) => {
      const alreadyCovered = newSugs.some(s =>
        s.title.toLowerCase().includes(pid.toLowerCase().replace(/-/g, ' ').split(' ')[0])
      );
      if (!alreadyCovered) {
        const score = Math.min(99, 62 + revs.length * 9);
        newSugs.push({
          id: `mock-rv-${ts}-${i}`,
          priority: revs.length >= 2 ? 'high' : 'medium',
          status: 'pending',
          type: 'guide',
          title: `📢 Nội dung xử lý phản hồi tiêu cực — ${pid.replace(/-/g, ' ')}`,
          platform: 'Shopee + Website',
          chatbot_signal: { count: revs.length * 3, topic: `Phàn nàn về ${pid}`, sample_questions: revs.slice(0, 2).map(r => `"${(r.text || '').substring(0, 45)}"`) },
          review_signal: { count: revs.length, neg_pct: 100, sample_reviews: revs.slice(0, 2).map(r => (r.text || '').substring(0, 60)) },
          combined_score: score,
          estimated_impact: 'Khôi phục rating sản phẩm + giảm churn rate',
          estimated_production: '2-4 giờ viết FAQ + template phản hồi review',
          angle: `${revs.length} review tiêu cực gần đây. Tạo FAQ giải đáp + mẫu phản hồi chuẩn cho ${pid}.`,
          _fromDailySummary: true,
          _source: 'mock_review'
        });
      }
    });
  }

  if (newSugs.length === 0) {
    showToast('ℹ️ Không tìm thấy tín hiệu content đủ mạnh để tạo đề xuất mới.', 'info');
    return;
  }

  // Sắp xếp giảm dần theo score
  newSugs.sort((a, b) => b.combined_score - a.combined_score);

  // Inject vào đầu danh sách (trước các suggestion MOCK gốc)
  MOCK.content_suggestions_generated = [...newSugs, ...MOCK.content_suggestions_generated];

  const highCount = newSugs.filter(s => s.priority === 'high').length;

  // Toast thông báo + navigate
  showToast(
    `Đã tạo <strong>${newSugs.length} đề xuất content</strong>${highCount > 0 ? ` (${highCount} ưu tiên cao)` : ''} từ báo cáo — Đang chuyển sang trang Content...`,
    'success'
  );
  setTimeout(() => navigate('content-suggestions'), 700);
}

/* ──────────────────────────────────────────────────────────────────────
   12. INIT
   ────────────────────────────────────────────────────────────────────── */

/* ──────────────────────────────────────────────────────────────────────
   13. GLOBAL EVENT DELEGATION — Wire các nút action toàn trang với backend
   ────────────────────────────────────────────────────────────────────── */

// Intercept chat inbox approval/send buttons → học từ phản hồi của chủ shop
document.addEventListener('click', async function (e) {
  // "Gửi ngay" (duyệt nháp AI không sửa) → gọi learn-feedback
  const acceptBtn = e.target.closest('.btn-chat-accept');
  if (acceptBtn) {
    // Lấy nháp từ MOCK (nếu có) để học
    if (typeof MOCK !== 'undefined' && typeof currentChatId !== 'undefined') {
      const msgs = MOCK.chat_messages[currentChatId] || [];
      const draftMsg = msgs.find(m => m.from === 'ai_draft');
      if (draftMsg && _backendConnected) {
        // Fire-and-forget: AI học từ việc chủ shop approve draft
        apiCall('/learn-feedback', 'POST', { customer_q: currentChatId, human_a: draftMsg.text }, 90000).catch(() => {});
      }
    }
    return; // app4.js handlePageClick xử lý tiếp
  }

  // "Gửi bản đã sửa" → dạy AI từ bản sửa của chủ shop
  const sendEditedBtn = e.target.closest('.btn-chat-send-edited');
  if (sendEditedBtn) {
    if (typeof currentChatId !== 'undefined' && _backendConnected) {
      const ta = document.getElementById('chatDraftEditArea');
      const editedText = ta ? ta.value.trim() : '';
      if (editedText) {
        // Dạy AI: "với câu hỏi này, chủ shop muốn trả lời như vậy"
        apiCall('/learn-feedback', 'POST', { customer_q: currentChatId, human_a: editedText }, 90000).catch(() => {});
      }
    }
    return;
  }
}, true); // useCapture=true để chạy trước handlePageClick của app4.js

document.addEventListener('click', async function (e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id     = btn.dataset.id;

  // ── Duyệt / Từ chối đề xuất AI chiến lược (ai-suggestions page) ──
  if (action === 'approve' || action === 'reject' || action === 'deny') {
    const isApprove = action === 'approve';
    const status = isApprove ? 'approved' : 'declined';
    // Cập nhật MOCK ngay (optimistic)
    if (typeof MOCK !== 'undefined' && Array.isArray(MOCK.suggestions)) {
      const sug = MOCK.suggestions.find(s => String(s.id) === String(id));
      if (sug) sug.status = isApprove ? 'approved' : 'rejected';
    }
    showToast(isApprove ? 'Đã duyệt đề xuất AI!' : 'Đã từ chối đề xuất', isApprove ? 'success' : 'warning');
    // Gọi backend
    sendApprovalToBackend(id || 'unknown', status).catch(() => {});
    // Re-render trang
    setTimeout(() => navigate('ai-suggestions'), 300);
    return;
  }

  // ── Duyệt tin nhắn chat (inbox / pending messages) ──
  if (action === 'chat-approve' || action === 'chat-reject') {
    const convId = btn.dataset.convId || id;
    const editedText = btn.dataset.editedText || '';
    if (typeof MOCK !== 'undefined' && Array.isArray(MOCK.conversations)) {
      const conv = MOCK.conversations.find(c => String(c.id || c.name) === String(convId));
      if (conv) conv.status = action === 'chat-approve' ? 'auto' : 'escalate';
    }
    showToast(action === 'chat-approve' ? '✅ Đã gửi tin nhắn!' : '🔄 Đã chuyển cho agent khác', action === 'chat-approve' ? 'success' : 'info');
    // Ghi log vào backend (fire-and-forget)
    if (editedText) {
      apiCall('/learn-feedback', 'POST', { customer_q: convId, human_a: editedText }, 90000).catch(() => {});
    }
    return;
  }

  // ── Gửi tin nhắn đã chỉnh sửa từ inbox ──
  if (action === 'chat-send-msg') {
    const inputEl = document.getElementById('chatReplyInput') || document.querySelector('.chat-reply-input');
    const msgText = inputEl ? inputEl.value.trim() : '';
    if (!msgText) { showToast('⚠️ Vui lòng nhập tin nhắn', 'warning'); return; }
    showToast('✅ Đã gửi tin nhắn tới khách!', 'success');
    if (inputEl) inputEl.value = '';
    return;
  }

  // ── Duyệt & Gửi phản hồi review (từ review card) ──
  if (action === 'approve-review-reply') {
    const author = btn.dataset.author;
    if (!author) return;
    // Cập nhật MOCK ngay (optimistic)
    const review = typeof MOCK !== 'undefined' ? MOCK.reviews.find(r => r.author === author) : null;
    if (review && review.auto_reply) {
      review.auto_reply.status = 'approved';
    }
    // Cập nhật backend nếu có _db_id
    const dbId = review?.auto_reply?._db_id;
    if (dbId && _backendConnected) {
      apiCall(`/api/review-replies/${dbId}/approve`, 'PATCH').catch(() => {});
    }
    // Đánh dấu conversation đã được gửi
    if (typeof MOCK !== 'undefined') {
      const conv = MOCK.conversations.find(c => c.id === author || c.name === author);
      if (conv) {
        conv.status = 'auto';
        // Chuyển ai_draft → ai_sent trong lịch sử chat
        const msgs = MOCK.chat_messages[author] || [];
        const draftIdx = msgs.findIndex(m => m.from === 'ai_draft');
        if (draftIdx >= 0) {
          const draftText = msgs[draftIdx].text;
          msgs.splice(draftIdx - 1, 2); // Xóa ai_thinking + ai_draft
          const now = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
          msgs.push({ from: 'ai_sent', time: now, text: draftText });
        }
      }
    }
    showToast(`✅ Đã duyệt & gửi phản hồi inbox tới ${author}!`, 'success');
    // Re-render trang reviews
    if (typeof currentPage !== 'undefined' && currentPage === 'reviews') {
      setTimeout(() => _origNavigate('reviews'), 300);
    }
    return;
  }
});

/* ──────────────────────────────────────────────────────────────────────
   13. CHAT INBOX — Load real customers & profiles from backend
   ────────────────────────────────────────────────────────────────────── */

/**
 * Set of customer_ids that exist in the backend DB.
 * Used to distinguish real customers from mock/live-chat entries.
 */
var _backendCustomerIds = new Set();

/** Guard: prevents recursive load loops when navigate('chat') re-renders */
var _chatLoadInProgress = false;

/**
 * Tracks which customer IDs have already had their backend history fetched.
 * Separate from message-length check so live messages don't block history loads.
 */
var _fetchedChatHistory = new Set();

/** Parse a UTC ISO timestamp string from Python (no timezone suffix) as UTC. */
function _parseBackendTs(tsStr) {
  if (!tsStr) return new Date();
  // Python datetime.utcnow().isoformat() produces "2024-05-01T15:16:00.123456"
  // Without a timezone suffix JS parses it as LOCAL — append 'Z' to force UTC.
  var s = tsStr.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(tsStr) ? tsStr : tsStr + 'Z';
  return new Date(s);
}

/**
 * Tải danh sách khách hàng từ /api/customers và merge vào MOCK.conversations.
 * Tính toán status (escalate / pending / auto) từ dữ liệu backend.
 * Nếu customer đã có entry dạng live_ (từ _syncLiveChatToInbox), đổi tên id về canonical.
 */
async function loadChatInboxFromBackend() {
  if (typeof MOCK === 'undefined' || !_backendConnected) return;
  try {
    var data = await apiCall('/api/customers');
    if (!data || data.status !== 'success' || !Array.isArray(data.customers)) return;

    data.customers.forEach(function(c) {
      _backendCustomerIds.add(c.customer_id);

      var churn     = c.churn_probability ?? 0.1;
      var emotion   = c.emotion_index ?? 0.5;
      var status    = churn >= 0.6 ? 'escalate'
                    : c.last_role === 'user' ? 'pending'
                    : 'auto';
      var priority  = status === 'escalate' ? 0 : status === 'pending' ? 1 : 2;
      var sentiment = Math.round(emotion * 100);
      var churnStr  = Math.round(churn * 100) + '%';
      var riskLevel = churn >= 0.6 ? 'high' : churn >= 0.3 ? 'medium' : 'low';

      // Fix timestamp: backend stores UTC without 'Z', so append it before parsing
      var ts      = _parseBackendTs(c.last_timestamp);
      var timeStr = ts.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

      var convObj = {
        id:        c.customer_id,
        name:      c.customer_id,
        avatar:    c.customer_id.charAt(0).toUpperCase(),
        time:      timeStr,
        status:    status,
        unread:    c.last_role === 'user' ? 1 : 0,
        preview:   c.last_message || '...',
        category:  'Chatbot',
        sentiment: sentiment,
        wait_min:  0,
        priority:  priority,
        ltv:       c.total_spent  || 0,
        orders:    c.total_orders || 0,
        platform:  'Chatbot',
        angry:     sentiment < 30,
        vip:       c.customer_segment === 'vip',
        returning: ['vip', 'regular'].includes(c.customer_segment),
        customer: {
          note:      'Phân khúc: ' + (c.customer_segment || 'new') + ' · Churn: ' + churnStr,
          risk:      riskLevel,
          churn:     churnStr,
          purchases: []
        }
      };

      // Check for existing entry — either by canonical id OR the live_ variant created by _syncLiveChatToInbox
      var liveId   = 'live_' + c.customer_id.replace(/\W/g, '_');
      var existing = MOCK.conversations.find(function(conv) { return conv.id === c.customer_id; })
                  || MOCK.conversations.find(function(conv) { return conv.id === liveId; });

      if (existing) {
        // If found under the live_ id, rename it so both the inbox and _syncLiveChatToInbox
        // use the same key going forward — and transfer its messages (which may contain ai_draft).
        if (existing.id === liveId) {
          var liveMsgs = MOCK.chat_messages[liveId];
          if (liveMsgs && liveMsgs.length) {
            // Preserve live messages (ai_draft / ai_thinking) under the canonical id
            MOCK.chat_messages[c.customer_id] = MOCK.chat_messages[c.customer_id]
              ? MOCK.chat_messages[c.customer_id].concat(liveMsgs.filter(function(m) {
                  return m.from === 'ai_draft' || m.from === 'ai_thinking';
                }))
              : liveMsgs;
            delete MOCK.chat_messages[liveId];
          }
          existing.id = c.customer_id;
          // Update currentChatId if it was pointing at the old live_ id
          if (typeof currentChatId !== 'undefined' && currentChatId === liveId) {
            currentChatId = c.customer_id;
          }
        }
        // Merge backend data (timestamp, status, churn, etc.) but keep live messages/status if more urgent
        var keepStatus = (existing.status === 'escalate') ? 'escalate' : convObj.status;
        Object.assign(existing, convObj);
        existing.status = keepStatus;
      } else {
        MOCK.conversations.push(convObj);
      }
    });

    // Set currentChatId to first real customer if it's null or invalid
    if (typeof currentChatId !== 'undefined' &&
        (!currentChatId || !MOCK.conversations.find(function(c) { return c.id === currentChatId; })) &&
        data.customers.length > 0) {
      currentChatId = data.customers[0].customer_id;
    }
  } catch (err) {
    console.warn('[Agicom] loadChatInboxFromBackend:', err.message);
  }
}

/**
 * Tải lịch sử tin nhắn của customerId từ backend vào MOCK.chat_messages.
 * Sử dụng _fetchedChatHistory để chỉ fetch 1 lần — live messages (ai_draft)
 * được giữ nguyên ở cuối mảng sau khi history được prepend vào đầu.
 */
async function _loadChatConvMessagesIntoMock(customerId) {
  if (!_backendConnected || typeof MOCK === 'undefined') return;
  if (_fetchedChatHistory.has(customerId)) return;   // already fetched once
  _fetchedChatHistory.add(customerId);
  try {
    var data = await apiCall('/api/chat-messages/' + encodeURIComponent(customerId));
    if (!data || data.status !== 'success' || !Array.isArray(data.messages)) return;

    var historyMsgs = [];
    data.messages.forEach(function(m) {
      var ts = m.timestamp
        ? _parseBackendTs(m.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        : '';

      if (m.role === 'user') {
        historyMsgs.push({ from: 'customer', time: ts, text: m.content });
        return;
      }

      // --- assistant message ---
      var conf = (m.confidence_score !== undefined && m.confidence_score !== null)
        ? Math.round(m.confidence_score * 100)
        : null;
      var isSafe = m.is_safe;   // true | false | null
      var sentiment = m.sentiment || '';

      if (isSafe === false) {
        // Tin nhắn bị escalate — hiện ô phân tích + nháp chờ duyệt
        historyMsgs.push({
          from: 'ai_thinking',
          text: 'AI phân tích ngữ cảnh và tìm kiếm trong knowledge base...',
          context: [
            conf !== null ? ('Confidence: ' + conf + '%') : 'Confidence: —',
            sentiment ? ('Cảm xúc: ' + sentiment) : 'Cảm xúc: bình thường',
            'is_safe: ❌ Cần duyệt thủ công'
          ]
        });
        historyMsgs.push({
          from: 'ai_draft',
          time: ts,
          text: m.content,
          confidence: conf
        });
      } else {
        // Tin nhắn tự động (is_safe=true) hoặc không có metadata (DB cũ)
        historyMsgs.push({
          from: 'ai_sent',
          time: ts,
          text: m.content,
          confidence: conf,
          is_safe: isSafe   // true hoặc null
        });
      }
    });

    // Giữ lại các tin nhắn live (ai_draft / ai_thinking) được thêm VÀO trong phiên hiện tại,
    // nhưng loại bỏ những tin nào mà nội dung đã có trong history (tránh hiện đôi).
    var existing = MOCK.chat_messages[customerId] || [];
    var historyTexts = new Set(
      historyMsgs.filter(function(m) { return m.from === 'ai_draft' || m.from === 'ai_sent'; })
                 .map(function(m) { return m.text; })
    );
    // Chỉ giữ lại live messages mà nội dung CHƯA xuất hiện trong history
    var liveMsgs = existing.filter(function(m) {
      if (m.from !== 'ai_draft' && m.from !== 'ai_thinking') return false;
      if (m.from === 'ai_draft' && historyTexts.has(m.text)) return false;
      return true;
    });

    MOCK.chat_messages[customerId] = historyMsgs.concat(liveMsgs);
  } catch (err) {
    _fetchedChatHistory.delete(customerId); // allow retry on error
    console.warn('[Agicom] _loadChatConvMessagesIntoMock:', err.message);
  }
}

/**
 * Tải hồ sơ khách hàng đầy đủ từ backend và render vào #chatConvProfileWrapper
 * (thay thế nội dung mặc định từ MOCK).
 */
async function _loadChatConvProfile(customerId) {
  var wrapper = document.getElementById('chatConvProfileWrapper');
  if (!wrapper || !_backendConnected) return;
  try {
    var data = await apiCall('/api/customer-profile/' + encodeURIComponent(customerId));
    if (!data || data.status !== 'success') return;

    var churn  = data.churn_probability ?? 0.1;
    var emotion = data.emotion_index ?? 0.5;
    var churnColor = churn >= 0.6 ? 'var(--accent-rose)'
                   : churn >= 0.3 ? 'var(--accent-amber)'
                   : 'var(--accent-emerald)';
    var churnBg    = churn >= 0.6 ? 'var(--accent-rose-bg)'
                   : churn >= 0.3 ? 'var(--accent-amber-bg)'
                   : 'var(--accent-emerald-bg)';
    var emotionColor = emotion >= 0.6 ? 'var(--accent-emerald)'
                     : emotion >= 0.3 ? 'var(--accent-amber)'
                     : 'var(--accent-rose)';
    var emotionLabel = emotion >= 0.8 ? 'Rất tích cực'
                     : emotion >= 0.6 ? 'Tích cực'
                     : emotion >= 0.4 ? 'Bình thường'
                     : emotion >= 0.2 ? 'Tiêu cực' : 'Rất tiêu cực';

    var segmentBadgeMap = {
      vip:     '<span style="background:#7c3aed;color:white;font-size:0.65rem;padding:2px 8px;border-radius:10px;font-weight:800;">👑 VIP</span>',
      regular: '<span style="background:#2563eb;color:white;font-size:0.65rem;padding:2px 8px;border-radius:10px;font-weight:700;">⭐ Quen</span>',
      at_risk: '<span style="background:#dc2626;color:white;font-size:0.65rem;padding:2px 8px;border-radius:10px;font-weight:700;">⚠️ Rủi ro</span>',
      new:     '<span style="background:#059669;color:white;font-size:0.65rem;padding:2px 8px;border-radius:10px;font-weight:700;">🆕 Mới</span>'
    };
    var segmentBadge = segmentBadgeMap[data.customer_segment] || '';

    var purchases = (data.purchase_history || []).slice(0, 3);
    var purchaseHtml = purchases.length
      ? purchases.map(function(p) {
          return '<div style="display:flex;justify-content:space-between;align-items:center;' +
            'padding:6px 0;border-bottom:1px solid var(--border-primary);font-size:0.78rem;">' +
            '<div><div style="font-weight:600;">' + (p.item || '?') + '</div>' +
            '<div style="color:var(--text-muted);">' + (p.date || '') +
              (p.status ? ' · ' + p.status : '') + '</div></div>' +
            '<div style="font-weight:700;color:var(--accent-indigo);">' +
              (p.value ? Number(p.value).toLocaleString('vi-VN') + 'đ' : '—') + '</div></div>';
        }).join('')
      : '<div style="color:var(--text-muted);font-size:0.78rem;padding:4px 0;">Chưa có lịch sử mua hàng</div>';

    var lastPurchaseHtml = data.last_purchase_date
      ? '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:6px;">Lần mua cuối: ' + data.last_purchase_date + '</div>'
      : '';

    var noteHtml = data.notes
      ? '<div style="font-size:0.75rem;padding:8px;background:var(--accent-indigo-bg);border-radius:6px;' +
        'color:var(--accent-indigo);margin-top:10px;line-height:1.5;">🧠 ' + data.notes + '</div>'
      : '';

    wrapper.innerHTML =
      '<!-- Customer Profile -->' +
      '<div class="content-card" style="padding:14px;">' +
        '<div style="font-weight:700;font-size:0.82rem;color:var(--text-muted);margin-bottom:10px;' +
          'text-transform:uppercase;letter-spacing:0.5px;">Hồ sơ khách hàng</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
          '<div style="display:flex;gap:10px;align-items:center;">' +
            '<div style="width:40px;height:40px;border-radius:50%;background:var(--gradient-primary);' +
              'display:flex;align-items:center;justify-content:center;font-weight:800;color:#451a03;flex-shrink:0;">' +
              customerId.charAt(0).toUpperCase() + '</div>' +
            '<div>' +
              '<div style="font-weight:700;font-size:0.9rem;">' + customerId + '</div>' +
              '<div style="font-size:0.72rem;color:var(--text-muted);">' + (data.total_orders ?? 0) + ' đơn hàng</div>' +
            '</div>' +
          '</div>' +
          segmentBadge +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">' +
          '<div style="background:var(--bg-glass);border-radius:8px;padding:8px;text-align:center;">' +
            '<div style="font-size:1rem;font-weight:800;color:var(--accent-amber);">' +
              (data.total_spent ? Number(data.total_spent).toLocaleString('vi-VN') : '0') + 'đ</div>' +
            '<div style="font-size:0.68rem;color:var(--text-muted);">Tổng chi tiêu</div>' +
          '</div>' +
          '<div style="background:' + churnBg + ';border-radius:8px;padding:8px;text-align:center;">' +
            '<div style="font-size:1rem;font-weight:800;color:' + churnColor + ';">' + Math.round(churn * 100) + '%</div>' +
            '<div style="font-size:0.68rem;color:var(--text-muted);">Xác suất rời bỏ</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
          '<div style="background:var(--bg-glass);border-radius:8px;padding:8px;text-align:center;">' +
            '<div style="font-size:1rem;font-weight:800;color:' + emotionColor + ';">' + Math.round(emotion * 100) + '</div>' +
            '<div style="font-size:0.68rem;color:var(--text-muted);">Cảm xúc</div>' +
            '<div style="font-size:0.65rem;color:' + emotionColor + ';">' + emotionLabel + '</div>' +
          '</div>' +
          '<div style="background:var(--bg-glass);border-radius:8px;padding:8px;text-align:center;">' +
            '<div style="font-size:0.9rem;font-weight:800;color:var(--accent-indigo);">' +
              (data.customer_segment || 'new') + '</div>' +
            '<div style="font-size:0.68rem;color:var(--text-muted);">Phân khúc</div>' +
          '</div>' +
        '</div>' +
        noteHtml +
      '</div>' +
      '<!-- Purchase History -->' +
      '<div class="content-card" style="padding:14px;">' +
        '<div style="font-weight:700;font-size:0.82rem;color:var(--text-muted);margin-bottom:10px;' +
          'text-transform:uppercase;letter-spacing:0.5px;">Lịch sử mua hàng</div>' +
        purchaseHtml +
        lastPurchaseHtml +
      '</div>';
  } catch (err) {
    console.warn('[Agicom] _loadChatConvProfile:', err.message);
  }
}

/**
 * Bước tải đầy đủ sau khi navigate('chat') render xong:
 * 1. Tải inbox list từ backend  (merge vào MOCK.conversations)
 * 2. Tải messages của conv đang xem (cache vào MOCK.chat_messages)
 * 3. Re-render trang chat một lần với dữ liệu đã merge
 * 4. Tải hồ sơ chi tiết vào #chatConvProfileWrapper
 */
async function _postRenderChat(origNav) {
  if (_chatLoadInProgress || !_backendConnected) return;
  _chatLoadInProgress = true;
  try {
    await loadChatInboxFromBackend();
    var cid = (typeof currentChatId !== 'undefined') ? currentChatId : null;
    if (cid) await _loadChatConvMessagesIntoMock(cid);
    // Re-render với dữ liệu mới — dùng origNav để không kích hoạt lại _postRenderChat
    origNav('chat');
    // Sau khi DOM được cập nhật, load hồ sơ vào #chatConvProfileWrapper
    if (cid && _backendCustomerIds.has(cid)) {
      _loadChatConvProfile(cid);
    }
  } catch (err) {
    console.warn('[Agicom] _postRenderChat:', err.message);
  } finally {
    _chatLoadInProgress = false;
  }
}

/**
 * Wrap navigate() để hook vào sự kiện chuyển trang Chat Inbox.
 * Chạy sau khi app4.js đã định nghĩa navigate.
 */
(function _wrapNavigateForChatInbox() {
  if (typeof navigate !== 'function') {
    // Thử lại sau 500ms nếu app4.js chưa load xong
    setTimeout(_wrapNavigateForChatInbox, 500);
    return;
  }
  var _origNav = navigate;

  navigate = function(page) {
    _origNav(page);
    if (page === 'chat') {
      // Async post-render — không block synchronous navigate
      setTimeout(function() { _postRenderChat(_origNav); }, 0);
    }
  };
  window.navigate = navigate;

  // Nếu trang đang ở chat khi script load (ví dụ reload từ URL)
  if (typeof currentPage !== 'undefined' && currentPage === 'chat') {
    setTimeout(function() { _postRenderChat(_origNav); }, 200);
  }
})();

/**
 * Khi click chọn một conversation (data-conv), load profile ngay
 * vào #chatConvProfileWrapper sau khi navigate('chat') render xong.
 */
document.addEventListener('click', function(e) {
  var convEl = e.target.closest('[data-conv]');
  if (!convEl) return;
  var convId = convEl.dataset.conv;
  if (!convId || !_backendCustomerIds.has(convId)) return;
  // app4.js bubble handler đã gọi navigate('chat') trước chúng ta (đã đăng ký trước).
  // DOM đã được render, dùng setTimeout để chờ _postRenderChat hoàn thành.
  setTimeout(function() {
    _loadChatConvProfile(convId);
  }, 120);
}); // bubble phase (mặc định): chạy sau handler app4.js

/* ──────────────────────────────────────────────────────────────────────
   13b. SETTINGS SAVE — Lưu thay đổi hồ sơ doanh nghiệp & cấu hình AI
   ────────────────────────────────────────────────────────────────────── */

document.addEventListener('click', function (e) {
  // "Lưu thay đổi" button — chỉ trong settings page
  const saveBtn = e.target.closest('.btn-approve');
  if (!saveBtn) return;
  // Phải nằm trong một .content-card bên trong #mainContent khi đang ở settings
  const card = saveBtn.closest('.content-card');
  if (!card) return;

  // Business tab save
  const shopNameInput = card.querySelector('input.settings-input[value], input.settings-input');
  const titleEl = card.querySelector('.content-card-title');
  if (!titleEl) return;

  const titleText = titleEl.textContent.trim();

  if (titleText === 'Hồ sơ doanh nghiệp') {
    // Đọc tất cả input fields trong card
    const inputs = card.querySelectorAll('input.settings-input, textarea.settings-input, select.settings-input');
    let newShopName = null;
    inputs.forEach(inp => {
      const label = inp.closest('.settings-field')?.querySelector('.settings-label')?.textContent.trim();
      if (label === 'Tên shop') newShopName = inp.value.trim();
    });

    if (newShopName && newShopName.length > 0) {
      // Cập nhật profile cache
      if (!_shopProfile) _shopProfile = {};
      _shopProfile.shop_name = newShopName;
      // Tạo initials mới
      const words = newShopName.replace(/^shop\s*/i, '').split(/\s+/);
      _shopProfile.initials = words.map(w => w[0]?.toUpperCase() || '').join('').slice(0, 2) || 'GF';
      // Cập nhật sidebar
      _updateSidebarProfile(_shopProfile);
      // Cập nhật MOCK.shop.name
      if (typeof MOCK !== 'undefined' && MOCK.shop) MOCK.shop.name = newShopName;
    }
    showToast('✅ Đã lưu hồ sơ doanh nghiệp!', 'success');
    return;
  }

  if (titleText === 'Dữ liệu định hướng cho AI Agent') {
    // Đọc và lưu cấu hình AI vào _shopProfile để pricing agent dùng
    const inputs = card.querySelectorAll('input.settings-input, textarea.settings-input, select.settings-input');
    if (!_shopProfile) _shopProfile = {};
    inputs.forEach(inp => {
      const label = inp.closest('.settings-field')?.querySelector('.settings-label')?.textContent.trim();
      if (label === 'Khách hàng mục tiêu')      _shopProfile.target_customers   = inp.value.trim();
      if (label === 'Định hướng chiến lược')     _shopProfile.strategic_vision   = inp.value.trim();
      if (label === 'Tone Chatbot')              _shopProfile.brand_tone         = inp.value.trim();
      if (label === 'Ngưỡng biên LN tối thiểu (%)') {
        if (typeof MOCK !== 'undefined' && MOCK.shop) MOCK.shop.margin_floor = parseFloat(inp.value) || MOCK.shop.margin_floor;
      }
    });
    showToast('✅ Đã lưu cấu hình AI Agent!', 'success');
    return;
  }
});

/* ──────────────────────────────────────────────────────────────────────
   14. INIT
   ────────────────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', function () {
  // Kiểm tra kết nối backend sau khi trang load
  setTimeout(checkBackendHealth, 1800);
  // Load shop profile — dùng setTimeout đủ dài để health check chạy trước
  // Nếu backend online, _backendConnected sẽ là true sau ~2-3s
  setTimeout(async function () {
    await _loadShopProfile();
  }, 3500);
});

console.log(
  '%c🚀 Agicom API Integration v1.0 loaded',
  'color:#eab308;font-weight:bold;font-size:13px;'
);
console.log('%cBackend URL:', 'color:#94a3b8', API_BASE);
console.log(
  '%cĐể đổi backend URL, set: window.AGICOM_API_BASE = "https://your-backend.com"',
  'color:#94a3b8;font-style:italic'
);
