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

async function apiCall(endpoint, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(API_BASE + endpoint, opts);
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`HTTP ${res.status}: ${errText}`);
  }
  return res.json();
}

/* ──────────────────────────────────────────────────────────────────────
   3. HEALTH CHECK — Kiểm tra kết nối khi trang tải
   ────────────────────────────────────────────────────────────────────── */

async function checkBackendHealth() {
  try {
    const data = await apiCall('/health');
    if (data.status === 'healthy') {
      _backendConnected = true;
      showToast('🟢 Backend kết nối thành công! Tất cả tính năng AI đang hoạt động.', 'success');
      // Cập nhật indicator ở header
      const indicator = document.getElementById('backendStatusIndicator');
      if (indicator) {
        indicator.textContent = '🟢 Backend Online';
        indicator.style.color = 'var(--accent-emerald)';
      }
    }
  } catch (err) {
    _backendConnected = false;
    showToast('🟡 Backend chưa kết nối — Đang chạy chế độ Demo (dữ liệu mẫu)', 'warning');
    console.warn('[Agicom] Backend không khả dụng:', err.message);
    const indicator = document.getElementById('backendStatusIndicator');
    if (indicator) {
      indicator.textContent = '🔴 Backend Offline (Demo Mode)';
      indicator.style.color = 'var(--accent-rose)';
    }
  }
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

    const result = await apiCall('/slow-track-strategy', 'POST', {
      product_id: 'S24-ULTRA-001',
      product_name: 'Samsung Galaxy S24 Ultra',
      internal_data: {
        current_price: 29990000,
        stock_level: 12,
        cost_price: 26000000,
        min_margin_percent: 8,
        conversion_rate: 0.05,
      },
      market_data: {
        competitor_min_price: 28490000,
        market_trend: 'Đối thủ giảm giá mạnh tuần này',
        competitor_name: 'Hoàng Hà',
        competitor_rating: 4.5,
        our_rating: 4.8,
        platform_campaign: 'None',
      },
      customer_context: {
        recent_sentiment: 'phân vân',
        frequent_question: 'Pin S24 Ultra dùng được bao lâu?',
      },
      shop_profile: {
        target_customers:
          'Học sinh sinh viên, nhân viên văn phòng yêu công nghệ, thu nhập 8-25 triệu/tháng',
        strategic_vision: 'Tối ưu lợi nhuận dài hạn, cạnh tranh về chất lượng dịch vụ',
        brand_tone: 'Chuyên nghiệp, nhiệt tình',
      },
      manager_directive: directive,
    });

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
        author: r.customer_name || 'Ẩn danh',
        date: new Date(r.timestamp).toLocaleDateString('vi-VN'),
        rating: r.rating,
        text: r.review_text,
        tag:
          r.rating >= 4
            ? { type: 'pos', label: r.ai_insight || 'Phản hồi tích cực' }
            : { type: 'neg', label: r.ai_insight || 'Cần cải thiện' },
        fromDB: true,
      }));

      // Gộp: DB reviews đứng đầu, sau đó mock reviews
      MOCK.reviews = [...dbReviews, ...MOCK.reviews.filter((r) => !r.fromDB)];

      showToast(`📥 Đã tải ${data.total_fetched} review từ database`, 'info');

      // Re-render nếu đang ở trang reviews
      if (typeof currentPage !== 'undefined' && currentPage === 'reviews') {
        navigate('reviews');
      }
    } else {
      showToast('Chưa có review nào trong database (dùng form bên dưới để thêm)', 'info');
    }
  } catch (err) {
    showToast('Không thể tải reviews từ backend: ' + err.message, 'warning');
    console.warn('[Agicom] Reviews API lỗi:', err.message);
  }
}

async function submitReviewToAPI(formData) {
  try {
    const result = await apiCall('/learn-from-review', 'POST', formData);
    showToast('✅ Review đã gửi! AI đang phân tích và học hỏi từ dữ liệu này.', 'success');
    // Tải lại reviews sau 1.5 giây
    setTimeout(loadReviewsFromAPI, 1500);
    return result;
  } catch (err) {
    showToast('❌ Lỗi gửi review: ' + err.message, 'danger');
    throw err;
  }
}

/* ──────────────────────────────────────────────────────────────────────
   6. LIVE CHAT — /chat-v3
   ────────────────────────────────────────────────────────────────────── */

let liveChatCustomerId =
  'demo_customer_' + Math.random().toString(36).substring(2, 8);

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
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <span style="font-size:0.7rem;background:var(--accent-emerald-bg);color:var(--accent-emerald);padding:3px 10px;border-radius:6px;font-weight:600;">
            ID: ${liveChatCustomerId}
          </span>
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
          'Mua 3 cái có giảm không?',
          'Cáp bị hỏng rồi shop ơi!',
          'Pin S24 Ultra dùng được bao lâu?',
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
    const conf = meta.confidence_score !== undefined ? Math.round(meta.confidence_score * 100) : null;
    const safe = meta.is_safe;
    const sentiment = meta.sentiment_analysis;

    const metaBadges =
      !isUser && conf !== null
        ? `<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">
            <span style="font-size:0.67rem;padding:2px 6px;border-radius:4px;
              background:${conf >= 70 ? 'var(--accent-emerald-bg)' : 'var(--accent-rose-bg)'};
              color:${conf >= 70 ? 'var(--accent-emerald)' : 'var(--accent-rose)'};">
              Confidence: ${conf}%
            </span>
            <span style="font-size:0.67rem;padding:2px 6px;border-radius:4px;
              background:${safe ? 'var(--accent-emerald-bg)' : 'var(--accent-rose-bg)'};
              color:${safe ? 'var(--accent-emerald)' : 'var(--accent-rose)'};">
              ${safe ? '✅ Tự động' : '⚠ Chờ duyệt'}
            </span>
            ${
              sentiment
                ? `<span style="font-size:0.67rem;padding:2px 6px;border-radius:4px;
                    background:var(--bg-glass);color:var(--text-muted);">
                    😶 ${sentiment}
                  </span>`
                : ''
            }
          </div>`
        : '';

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
    });

    const elapsed = Date.now() - t0;
    const thinking = document.getElementById('liveChatThinkingBubble');
    if (thinking) thinking.remove();

    if (result && result.reply) {
      const eval_ = result.ai_evaluation || {};
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
    } else {
      appendLiveChatBubble('ai', 'Dạ em đang gặp chút trục trặc, anh/chị thử lại nhé ạ 🙏');
    }
  } catch (err) {
    const thinking = document.getElementById('liveChatThinkingBubble');
    if (thinking) thinking.remove();
    appendLiveChatBubble(
      'ai',
      '⚠️ Không thể kết nối backend. Vui lòng kiểm tra server đang chạy tại ' + API_BASE,
      { is_safe: false, confidence_score: 0 }
    );
    console.warn('[Agicom] Chat API lỗi:', err.message);
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
        <div style="display:flex;gap:8px;">
          <button onclick="exportDailySummary()" class="btn-approve" style="font-size:0.76rem;padding:6px 12px;">
            📤 Xuất & Lưu trữ
          </button>
          <button onclick="loadDailySummary()" class="btn-modal-cancel" style="font-size:0.76rem;padding:6px 12px;">
            🔄 Làm mới
          </button>
        </div>
      </div>
    `;
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
    await apiCall('/system/reset-all', 'POST');
    showToast('✅ Đã reset toàn bộ dữ liệu AI về trạng thái trắng.', 'success');
  } catch (err) {
    showToast('❌ Lỗi reset: ' + err.message, 'danger');
    console.warn('[Agicom] Reset API lỗi:', err.message);
  }
}

/* ──────────────────────────────────────────────────────────────────────
   10. INJECT UI VÀO CÁC TRANG — Override navigate()
   ────────────────────────────────────────────────────────────────────── */

const _origNavigate = navigate;

navigate = function (page) {
  _origNavigate(page);

  // Inject thêm UI sau khi page render xong
  setTimeout(() => {
    if (page === 'dashboard') {
      injectDailySummaryCard();
    } else if (page === 'reviews') {
      injectReviewForm();
      loadReviewsFromAPI();
    } else if (page === 'chat') {
      injectLiveChatWidget();
    } else if (page === 'settings') {
      injectResetButton();
    }
  }, 80);
};

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
        <label class="settings-label">ID Sản phẩm</label>
        <input id="rev_product_id" class="settings-input" value="S24-ULTRA-001"
          placeholder="VD: ANKER-100W-CAP">
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

  // Load chatbot features & quality data from backend
  loadChatbotFeatures();
}

/* ── Load Chatbot Features & Quality từ backend ── */
async function loadChatbotFeatures() {
  const el = document.getElementById('chatbotFeaturesContent');
  if (!el) return;

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
   12. INIT
   ────────────────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', function () {
  // Kiểm tra kết nối backend sau khi trang load
  setTimeout(checkBackendHealth, 1800);
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
