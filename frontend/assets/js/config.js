/**
 * @file config.js
 * @description Runtime configuration injected into the browser window.
 *
 * This file is loaded BEFORE app.js (see index.html script tags).
 * Edit API_BASE_URL here when deploying to staging / production
 * without touching any other source file.
 *
 * For local development the default is http://localhost:8000 (FastAPI uvicorn).
 */
window.__AGICOM_CONFIG__ = {
    /** FastAPI backend base URL – no trailing slash */
    API_BASE_URL: 'http://localhost:8000',
};
