/**
 * @file apiClient.js
 * @description Centralized API client for the Agicom FastAPI backend.
 *
 * BASE_URL reads from the window-level config injected by config.js (injected
 * into index.html) so we never hard-code a host in every JS module.
 * Fallback: http://localhost:8000
 */

// ---------------------------------------------------------------------------
// Base URL – override via window.__AGICOM_CONFIG__ (set by config.js)
// ---------------------------------------------------------------------------
export const BASE_URL =
    (window.__AGICOM_CONFIG__ && window.__AGICOM_CONFIG__.API_BASE_URL) ||
    'http://localhost:8000';

// ---------------------------------------------------------------------------
// Internal helper – wraps fetch() with consistent error handling
// ---------------------------------------------------------------------------
/**
 * @template T
 * @param {string} endpoint  – path starting with '/', e.g. '/daily-summary'
 * @param {RequestInit} [options] – standard fetch options
 * @returns {Promise<T>}
 */
async function request(endpoint, options = {}) {
    const url = `${BASE_URL}${endpoint}`;

    const defaultHeaders = { 'Content-Type': 'application/json' };

    const response = await fetch(url, {
        ...options,
        headers: { ...defaultHeaders, ...(options.headers || {}) },
    });

    if (!response.ok) {
        // Try to extract a FastAPI detail message
        let detail = `HTTP ${response.status}`;
        try {
            const errBody = await response.json();
            detail = errBody.detail || JSON.stringify(errBody);
        } catch (_) { /* ignore parse errors */ }
        throw new Error(detail);
    }

    return response.json();
}

// ---------------------------------------------------------------------------
// Public API methods
// ---------------------------------------------------------------------------

/**
 * Health-check: fetch the daily summary (GET /daily-summary).
 * Used on init to verify the backend is reachable.
 * @returns {Promise<{date: string, top_insights: string[], recommendations: string[]}>}
 */
export async function getDailySummary() {
    return request('/daily-summary');
}

/**
 * Run the full Observe→Think→Plan pipeline for market data (POST /observe-and-think).
 * Triggers the Slow Track strategy analysis.
 * @param {object} payload – raw market data payload
 * @returns {Promise<{status: string, routing: string, data: object}>}
 */
export async function observeAndThink(payload) {
    return request('/observe-and-think', {
        method: 'POST',
        body: JSON.stringify({ data_type: 'market_data', payload }),
    });
}

/**
 * Submit a strategy approval or rejection (POST /act-and-learn).
 * @param {string} proposalId
 * @param {'approved'|'declined'} status
 * @param {string} [feedback]
 * @returns {Promise<{status: string, message: string}>}
 */
export async function actAndLearn(proposalId, status, feedback = '') {
    return request('/act-and-learn', {
        method: 'POST',
        body: JSON.stringify({ proposal_id: proposalId, status, feedback }),
    });
}

/**
 * Run AI strategy analysis for a product (POST /slow-track-strategy).
 * @param {object} productRequest – must match the ProductRequest Pydantic model
 * @returns {Promise<{status: string, routing_action: string, proposal_id: string, data: object}>}
 */
export async function slowTrackStrategy(productRequest) {
    return request('/slow-track-strategy', {
        method: 'POST',
        body: JSON.stringify(productRequest),
    });
}

/**
 * Send a customer chat message through the RAG-powered fast track (POST /fast-track-chat-v2).
 * @param {string} customerText
 * @param {string} shopPolicy
 * @param {{ brand_tone: string, target_customers: string, strategic_vision: string }} shopProfile
 * @returns {Promise<{status: string, routing_action: string, data: object}>}
 */
export async function fastTrackChatV2(customerText, shopPolicy, shopProfile) {
    // The endpoint receives `chat` and `profile` as separate query bodies.
    // FastAPI parses them from JSON body when they are Pydantic models combined
    // into a merged JSON object via a custom approach. We send them as two
    // top-level keys and let FastAPI route handle it.
    return request('/fast-track-chat-v2', {
        method: 'POST',
        // FastAPI will not automatically parse two body models from one request
        // unless we use a workaround – pass profile as query params instead.
        body: JSON.stringify({
            shop_policy: shopPolicy,
            customer_text: customerText,
        }),
        // pass profile fields as URL search params for the ShopProfile dependency
        headers: {},
    }).catch(() => {
        // Fallback: encode profile as query string
        const qs = new URLSearchParams({
            brand_tone: shopProfile.brand_tone,
            target_customers: shopProfile.target_customers,
            strategic_vision: shopProfile.strategic_vision,
        }).toString();
        return request(`/fast-track-chat-v2?${qs}`, {
            method: 'POST',
            body: JSON.stringify({
                shop_policy: shopPolicy,
                customer_text: customerText,
            }),
        });
    });
}

/**
 * Teach the AI a resolved Q&A pair (POST /learn-feedback).
 * @param {string} customerQ
 * @param {string} humanA
 * @returns {Promise<{status: string, data_saved: object}>}
 */
export async function learnFromHuman(customerQ, humanA) {
    const qs = new URLSearchParams({ customer_q: customerQ, human_a: humanA }).toString();
    return request(`/learn-feedback?${qs}`, { method: 'POST' });
}

/**
 * Run Phase-1 data analyst for a SKU (GET /test-phase1/:sku_id).
 * @param {string} skuId
 * @returns {Promise<{status: string, data: object}>}
 */
export async function testPhase1(skuId) {
    return request(`/test-phase1/${encodeURIComponent(skuId)}`);
}

// ---------------------------------------------------------------------------
// Connection status helper
// ---------------------------------------------------------------------------
/**
 * Returns true if the backend is reachable, false otherwise.
 * Used by app.js on startup to show an offline banner.
 */
export async function checkBackendHealth() {
    try {
        await getDailySummary();
        return true;
    } catch (_) {
        return false;
    }
}
