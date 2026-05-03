# 🚀 Agicom — E-commerce Management Agentic AI System

**Project for GDGoC Hackathon 2026 · Team FUTURA**

**Agicom** is a smart E-commerce Management Dashboard powered by a **Multi-Agent AI** architecture. Instead of just being a standard chatbot, Agicom operates as a virtual staff team, helping SME beauty shop owners automate Customer Service, Pricing Strategy Proposals, Content & Video Script Creation, and Crisis Management in real-time.

---

## 🌟 Why Agicom?

SME shop owners are often overwhelmed with handling hundreds of messages, tracking competitor prices, and dealing with negative reviews. Agicom solves this problem using the **Observe → Think → Plan → Act → Learn** model:

- **Automation:** AI automatically replies to customers based on shop policies & conversation context.
- **Optimization:** Tracks market prices to propose pricing strategies that maintain profit margins.
- **Continuous Learning:** Automatically saves AI responses edited by the shop owner into a Vector DB so the AI becomes smarter every day.

---

## 🧠 Multi-Agent Architecture

The system is divided into specialized Agents that communicate with each other via `CoordinationTasks` (SQLite):

### 1. 💬 Customer Service Agent
- **Technology:** RAG (Retrieval-Augmented Generation) combined with ChromaDB (`policy_db`, `product_db`, `resolved_qa_db`).
- **Task:** Reply to customer messages (Live Chat). Look up shop policies, GIAO FARA product information, and conversation history.
- **Key Features:** Personalization based on *Customer Profiles* (churn probability, LTV). Integrates a **Safety Guardrail**: if unsafe content is detected (`is_safe == False`) or the AI is not confident (`confidence_score < 0.7`), the message is held back for the shop owner to approve. **Human-in-the-Loop**: when the shop owner edits an AI reply, the new Q&A pair is saved to `resolved_qa_db` via `/learn-feedback`.

### 2. 💰 Pricing Agent
- **Task:** Analyze market data (competitor prices, ratings) and internal data (inventory, minimum profit margin).
- **Key Features:** Makes decisions to "Discount", "Increase price for positioning", or "Stand still". All decisions must ensure `min_margin_percent` (Slow Track flow). Approval history is stored in `strategy_learnings_db` for context in future decisions.

### 3. 📝 Content & Script Agent
- **Task:** Listen to "pain points" from repeated questions in Live Chat and 1–3 star Reviews, then generate actionable content proposals.
- **Key Features:** Full TikTok video script pipeline in two stages:
  1. **Intel Phase** — AI analyzes the product's USPs, competitor weaknesses, and content trends.
  2. **Script Phase** — AI generates 3 script variants (Emotional / Tutorial / Social Proof) with a full Filming Guide.
- Supports all 10 GIAO FARA products with USPs embedded in RAG.

### 4. 🛡️ Risk & Quality Agent
- **Task:** Monitor all reviews and conversations.
- **Key Features:** If toxic phrases or 1-star reviews are detected, the AI switches the system to **RED ALERT**, automatically generating a *Crisis Response Plan* (Pause Ads, pre-draft customer apology templates).

---

## 🛠️ Tech Stack

- **Frontend:** HTML5, CSS3, Vanilla JavaScript (SPA architecture, no frameworks — optimized for speed).
- **Backend:** Python 3.11, FastAPI, SQLAlchemy.
- **Database:**
  - *Relational DB:* PostgreSQL (Deploy) / SQLite (Local)
  - *Vector DB:* ChromaDB `PersistentClient` — 4 collections: `policy_db`, `product_db`, `resolved_qa_db`, `strategy_learnings_db`
- **AI Models:** Google Gemini (`gemini-2.5-flash-preview-05-20` for reasoning).
- **Deployment:** Render (Backend) & Netlify (Frontend).

---

## 🔌 Core Endpoints

*(The source code contains additional experimental endpoints. Below are the main APIs currently powering the system.)*

### Chat & Customer Service

| HTTP | Endpoint | Function |
|------|----------|----------|
| `POST` | `/chat-v3` | Live Chat: processes RAG, analyzes sentiment, returns Confidence Score |
| `GET` | `/api/chat-messages/{customer_id}` | Fetch conversation history for a customer |
| `DELETE` | `/chat/{customer_id}` | Clear a chat session |
| `POST` | `/learn-feedback` | Human-in-the-loop: saves shop-owner-edited replies to ChromaDB |

### Pricing & Strategy

| HTTP | Endpoint | Function |
|------|----------|----------|
| `POST` | `/slow-track-strategy` | Push market data to AI → returns pricing strategy proposal |
| `POST` | `/act-and-learn` | Approve/reject proposal → saves decision to `strategy_learnings_db` |

### Content & Script Agent

| HTTP | Endpoint | Function |
|------|----------|----------|
| `GET` | `/api/content-suggestions` | Fetch AI-generated content proposals (from Chats & Reviews) |
| `PATCH` | `/api/content-suggestions/{id}/status` | Update proposal status |
| `GET` | `/api/content-agent/products` | Product list for the Content Agent dropdown |
| `POST` | `/api/content-agent/intel` | **Step 1:** AI analyzes Intel (USPs, competitors, trends) for a product |
| `POST` | `/api/content-agent/generate-script` | **Step 2:** Generate video scripts (3 variants + Filming Guide) |
| `POST` | `/api/content-agent/trigger-from-task/{task_id}` | Trigger Content Agent from a CoordinationTask |

### Reviews & Quality

| HTTP | Endpoint | Function |
|------|----------|----------|
| `POST` | `/learn-from-review` | Analyze new reviews, extract lessons → save to ChromaDB, create warning tasks if negative |
| `GET` | `/api/reviews` | List of processed reviews |
| `GET` | `/api/quality/overview` | Quality overview (bad reviews + toxic chats) |
| `GET` | `/api/chatbot/features` | Chatbot feature usage statistics |

### Crisis Management

| HTTP | Endpoint | Function |
|------|----------|----------|
| `GET` | `/api/crisis-overview` | Aggregated crisis data (bad reviews + toxic chats) |
| `POST` | `/api/crisis-plan` | Generate a Crisis Response Plan for a product |
| `GET` | `/api/crisis-plan/{product_id}` | Fetch crisis plan by product |
| `PATCH` | `/api/crisis-action/{action_id}` | Update status of an action item in a plan |

### Reports & System

| HTTP | Endpoint | Function |
|------|----------|----------|
| `GET` | `/daily-summary` | Export daily report |
| `POST` | `/export-daily-summary` | Archive daily report to DB |
| `GET` | `/health` | Health check (used by Render) |
| `POST` | `/system/reset-all` | Reset all DB tables (dev/demo only) |
| `POST` | `/system/seed-crisis-demo` | Load crisis demo data |

---


## 💻 Local Setup & Run Guide

### 1. Backend (FastAPI)

Requirements: Python 3.11+

```bash
# 1. Clone the repository & navigate to the backend folder
git clone https://github.com/your-repo/gdgoc-futura-agicom.git
cd gdgoc-futura-agicom/backend

# 2. Create a virtual environment and install dependencies
python -m venv .venv
source .venv/bin/activate  # (Windows: .venv\Scripts\activate)
pip install -r requirements.txt

# 3. Configure environment variables
cp .env.example .env
# Open .env and set your Google Gemini API Key:
#   GOOGLE_API_KEY=your_gemini_api_key_here

# 4. Start the server
uvicorn main:app --reload --port 8000
```

*Note: On the first run, the system automatically calls `seed_demo.py` to load GIAO FARA sample data (products, USPs, policies, chat history) into SQLite and ChromaDB. No extra commands needed.*

### 2. Frontend (HTML/JS)

Because the Frontend uses pure Vanilla JS, you do not need to install Node.js or npm.

1. Navigate to the `frontend/` directory.
2. Use **Live Server** (VSCode Extension) or Python HTTP server:
```bash
   python -m http.server 3000
```
3. Access `http://localhost:3000?local=1` — the `?local=1` query flag tells `config.js` to use `http://localhost:8000` instead of the production Render URL.

---

## 🌍 Deployment Guide (Cloud)

### Deploy Backend (Render)

- The project includes a `render.yaml` file. Create a **Web Service** on Render and point it to the repo.
- Add environment variables on the Render Dashboard:
  - `GOOGLE_API_KEY` — your Gemini API key
  - `DATABASE_URL` — Render's PostgreSQL connection string *(optional; defaults to SQLite)*
- **ChromaDB on Render:** The system uses `PersistentClient`. On each cold start, the code auto-seeds the Vector DB and replays previously learned Q&A entries from SQL — no knowledge is lost between restarts.

### Deploy Frontend (Netlify)

- Point Netlify to the `frontend/` directory.
- The `netlify.toml` and `_redirects` files are pre-configured to support SPA routing.
- **Important:** Update `frontend/config.js` to set your Render backend domain:
```js
  var AGICOM_BACKEND_URL = 'https://your-service.onrender.com';
```

---

## 🔑 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_API_KEY` | ✅ | Gemini API Key from Google AI Studio |
| `DATABASE_URL` | ❌ | PostgreSQL URL (defaults to SQLite `./agicom.db`) |
| `CHROMA_DB_DIR` | ❌ | ChromaDB storage path (defaults to `./chroma_data`) |
| `FRONTEND_URL` | ❌ | Netlify domain to restrict CORS (defaults to `*`) |

---

## 📂 Repo Tree

```text
.
├── backend/
│   ├── main.py             # Main Router & all API Endpoints
│   ├── services.py         # AI Agent processing logic
│   ├── database.py         # SQLAlchemy Config & ORM Models
│   ├── models.py           # Pydantic Schemas for API
│   ├── prompts.py          # System Prompts for Gemini AI
│   ├── config.py           # ChromaDB & Gemini Client config
│   └── seed_demo.py        # Script to load GIAO FARA sample data
├── frontend/
│   ├── index.html          # SPA shell & UI layout
│   ├── app4.js             # Dashboard render logic & navigation
│   ├── api_integration.js  # Backend API calls & live data polling
│   ├── config.js           # Only file to edit when deploying (backend URL)
│   └── index4.css          # Design System
├── data/
│   ├── mock/               # Full sample data — GIAO FARA (10 products)
│   ├── skeletal/           # Empty schemas — for connecting a real shop
│   └── catalog/
│       └── product_catalog.json   # Product catalog for RAG & Content Agent
├── docs/
│   └── pipeline.png        # System architecture diagram
└── render.yaml             # Automated deployment config for Render
```

---

## 👨‍💻 Development Team

**FUTURA TEAM — GDGoC Hackathon 2026**

*We believe that AI was not created to replace humans, but to serve as a powerful assistant, helping SME businesses focus on growth instead of operations.*

---

*MIT License © 2026 Team FUTURA*
