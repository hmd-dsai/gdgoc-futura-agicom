# 🚀 Agicom — E-commerce Management Agentic AI System

**Project for GDGoC Hackathon 2026 · Team FUTURA**

**Agicom** is a smart E-commerce Management Dashboard powered by a **Multi-Agent AI** architecture. Instead of just being a standard chatbot, Agicom operates as a virtual staff team, helping SME beauty shop owners automate Customer Service, Content & Video Script Creation, and Crisis Management in real-time.

---

## 🌟 Value Proposition & Target Customers (Business Strategy)

SME shop owners are often overwhelmed with handling hundreds of messages, tracking competitor prices, and dealing with negative reviews. 

**Our Target Customers:** Small and Medium Enterprise (SME) owners, specifically in the beauty and retail sectors, who lack the budget to hire large operational teams.

**The "Pain Point":** 
- Profit margin gets increasingly thin.
- Too many SKUs, chats, reviews data to manage, making it hard to keep track of the quality.
- Inability to proive customer service 24/7.
- Promotional contents have low conversion rates.

**Agicom's Value Proposition:** 
We provide a "Virtual Staff Team" that operates 24/7. Using the **Observe → Think → Plan → Act → Learn** model, Agicom solves these problems by:
- **Continuous Learning - Compounded Intelligence (Differentiation):** Automatically saves shop owner's approval/decline history to database for optimizing future decisions. The AI becomes smarter every day, making Agicom highly tailored to each specific shop unlike generic tools/chatbots.
- **Autonomy (Cost Reduction):** AI automatically implement tasks (chat replying, planning...) based on shop policy and learned history.
- **Multi-Agent Coordination:** All agents (CS, Content, RiskManager) are interconnected, able to coordinate and communicate through CoordinationTasks, completing an end-to-end workflow.

---

## 🧠 Multi-Agent Architecture (Technical Excellence)

The system is designed with a highly modular architecture, ensuring high performance, stability, and easy maintenance. Agents communicate with each other via `CoordinationTasks` (SQLite/PostgreSQL).

### 1. 💬 Customer Service Agent
- **Technology:** RAG (Retrieval-Augmented Generation) combined with ChromaDB (`policy_db`, `product_db`, `resolved_qa_db`).
- **Task:** Reply to customer messages (Live Chat) using shop policies, product info, and chat history.
- **Key Features:** 
  - **Personalization:** Based on *Customer Profiles* (churn probability, LTV).
  - **Safety Guardrail:** If unsafe content is detected (`is_safe == False`) or the AI is not confident (`confidence_score < 0.7`), the message is held back for the shop owner to approve. 
  - **Human-in-the-Loop:** When the shop owner edits an AI reply, the new Q&A pair is saved via `/learn-feedback`.

### 2. 📝 Content & Script Agent
- **Task:** Listen to "pain points" from repeated questions in Live Chat and 1–3 star Reviews, then generate actionable TikTok video scripts.
- **Key Features:** 
  - **Intel Phase:** AI analyzes USPs, competitor weaknesses, and trends.
  - **Script Phase:** AI generates 3 script variants (Emotional / Tutorial / Social Proof) with a Filming Guide.

### 3. 🛡️ Risk & Quality (RiskManager) Agent
- **Task:** Monitor all reviews and conversations.
- **Key Features:** Triggers **RED ALERT** on toxic phrases or 1-star reviews, automatically generating a *Crisis Response Plan*.

---

## 🚀 Go-To-Market & Implementation Roadmap

1. **Phase 1 (Testing & Demo):** Deploy locally for 5 pilot SME beauty shops. Gather feedback to fine-tune the Vector DB learning mechanism.
2. **Phase 2 (Launch):** Launch as a SaaS model with tiered pricing (Basic for CS only, Pro for full Multi-Agent).
3. **Phase 3 (Scale):** Integrate directly with e-commerce platforms (Shopee, TikTok Shop) via open APIs.

---

## 🛠️ Tech Stack & System Stability

**Hiệu năng, độ ổn định và an toàn vận hành (Performance & Stability):**
- **Resilience & Fallbacks:** Built-in fault tolerance. If AI quotas are exhausted (429) or servers overloaded (503), the system gracefully falls back to pre-defined safe responses without crashing.
- **Data Safety:** ChromaDB `PersistentClient` combined with SQLite/PostgreSQL backups guarantees that learned knowledge is never lost between cold starts.
- **Safe Guardrails:** Toxic inputs or AI hallucinations are caught before reaching the user via confidence score thresholding.

**Core Stack:**
- **Frontend:** HTML5, CSS3, Vanilla JavaScript (SPA architecture, no frameworks — optimized for speed and reliability).
- **Backend:** Python 3.11, FastAPI, SQLAlchemy (Modular separation of concerns).
- **Database:** PostgreSQL (Deploy) / SQLite (Local) and ChromaDB.
- **AI Models:** Google Gemini (`gemini-flash-latest`).
- **Deployment:** Render (Backend) & Netlify (Frontend).

---

## 🔌 Core Endpoints

### Chat & Customer Service
| HTTP | Endpoint | Function |
|------|----------|----------|
| `POST` | `/chat-v3` | Live Chat: processes RAG, analyzes sentiment, returns Confidence Score |
| `GET` | `/api/chat-messages/{customer_id}` | Fetch conversation history for a customer |
| `POST` | `/learn-feedback` | Human-in-the-loop: saves shop-owner-edited replies to ChromaDB |

### Pricing, Content & Risk Management
| HTTP | Endpoint | Function |
|------|----------|----------|
| `POST` | `/slow-track-strategy` | Push market data to AI → returns pricing strategy proposal |
| `GET` | `/api/content-suggestions` | Fetch AI-generated content proposals |
| `POST` | `/api/content-agent/generate-script` | Generate video scripts (3 variants + Filming Guide) |
| `POST` | `/learn-from-review` | Analyze new reviews, extract lessons → save to ChromaDB |
| `POST` | `/api/crisis-plan` | Generate a Crisis Response Plan for a product |

*(Additional endpoints available in the source code.)*

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

*Note: On the first run, the system automatically calls `seed_demo.py` to load sample data (products, USPs, policies, chat history) into SQLite and ChromaDB.*

### 2. Frontend (HTML/JS)

1. Navigate to the `frontend/` directory.
2. Run a Python HTTP server:
```bash
python -m http.server 3000
```
3. Access `http://localhost:3000?local=1`

---

## 🌍 Deployment Guide (Cloud)

- **Backend (Render):** Uses `render.yaml`. Set `GOOGLE_API_KEY` and optionally `DATABASE_URL`. ChromaDB uses `PersistentClient` to retain knowledge.
- **Frontend (Netlify):** Point to `frontend/`. Update `frontend/config.js` to set your Render backend domain.

---

## 🔑 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_API_KEY` | ✅ | Gemini API Key from Google AI Studio |
| `ADMIN_API_KEY`  | ✅ | Required to authenticate secure admin endpoints (e.g. system resets) |
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
