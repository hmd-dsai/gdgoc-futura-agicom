# Agicom – Hướng Dẫn Cài Đặt & Chạy

**GDGoC Hackathon 2026 – Team FUTURA**

Hệ thống Agentic AI hỗ trợ chủ shop TMĐT: tự động định giá, tư vấn CSKH, phân tích thị trường và học liên tục từ feedback.

---

## Yêu Cầu Hệ Thống

- **Python** 3.10 trở lên
- **pip** (trình quản lý package Python)
- **Google Gemini API Key** – lấy miễn phí tại [aistudio.google.com](https://aistudio.google.com/app/apikey)
- Trình duyệt hiện đại (Chrome, Firefox, Edge)

---

## Cấu Trúc Project

```
agicom/
├── backend/                  # FastAPI + Gemini AI
│   ├── main.py               # Server chính (18 API endpoints)
│   ├── services.py           # Business logic & AI calls
│   ├── models.py             # Pydantic data models
│   ├── database.py           # SQLite + SQLAlchemy
│   ├── config.py             # Gemini client + ChromaDB
│   ├── prompts.py            # AI system prompts
│   ├── seed_demo.py          # Script nạp dữ liệu mẫu
│   ├── requirements.txt      # Python dependencies
│   ├── .env.example          # Mẫu biến môi trường
│   └── mock_data/            # Dữ liệu thô giả lập (JSON)
│
├── frontend/                 # Single-page App (HTML/CSS/JS)
│   ├── index.html            # Trang chính (mở file này)
│   ├── app4.js               # Logic UI + MOCK data gốc
│   ├── api_integration.js    # Lớp tích hợp API thực
│   └── index4.css            # Stylesheet
│
└── README_SETUP.md           # File này
```

---

## Bước 1 – Cài Đặt Backend

```bash
# Di chuyển vào thư mục backend
cd agicom/backend

# (Khuyến nghị) Tạo môi trường ảo
python -m venv venv
source venv/bin/activate        # Linux / macOS
# hoặc: venv\Scripts\activate   # Windows

# Cài đặt các thư viện
pip install -r requirements.txt
```

---

## Bước 2 – Cấu Hình API Key

```bash
# Tạo file .env từ mẫu
cp .env.example .env
```

Mở file `.env` và điền **Google Gemini API Key** của bạn:

```
GOOGLE_API_KEY=AIza...your_key_here...
```

---

## Bước 3 – Nạp Dữ Liệu Mẫu (Tuỳ chọn)

Script này sẽ nạp chính sách shop, thông tin sản phẩm và Q&A mẫu vào ChromaDB:

```bash
python seed_demo.py
```

---

## Bước 4 – Chạy Backend Server

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Server sẽ khởi động tại **http://localhost:8000**

Kiểm tra API docs tại: **http://localhost:8000/docs**

---

## Bước 5 – Mở Frontend

**Cách đơn giản nhất** – dùng Live Server (VS Code extension) hoặc trình duyệt trực tiếp:

```bash
# Cài http-server toàn cục (nếu chưa có)
npm install -g http-server

# Di chuyển vào thư mục frontend
cd ../frontend

# Chạy server tĩnh
http-server . -p 5500
```

Sau đó mở trình duyệt và truy cập: **http://localhost:5500**

> **Lưu ý**: Không nên mở `index.html` trực tiếp bằng cách double-click (file://) vì trình duyệt có thể chặn CORS. Hãy dùng một web server tĩnh như trên.

---

## Các Tính Năng Được Tích Hợp Backend

| Trang / Tính năng | Endpoint | Mô tả |
|---|---|---|
| 🔍 **Nút Quét Thị Trường** | `POST /slow-track-strategy` | Phân tích chiến lược định giá bằng AI |
| 💬 **Live Chat CSKH** | `POST /chat-v3` | Chat RAG với lịch sử hội thoại, guardrail AI |
| ⭐ **Đánh Giá Sản Phẩm** | `GET /api/reviews` | Xem danh sách review từ database |
| ⭐ **Gửi Review** | `POST /learn-from-review` | AI học từ review, trích xuất Q&A |
| 📊 **Tổng Kết Ngày** | `GET /daily-summary` | Lấy báo cáo tổng kết hoạt động |
| ✅ **Duyệt Đề Xuất AI** | `POST /act-and-learn` | Human-in-the-loop: duyệt/từ chối chiến lược |
| 🗑️ **Xóa Chat** | `DELETE /chat/{id}` | Xóa lịch sử chat của khách hàng |
| ⚙️ **Reset Hệ Thống** | `POST /system/reset-all` | Xóa toàn bộ dữ liệu (dùng khi test) |

---

## Cơ Chế Hoạt Động

```
Frontend (index.html)
    │
    ├─ app4.js           ← UI gốc + MOCK data (không sửa)
    │
    └─ api_integration.js ← Override các hàm, inject widget mới
            │
            └─ HTTP (fetch API) ──→ FastAPI Backend (port 8000)
                                          │
                                    ┌─────┴──────┐
                                 ChromaDB     SQLite
                              (RAG Vector DB) (Chat/Task logs)
                                          │
                                    Google Gemini Flash
```

**`api_integration.js`** không sửa `app4.js` mà dùng kỹ thuật **function override**:
- Lưu hàm gốc: `const _orig = navigate;`
- Ghi đè: `navigate = function(page) { _orig(page); /* inject UI */ }`
- Nếu backend không khả dụng → tự động fallback về MOCK data (demo mode)

---

## Troubleshooting

**Lỗi CORS khi gọi API:**
Đảm bảo frontend đang chạy trên `http://localhost:5500` hoặc `http://127.0.0.1:5500`. Backend đã cấu hình CORS cho các origin này. Nếu dùng port khác, sửa trong `main.py` (phần `allow_origins`).

**`ModuleNotFoundError: google.genai`:**
```bash
pip install google-genai
```

**ChromaDB lỗi khi khởi động:**
```bash
pip install chromadb --upgrade
```

**`GOOGLE_API_KEY` không được đọc:**
Đảm bảo file `.env` nằm trong thư mục `backend/` và `python-dotenv` đã được cài:
```bash
pip install python-dotenv
```

---

## Ghi Chú

- Backend dùng **ChromaDB EphemeralClient** – dữ liệu Vector DB sẽ mất khi restart server. Chạy lại `seed_demo.py` sau mỗi lần khởi động lại.
- Để persistence, thay `EphemeralClient()` bằng `PersistentClient(path="./chroma_db")` trong `config.py`.
- Tất cả AI calls dùng model `gemini-flash-latest` – nhanh và miễn phí trong giới hạn quota.
