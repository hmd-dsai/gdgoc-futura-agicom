agicom-mvp/
│
├── frontend/                 # Toàn bộ code giao diện (Next.js, Tailwind)
│   ├── src/
│   │   ├── app/              # Các trang giao diện (Dashboard, Cấu hình)
│   │   ├── components/       # Các UI components dùng chung (Nút bấm, Bảng, Thẻ)
│   │   └── lib/              # Các hàm gọi API từ Frontend xuống Backend
│   ├── package.json
│   └── .env.example          # Các biến môi trường mẫu cho Frontend
│
├── backend/                  # Toàn bộ code Server và Trí tuệ nhân tạo (FastAPI, Python)
│   ├── api/                  # Các endpoint API cung cấp cho Frontend
│   ├── mock_data/            # Nơi chứa các file JSON giả lập (Shopee, Đối thủ)
│   ├── agents/               # Não bộ AI (Code LangChain/CrewAI)
│   │   ├── prompts/          # Chứa các file text hướng dẫn (system prompts) cho Gemini
│   │   ├── tools/            # Công cụ cho Agent (vd: hàm tính toán giá)
│   │   └── core_logic.py     # Cấu hình luồng Think -> Plan
│   ├── main.py               # File chạy server FastAPI gốc
│   ├── requirements.txt      # Danh sách các thư viện Python cần cài đặt
│   └── .env.example          # Biến môi trường Backend (API Key Gemini...)
│
├── docs/                     # Nơi chứa tài liệu nộp cho BGK
│   ├── architecture.png      # Sơ đồ hệ thống (hình ảnh đã vẽ)
│   └── technical_report.pdf  # Báo cáo kỹ thuật 12 trang
│
├── .gitignore                # RẤT QUAN TRỌNG: Loại bỏ node_modules, .env, __pycache__
└── README.md                 # Bộ mặt của toàn bộ dự án