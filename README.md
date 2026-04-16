HUONG DAN CHAY DU AN
====================

1. Cai dat Backend (FastAPI + ChromaDB)
---------------------------------------
- Mo terminal, di chuyen vao thu muc backend:
  cd backend

- Tao moi truong ao (tuy chon):
  python -m venv venv

- Kich hoat moi truong ao:
  Windows: venv\Scripts\activate
  macOS/Linux: source venv/bin/activate

- Cai dat thu vien:
  pip install -r requirements.txt

- Seed du lieu vao ChromaDB (neu co file seed):
  python seed_db.py

- Chay server backend:
  uvicorn main:app --reload --port 8000

  Backend se chay tai: http://localhost:8000
  Kiem tra API docs: http://localhost:8000/docs


2. Chay Frontend (HTML/JS)
---------------------------
- Mo terminal moi (giu nguyen terminal backend dang chay).
- Di chuyen vao thu muc frontend:
  cd frontend

- Chay server tinh bang Python:
  python -m http.server 5500

  Hoac dung Node.js (neu co):
  npx serve . -p 5500

  Hoac dung Live Server cua VS Code:
  Chuot phai vao index.html -> Open with Live Server

- Frontend se chay tai: http://localhost:5500


3. Su dung ung dung
--------------------
- Mo trinh duyet, truy cap: http://localhost:5500
- Nhap tu khoa tim kiem hoac thuc hien thao tac theo giao dien.
- Mo F12 -> tab Network de kiem tra ket noi API den backend.


4. Luu y
--------
- Backend phai chay truoc khi su dung frontend.
- Dam bao CORS trong main.py da cho phep origin http://localhost:5500
- Neu gap loi "ModuleNotFoundError", kiem tra da kich hoat moi truong ao va cai dependencies chua.
- Neu khong co du lieu, hay chay script seed_db.py de nap du lieu mau.