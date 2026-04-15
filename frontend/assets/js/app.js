/**
 * @file app.js
 * @description Main application entry point.
 *
 * Integrates with the FastAPI + ChromaDB backend via the apiClient module.
 * Falls back to MOCK data gracefully when the backend is unreachable so the
 * demo UI never breaks completely during a presentation.
 */

import { MOCK_STRATEGIES, MOCK_CHAT_SESSIONS } from './data/mockData.js';
import { showToast } from './utils/helpers.js';
import * as Views from './views/pages.js';
import {
    checkBackendHealth,
    observeAndThink,
    actAndLearn,
    getDailySummary,
    fastTrackChatV2,
    learnFromHuman,
} from './api/apiClient.js';

// ---------------------------------------------------------------------------
// Global Application State
// ---------------------------------------------------------------------------
let appState = {
    currentPage: 'dashboard',
    /** Starts with mock strategies; replaced/extended by live API data */
    strategies: JSON.parse(JSON.stringify(MOCK_STRATEGIES)),
    activeGuidanceCmd: null,
    isScanning: false,
    aiLearned: 47,
    /** True whilst any API call is in flight */
    isLoading: false,
    /** True when /daily-summary succeeded on init */
    backendOnline: false,
    /** Daily summary fetched on init */
    dailySummary: null,
};

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
async function init() {
    setupNav();
    setupGuidanceToolbar();
    setupModalsAndOverlays();
    renderPage('dashboard');

    // Deferred: check backend connectivity + load daily summary
    setTimeout(async () => {
        await initBackendConnection();
    }, 400);

    setTimeout(() => {
        showToast('info', '👋 Chào mừng bạn quay lại, Shop PhoneMax!');
    }, 800);
}

/**
 * Ping the backend, show connection banner, and pre-fetch the daily summary.
 */
async function initBackendConnection() {
    appState.backendOnline = await checkBackendHealth();

    if (appState.backendOnline) {
        showToast('success', '🟢 Đã kết nối backend Agicom thành công!');
        // Pre-load daily summary – show it if on dashboard
        try {
            appState.dailySummary = await getDailySummary();
            if (appState.currentPage === 'dashboard') {
                renderPage('dashboard');
            }
        } catch (err) {
            console.warn('[Agicom] Could not fetch daily summary:', err.message);
        }
    } else {
        showToast(
            'warning',
            '🔴 Không kết nối được Backend. Đang dùng dữ liệu Demo.',
        );
        showOfflineBanner();
    }
}

/**
 * Inserts a non-blocking offline notice at the top of the main content area.
 */
function showOfflineBanner() {
    const existing = document.getElementById('offlineBanner');
    if (existing) return;
    const banner = document.createElement('div');
    banner.id = 'offlineBanner';
    banner.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
        background: linear-gradient(90deg, #b45309, #92400e);
        color: #fef3c7; font-size: 0.82rem; font-weight: 600;
        padding: 6px 16px; text-align: center; letter-spacing: 0.02em;
    `;
    banner.innerHTML =
        '⚠️ Backend offline – UI đang dùng dữ liệu mẫu. Khởi động FastAPI để trải nghiệm đầy đủ.';
    document.body.prepend(banner);
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
function setupNav() {
    const navItems = document.querySelectorAll('.nav-item[data-page]');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            renderPage(item.dataset.page);
        });
    });
}

// ---------------------------------------------------------------------------
// Page Renderer
// ---------------------------------------------------------------------------
function renderPage(pageId) {
    appState.currentPage = pageId;
    const container = document.getElementById('pageContent');

    const titles = {
        dashboard:  { title: 'Dashboard',                sub: 'Tổng quan chiến lược AI' },
        revenue:    { title: 'Doanh thu & Chi phí',      sub: 'Phân tích tài chính thời gian thực' },
        inventory:  { title: 'Quản lý Tồn kho',          sub: 'Cảnh báo và tối ưu vòng quay vốn' },
        competitor: { title: 'Phân tích Đối thủ',        sub: 'So sánh giá & Market share' },
        market:     { title: 'Tổng quan Thị trường',     sub: 'Trending Keywords & Demand' },
        reviews:    { title: 'Review Sản phẩm',          sub: 'Sentiment Analysis từ khách hàng' },
        media:      { title: 'Media & Quảng cáo',        sub: 'Hiệu suất Ads và Content (Shopee & TikTok)' },
        chat:       { title: 'Chat AI Inbox',             sub: 'Hệ thống tự động phân loại và phản hồi' },
        settings:   { title: 'Cài đặt & Hồ sơ',         sub: 'Cấu hình Agent' },
    };

    if (titles[pageId]) {
        document.getElementById('pageTitle').textContent = titles[pageId].title;
        document.getElementById('pageSubtitle').textContent =
            titles[pageId].sub +
            ' – Cập nhật lúc ' +
            new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    }

    switch (pageId) {
        case 'dashboard':
            container.innerHTML = Views.renderDashboardHTML(appState);
            break;
        case 'revenue':
            container.innerHTML = Views.renderRevenueHTML();
            break;
        case 'inventory':
            container.innerHTML = Views.renderInventoryHTML();
            break;
        case 'competitor':
            container.innerHTML = Views.renderCompetitorHTML();
            break;
        case 'market':
            container.innerHTML = Views.renderMarketHTML();
            break;
        case 'reviews':
            container.innerHTML = Views.renderReviewsHTML();
            break;
        case 'media':
            container.innerHTML = Views.renderMediaHTML();
            break;
        case 'settings':
            container.innerHTML = Views.renderSettingsHTML();
            break;
        case 'chat':
            container.innerHTML = Views.renderChatInboxHTML();
            setupChatInput(); // wire up the live chat send button
            const detail = document.getElementById('chatDetailContainer');
            if (detail) detail.innerHTML = Views.renderChatDetail(1);
            break;
        default:
            container.innerHTML = '<div class="content-card">Coming soon...</div>';
    }
}

// ---------------------------------------------------------------------------
// Loading state helpers
// ---------------------------------------------------------------------------

/**
 * Show a fullscreen-style loading overlay on a specific element.
 * @param {HTMLElement} el
 * @param {string} [msg]
 */
function showLoadingIn(el, msg = 'AI đang xử lý...') {
    el.innerHTML = `
        <div style="
            display:flex; flex-direction:column; align-items:center;
            justify-content:center; gap:14px; padding:48px 24px;
            color:var(--text-secondary); font-size:0.95rem;
        ">
            <div class="spinner" style="
                width:36px; height:36px; border:3px solid var(--border-primary);
                border-top-color:var(--accent-indigo); border-radius:50%;
                animation:spin 0.8s linear infinite;
            "></div>
            <span>${msg}</span>
        </div>`;
}

/**
 * Disable/enable a button with a loading label.
 */
function setButtonLoading(btn, loading, originalText) {
    btn.disabled = loading;
    btn.textContent = loading ? '⏳ Đang xử lý...' : originalText;
}

// ---------------------------------------------------------------------------
// Guidance Toolbar – Strategy pipeline
// ---------------------------------------------------------------------------
function setupGuidanceToolbar() {
    const input    = document.getElementById('guidanceInput');
    const sendBtn  = document.getElementById('guidanceSendBtn');
    const tags     = document.querySelectorAll('.guidance-tag');
    const activeBox = document.getElementById('guidanceActiveCmd');
    const activeTxt = document.getElementById('guidanceActiveCmdText');
    const clearBtn  = document.getElementById('guidanceClearBtn');

    tags.forEach(t => t.addEventListener('click', () => (input.value = t.dataset.cmd)));

    async function submitCmd() {
        const cmd = input.value.trim();
        if (!cmd) return;

        appState.activeGuidanceCmd = cmd;
        activeTxt.textContent = cmd;
        activeBox.style.display = 'flex';
        input.value = '';

        // Show optimistic feedback immediately
        showToast('info', '🧭 Đã gửi chỉ thị chiến lược cho AI. Đang phân tích...');
        setButtonLoading(sendBtn, true, 'Gửi cho AI ➜');

        if (appState.backendOnline) {
            // --------------------------------------------------------
            // LIVE: Call POST /observe-and-think with a sample payload
            // --------------------------------------------------------
            try {
                const payload = {
                    market_trend: 'Tăng',
                    manager_directive: cmd,
                    competitor_min_price: 27500000,
                    competitor_name: 'MobileWorld',
                };
                const result = await observeAndThink(payload);

                // Build a new strategy card from the live response
                const liveStrategy = {
                    id: 'strat-live-' + Date.now(),
                    type: 'pricing',
                    status: 'pending',
                    confidence: 90,
                    impact: 'high',
                    title: 'Phản hồi chỉ thị (Live AI)',
                    description:
                        result?.data?.details ||
                        result?.data?.strategy ||
                        `AI đã phân tích chỉ thị: "${cmd}".`,
                    _apiResult: result,
                };

                appState.strategies.unshift(liveStrategy);
                showToast('success', '✨ AI đã phản hồi chỉ thị (Live từ Backend)!');
            } catch (err) {
                console.error('[Agicom] /observe-and-think error:', err);
                showToast('error', `❌ Lỗi backend: ${err.message}`);
                _addFallbackStrategy(cmd);
            }
        } else {
            // --------------------------------------------------------
            // OFFLINE FALLBACK: simulate with a timeout (original logic)
            // --------------------------------------------------------
            await new Promise(r => setTimeout(r, 2000));
            _addFallbackStrategy(cmd);
        }

        setButtonLoading(sendBtn, false, 'Gửi cho AI ➜');

        if (appState.currentPage === 'dashboard') {
            renderPage('dashboard');
        }
    }

    /** Injects a mock strategy card (fallback when backend is offline) */
    function _addFallbackStrategy(cmd) {
        appState.strategies.unshift({
            id: 'strat-new-' + Date.now(),
            type: 'pricing',
            status: 'pending',
            confidence: 96,
            impact: 'high',
            title: 'Phản hồi chỉ thị: Điều chỉnh chiến lược',
            description: `AI đã nhận chỉ thị: "${cmd}". Đề xuất action phù hợp.`,
        });
        showToast('success', '✨ AI đã phản hồi chỉ thị (Demo mode)!');
    }

    sendBtn.addEventListener('click', submitCmd);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submitCmd(); });

    clearBtn.addEventListener('click', () => {
        appState.activeGuidanceCmd = null;
        activeBox.style.display = 'none';
        showToast('success', 'Đã hủy chỉ thị chiến lược. AI trở về chế độ tối ưu tự động.');
    });
}

// ---------------------------------------------------------------------------
// Market Scan Button
// ---------------------------------------------------------------------------
function setupModalsAndOverlays() {
    const overlay = document.getElementById('scanOverlay');
    const btnScan = document.getElementById('btnScan');

    btnScan.addEventListener('click', async () => {
        if (appState.isScanning) return;
        appState.isScanning = true;
        btnScan.classList.add('scanning');
        overlay.classList.add('show');

        const pb = overlay.querySelector('.scan-progress-bar');
        pb.style.animation = 'none';
        pb.offsetHeight; // reflow trick
        pb.style.animation = 'scanProgress 3s forwards';

        if (appState.backendOnline) {
            // Fetch daily summary from the live backend during the "scan" animation
            try {
                appState.dailySummary = await getDailySummary();
            } catch (err) {
                console.warn('[Agicom] /daily-summary during scan failed:', err.message);
            }
        }

        // Always wait at least 3s so the animation completes
        await new Promise(r => setTimeout(r, 3000));

        overlay.classList.remove('show');
        btnScan.classList.remove('scanning');
        appState.isScanning = false;

        if (appState.backendOnline && appState.dailySummary) {
            const insight = appState.dailySummary.top_insights?.[0] || 'Dữ liệu thị trường đã được cập nhật.';
            showToast('success', `📊 Quét hoàn tất (Live): ${insight}`);
        } else {
            showToast('success', 'Quét hoàn tất: Phát hiện luồng traffic mới.');
        }

        if (appState.currentPage === 'dashboard') renderPage('dashboard');
    });

    // Feedback modal (deny strategy)
    const modal  = document.getElementById('feedbackModal');
    document.getElementById('modalCloseBtn').onclick  = () => modal.classList.remove('show');
    document.getElementById('modalCancelBtn').onclick = () => modal.classList.remove('show');

    const text = document.getElementById('feedbackText');
    const sub  = document.getElementById('modalSubmitBtn');
    text.oninput = () => (sub.disabled = text.value.trim() === '');

    sub.onclick = async () => {
        const s = appState.strategies.find(x => x.id === appState._denyTarget);
        if (!s) return;

        const feedback = text.value.trim();
        s.status   = 'denied';
        s.feedback = feedback;
        modal.classList.remove('show');
        text.value = '';

        showToast('error', `Đã từ chối chiến lược: ${s.title}`);
        renderPage('dashboard');

        // Notify backend asynchronously – fire-and-forget (don't block UI)
        if (appState.backendOnline) {
            try {
                await actAndLearn(s.id, 'declined', feedback);
                showToast('info', '🧠 Backend đã ghi nhận quyết định từ chối.');
            } catch (err) {
                console.warn('[Agicom] /act-and-learn error (deny):', err.message);
            }
        }
    };
}

// ---------------------------------------------------------------------------
// Chat Inbox – live submit handler
// ---------------------------------------------------------------------------
/**
 * Sets up the send button inside the chat detail view for live API calls.
 * Called every time the chat page is rendered.
 */
function setupChatInput() {
    // Use event delegation on the container (button is in dynamic HTML)
    const container = document.getElementById('pageContent');
    container.addEventListener('click', async e => {
        if (
            !e.target.matches('.guidance-send-btn') ||
            e.target.dataset.chatSend !== 'true'
        ) return;

        const inputEl = container.querySelector('.chat-input-field');
        const msg     = inputEl?.value?.trim();
        if (!msg) return;

        inputEl.value = '';
        e.target.disabled = true;
        e.target.textContent = '⏳';

        await submitLiveChatMessage(msg);

        e.target.disabled = false;
        e.target.textContent = 'Gửi';
    });
}

/**
 * Sends a chat message to POST /fast-track-chat-v2 and shows the AI reply.
 * @param {string} customerText
 */
async function submitLiveChatMessage(customerText) {
    const messagesEl = document.getElementById('chatScroll');

    // Append the customer bubble immediately (optimistic)
    const customerBubble = document.createElement('div');
    customerBubble.className = 'chat-bubble customer';
    customerBubble.innerHTML = `<div class="chat-bubble-sender">Bạn · Vừa xong</div>${customerText}`;
    messagesEl?.appendChild(customerBubble);

    // Show loading bubble
    const loadingBubble = document.createElement('div');
    loadingBubble.className = 'chat-bubble assistant';
    loadingBubble.innerHTML =
        '<div class="chat-bubble-sender">AI Agent · Đang xử lý…</div>' +
        '<span class="spinner" style="display:inline-block;width:14px;height:14px;border:2px solid #555;border-top-color:#a78bfa;border-radius:50%;animation:spin 0.8s linear infinite;"></span>';
    messagesEl?.appendChild(loadingBubble);
    messagesEl?.scrollTo(0, messagesEl.scrollHeight);

    const shopProfile = {
        brand_tone: 'Lịch sự, nhiệt tình',
        target_customers: 'Khách hàng phổ thông',
        strategic_vision: 'Tối ưu lợi nhuận dài hạn',
    };

    try {
        if (!appState.backendOnline) throw new Error('Backend offline');

        const result = await fastTrackChatV2(
            customerText,
            'Đổi trả trong 7 ngày. Phí ship khách chịu.',
            shopProfile,
        );

        const aiText =
            result?.data?.suggested_reply ||
            result?.data?.message ||
            result?.data?.draft ||
            '(AI không có phản hồi cụ thể)';

        const isAuto = result?.routing_action === 'Auto-Reply Executed';

        loadingBubble.innerHTML = `
            <div class="chat-bubble-sender">AI Agent · Vừa xong</div>
            ${aiText}
            <div style="margin-top:8px; font-size:0.75rem; opacity:0.6;">
                ${isAuto ? '✅ Tự động phản hồi' : '👀 Đề xuất – cần duyệt'}
                · Độ tự tin: ${Math.round((result?.data?.confidence_score ?? 0) * 100)}%
            </div>`;

        showToast(isAuto ? 'success' : 'info',
            isAuto ? '🤖 AI đã tự động trả lời khách.' : '📋 AI đề xuất phản hồi – chờ duyệt.');

    } catch (err) {
        loadingBubble.innerHTML =
            `<div class="chat-bubble-sender">AI Agent · Lỗi</div>` +
            `<span style="color:var(--accent-rose)">⚠️ Không thể kết nối backend: ${err.message}</span>`;
        showToast('error', `❌ Lỗi chat: ${err.message}`);
    }

    messagesEl?.scrollTo(0, messagesEl.scrollHeight);
}

// ============================================================================
// GLOBAL FUNCTIONS (called from inline onclick attributes in views/pages.js)
// ============================================================================

/**
 * Approve or deny a strategy card.
 * Syncs with POST /act-and-learn when the backend is online.
 */
window.actionStrategy = async function (id, action) {
    const s = appState.strategies.find(x => x.id === id);
    if (!s) return;

    if (action === 'approve') {
        s.status = 'approved';
        showToast('success', `✅ Đã duyệt chiến lược: ${s.title}`);
        renderPage('dashboard');

        // Notify backend – fire-and-forget
        if (appState.backendOnline) {
            try {
                await actAndLearn(id, 'approved');
                showToast('info', '🔄 Backend: Đã đồng bộ lên sàn và lưu vào ChromaDB.');
            } catch (err) {
                console.warn('[Agicom] /act-and-learn error (approve):', err.message);
                showToast('warning', `⚠️ Backend ghi nhận thất bại: ${err.message}`);
            }
        }
    } else {
        // Open deny modal – actual API call is in setupModalsAndOverlays
        document.getElementById('feedbackModal').classList.add('show');
        appState._denyTarget = id;
    }
};

window.approveStrategy = id => window.actionStrategy(id, 'approve');
window.denyStrategy    = id => window.actionStrategy(id, 'deny');

// ---------------------------------------------------------------------------
// Chat conversation selection
// ---------------------------------------------------------------------------
window.selectChatConv = function (idx) {
    document.querySelectorAll('.chat-conv-item').forEach((item, i) =>
        item.classList.toggle('active', i === idx),
    );
    document.getElementById('chatDetailContainer').innerHTML =
        Views.renderChatDetail(idx);
};

// ---------------------------------------------------------------------------
// Chat draft approve / edit
// ---------------------------------------------------------------------------
window.approveChatDraft = async function (idx) {
    appState.aiLearned++;
    const dNode = document.querySelector('.chat-ai-suggestion');
    if (!dNode) return;

    const draftText = MOCK_CHAT_SESSIONS[idx].messages[1]?.text || '';

    dNode.outerHTML =
        `<div class="chat-bubble assistant">` +
        `<div class="chat-bubble-sender">Shop · Vừa xong</div>${draftText}</div>` +
        `<div class="chat-learning-toast">📚 AI đã ghi nhớ phong cách xử lý này</div>`;

    showToast('success', 'Đã duyệt & gửi phản hồi!');

    // Teach the AI via /learn-feedback
    if (appState.backendOnline) {
        const conv = MOCK_CHAT_SESSIONS[idx];
        const customerQ = conv.messages[0]?.text || '';
        const humanA    = draftText;
        try {
            await learnFromHuman(customerQ, humanA);
            showToast('info', `🧬 AI đã học từ cặp hội thoại này (+${appState.aiLearned} memories).`);
        } catch (err) {
            console.warn('[Agicom] /learn-feedback error:', err.message);
        }
    }
};

window.editChatDraft = function (idx) {
    const tNode = document.getElementById(`draftMsg-${idx}`);
    if (!tNode) return;

    const oldText = tNode.textContent;
    tNode.innerHTML = `<textarea style="width:100%;min-height:60px;background:var(--bg-input);border:1px solid var(--accent-indigo);color:white;padding:8px;border-radius:4px">${oldText}</textarea>`;

    const btns = tNode.nextElementSibling.querySelectorAll('.btn-chat-action');
    btns[1].textContent = 'Lưu & Gửi & Học';
    btns[1].className   = 'btn-chat-action btn-chat-accept';
    btns[1].onclick = () => {
        MOCK_CHAT_SESSIONS[idx].messages[1].text =
            tNode.querySelector('textarea').value;
        window.approveChatDraft(idx);
    };
    btns[0].style.display = 'none';
};

// ---------------------------------------------------------------------------
// Settings policy tab
// ---------------------------------------------------------------------------
window.switchPolicyTab = function (platform, btnEl) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btnEl.classList.add('active');

    const title = document.getElementById('policyCardTitle');
    const acc   = document.getElementById('policyAccordion');

    if (platform === 'shopee') {
        title.textContent = 'Tóm tắt Quy Chế Shopee (Rút trích tự động bởi AI)';
        acc.innerHTML = `
      <div class="accordion-item">
        <button class="accordion-header" onclick="this.nextElementSibling.classList.toggle('open')">1. Giao nhận Vận Chuyển</button>
        <div class="accordion-body"><div class="accordion-content">Nhanh/Tiết kiệm tốn 1-4 ngày, Hỏa tốc 1-2H.</div></div>
      </div>`;
    } else {
        title.textContent = 'Tóm tắt TikTok Shop Content Policy (AI)';
        acc.innerHTML = `
      <div class="accordion-item">
        <button class="accordion-header" onclick="this.nextElementSibling.classList.toggle('open')">1. Nội dung Cấm</button>
        <div class="accordion-body"><div class="accordion-content">Tuyệt đối cấm hứa hẹn may rủi/ phần thưởng.</div></div>
      </div>`;
    }
};

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', init);
