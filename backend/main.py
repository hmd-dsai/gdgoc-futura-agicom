from datetime import datetime
import json
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from google.genai import types

# Nhập các thành phần từ file khác
from config import client
from models import (
    IncomingData, ProposalApproval, ChatMessage, ProductRequest,
    GuardrailResponse, StrategyProposal, ShopProfile, ReviewData
)
from prompts import CHAT_SYSTEM_PROMPT, STRATEGY_SYSTEM_PROMPT, REVIEW_LEARNING_PROMPT
from services import (
    analyze_strategy_slow_track,
    customer_care_fast_track,
    analyze_raw_data_phase1,
    learn_from_human_service,
    cskh_rag_service
)
from database import SessionLocal, ChatLog, CoordinationTask, DailySummaryArchive, ReviewLog, init_db

init_db()

app = FastAPI(title="Agicom Core Backend")

# ---------------------------------------------------------------------------
# CORS – allow the Vanilla JS frontend served by VS Code Live Server / Vite
# ---------------------------------------------------------------------------
ALLOWED_ORIGINS =[
    "http://localhost:5500",      
    "http://127.0.0.1:5500",     
    "http://localhost:3000",      
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],   
    allow_headers=["*"],   
)

@app.get("/test-phase1/{sku_id}")
async def test_data_analyst_agent(sku_id: str):
    """API dùng để test khả năng đọc Raw Data của LLM Phase 1"""
    try:
        result = await analyze_raw_data_phase1(sku_id)
        return {
            "status": "success",
            "message": "Data Analyst đã trích xuất thành công!",
            "data": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/observe-and-think")
async def process_data_pipeline(input_data: IncomingData):
    try:
        print(f"[*] OBSERVE: Nhận dữ liệu loại '{input_data.data_type}'")
        if input_data.data_type == "market_data":
            print("[*] TASK ROUTER: Chuyển hướng sang Slow Track (Chiến lược)")
            proposal = await analyze_strategy_slow_track(input_data.payload)
            return {"status": "success", "routing": "Strategy", "action": "Send Proposals to Dashboard", "data": proposal}
        elif input_data.data_type == "customer_chat":
            print("[*] TASK ROUTER: Chuyển hướng sang Fast Track (CSKH)")
            chat_response = await customer_care_fast_track(input_data.payload)
            return {"status": "success", "routing": "Chat", "data": chat_response}
        else:
            raise HTTPException(status_code=400, detail="Loại dữ liệu không hợp lệ")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/act-and-learn")
async def human_approval_flow(approval: ProposalApproval):
    if approval.status == "approved":
        print(f"[*] ACT: Execute on Platforms (Gửi lệnh cập nhật giá lên Shopee API)")
        print(f"[*] LEARN: Store in Vector Database (Lưu chiến lược thành công)")
        return {"status": "Executed & Learned", "message": "Đã đồng bộ lên sàn và lưu vào ChromaDB"}
    elif approval.status == "declined":
        print(f"[*] ACT: Declined. User Feedback: {approval.feedback}")
        print(f"[*] RE-EVALUATE: Gửi feedback '{approval.feedback}' về lại LLM Framework")
        return {"status": "Re-evaluating", "message": "Đang tính toán lại dựa trên phản hồi của bạn"}

@app.post("/fast-track-chat")
async def process_customer_chat(chat: ChatMessage, profile: ShopProfile): 
    try:
        personalized_chat_prompt = CHAT_SYSTEM_PROMPT.format(
            brand_tone=profile.brand_tone,
            target_customers=profile.target_customers
        )
        user_prompt = f"Chính sách shop: {chat.shop_policy}\nTin nhắn của khách: '{chat.customer_text}'"

        response = await client.aio.models.generate_content(
            model="gemini-flash-latest",
            contents=[personalized_chat_prompt, user_prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=GuardrailResponse,
                http_options={'timeout': 30000} 
            )
        )

        if not response.text:
            raise HTTPException(status_code=500, detail="Lỗi phản hồi từ AI.")
            
        clean_text = response.text.replace("```json", "").replace("```", "").strip()
        guardrail_result = json.loads(clean_text)

        if guardrail_result["is_safe"] and guardrail_result["confidence_score"] >= 0.7:
            action = "Auto-Reply Executed"
            status_color = "Green"
        else:
            action = "Sent to Dashboard for Human Approval"
            status_color = "Red/Orange"

        return {
            "status": "success",
            "routing_action": action,
            "system_color": status_color,
            "ai_evaluation": guardrail_result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@app.post("/slow-track-strategy")
async def process_market_strategy(product: ProductRequest):
    try:
        personalized_system_prompt = STRATEGY_SYSTEM_PROMPT.format(
            strategic_vision=product.shop_profile.strategic_vision,
            target_customers=product.shop_profile.target_customers
        )
        user_prompt = f"Hồ sơ dữ liệu sản phẩm hiện tại: {product.model_dump_json()}"

        response = await client.aio.models.generate_content(
            model="gemini-flash-latest",
            contents=[personalized_system_prompt, user_prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=StrategyProposal,
                http_options={'timeout': 60000} 
            )
        )

        if not response.text:
            raise HTTPException(status_code=500, detail="Lỗi phản hồi từ AI.")
            
        clean_text = response.text.replace("```json", "").replace("```", "").strip()
        strategy_result = json.loads(clean_text)

        routing_msg = "Sent to Dashboard for Human Approval" if strategy_result.get("action_required") else "No Action Needed - Monitored"

        return {
            "status": "success",
            "routing_action": routing_msg,
            "proposal_id": f"PROP-{product.product_id}-001",
            "data": strategy_result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/fast-track-chat-v2")
async def process_chat_v2(chat: ChatMessage, profile: ShopProfile):
    try:
        ai_response = await cskh_rag_service(chat.customer_text, profile.brand_tone)
        db = SessionLocal()
        new_log = ChatLog(
            customer_q=chat.customer_text,
            ai_a=ai_response["suggested_reply"],
            insight=ai_response.get("sensor_insight")
        )
        db.add(new_log)
        db.commit()
        db.close()
        return {"status": "success", "data": ai_response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/learn-feedback")
async def human_feedback(customer_q: str, human_a: str):
    """API để chủ shop 'dạy' AI khi họ sửa câu trả lời trên Dashboard"""
    return await learn_from_human_service(customer_q, human_a)

@app.get("/daily-summary")
async def get_daily_summary(archive: bool = Query(False, description="Nếu True, sẽ lưu trữ dữ liệu đi sau khi xuất")):
    db = SessionLocal()
    try:
        tasks = db.query(CoordinationTask).filter(CoordinationTask.status == "pending").all()
        
        pricing_tasks =[t.instruction for t in tasks if t.target_agent == "Pricing"]
        content_tasks =[t.instruction for t in tasks if t.target_agent == "Content"]
        risk_tasks =[t.instruction for t in tasks if t.target_agent == "RiskManager"]
        
        display_logs = db.query(ChatLog).filter(ChatLog.is_archived == False).order_by(ChatLog.timestamp.desc()).limit(20).all()
        insights =[log.insight for log in display_logs if log.insight]
        
        current_date = datetime.now().date()
        risk_status = "Cảnh báo" if len(risk_tasks) > 0 else "An toàn"
        
        if archive:
            archive_record = DailySummaryArchive(
                report_date=current_date,
                archived_at=datetime.utcnow(),
                risk_status=risk_status,
                risk_tasks_json=json.dumps(risk_tasks, ensure_ascii=False),
                pricing_tasks_json=json.dumps(pricing_tasks, ensure_ascii=False),
                content_tasks_json=json.dumps(content_tasks, ensure_ascii=False),
                insights_json=json.dumps(insights, ensure_ascii=False),
                total_tasks=len(tasks),
                total_insights=len(insights)
            )
            db.add(archive_record)
            
            for t in tasks:
                t.status = "archived"
                
            all_unarchived_logs = db.query(ChatLog).filter(ChatLog.is_archived == False).all()
            for log in all_unarchived_logs:
                log.is_archived = True
                
            db.commit()
        
        return {
            "date": current_date.isoformat(),
            "risk_management": {
                "status": risk_status,
                "urgent_actions": risk_tasks
            },
            "growth_strategy": {
                "pricing_proposals": pricing_tasks,
                "content_optimizations": content_tasks
            },
            "customer_sentiment_overview": insights
        }
    except Exception as e:
        db.rollback()
        print(f"LỖI DAILY SUMMARY: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.post("/export-daily-summary")
async def export_and_archive_daily_summary():
    return await get_daily_summary(archive=True)

@app.get("/api/chatbot/features")
async def get_chatbot_features():
    return {
        "features":[
            {
                "id": "sentiment",
                "title": "Phân tích cảm xúc",
                "status": "Ổn định",
                "detail": "Theo dõi trạng thái cảm xúc theo từng cụm hội thoại để cảnh báo sớm nhóm khách tiêu cực.",
            },
            {
                "id": "faq-report",
                "title": "Báo cáo thắc mắc",
                "status": "Đang cập nhật",
                "detail": "Tổng hợp câu hỏi lặp lại trong ngày, ưu tiên theo tần suất và mức độ ảnh hưởng.",
            },
        ]
    }

@app.get("/api/quality/overview")
async def get_quality_overview():
    return {
        "items":[
            {
                "id": "chatbot-summary",
                "title": "Tổng hợp từ chat bot",
                "value": "128 tín hiệu/7 ngày",
                "note": "Hệ thống gom nhóm phản hồi theo chủ đề sản phẩm, kênh bán và thời điểm phát sinh.",
            },
            {
                "id": "crisis-management",
                "title": "Quản trị khủng hoảng",
                "value": "1 cảnh báo cần xử lý",
                "note": "Phát hiện cụm phản hồi tiêu cực tăng nhanh ở nhóm giao vận, đề xuất xử lý ưu tiên trong 24 giờ.",
            },
        ]
    }

from config import resolved_qa_col
import hashlib

@app.post("/learn-from-review")
async def process_and_learn_review(review: ReviewData):
    try:
        # 1. AI Phân tích Review
        user_prompt = f"Sản phẩm ID: {review.product_id}\nSố sao: {review.rating}/5\nNội dung: '{review.review_text}'"
        response = await client.aio.models.generate_content(
            model="gemini-flash-latest",
            contents=[REVIEW_LEARNING_PROMPT, user_prompt],
            config=types.GenerateContentConfig(response_mime_type="application/json")
        )
        
        clean_text = response.text.replace("```json", "").replace("```", "").strip()
        analysis = json.loads(clean_text)
        
        # 2. LƯU BÀI HỌC VÀO VECTOR DB (Dành cho AI Chatbot đọc)
        if analysis.get("qa_knowledge") and analysis["qa_knowledge"] != "None":
            doc_id = hashlib.md5(review.review_text.encode()).hexdigest()
            resolved_qa_col.add(
                documents=[f"[Kinh nghiệm từ Review {review.rating} sao]: {analysis['qa_knowledge']}"],
                ids=[f"rev_{doc_id}"]
            )

        # 3. LƯU REVIEW GỐC & TẠO TASK VÀO SQL (Dành cho Dashboard hiển thị)
        db = SessionLocal()
        try:
            # Lưu lịch sử Review gốc
            new_review_log = ReviewLog(
                product_id=review.product_id,
                rating=review.rating,
                review_text=review.review_text,
                customer_name=review.customer_name,
                ai_insight=analysis.get('qa_knowledge', "Không có insight nổi bật")
            )
            db.add(new_review_log)

            # Tạo Task nếu Review xấu
            created_task = False
            if analysis.get("action_needed") or review.rating <= 3:
                instruction = f"CẢNH BÁO REVIEW {review.rating} SAO: {analysis.get('key_issue')}. Nội dung: '{review.review_text}'"
                
                target_agent = "RiskManager"
                if "giá" in review.review_text.lower():
                    target_agent = "Pricing"
                elif "màu" in review.review_text.lower():
                    target_agent = "Content"
                    
                new_task = CoordinationTask(
                    target_agent=target_agent,
                    product_id=review.product_id,
                    instruction=instruction,
                    status="pending"
                )
                db.add(new_task)
                created_task = True
            
            db.commit()
        except Exception as db_e:
            db.rollback()
            print("Lỗi Database:", db_e)
        finally:
            db.close()

        return {"status": "success", "message": "Đã lưu Review & Cập nhật trí nhớ AI"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/reviews")
async def get_all_reviews(product_id: str = None, limit: int = 20):
    """
    API dùng để kéo dữ liệu Review từ Database ra cho Frontend hiển thị.
    Nếu truyền product_id thì chỉ lấy review của sản phẩm đó.
    """
    db = SessionLocal()
    try:
        query = db.query(ReviewLog)
        
        # Lọc theo sản phẩm nếu Frontend có truyền product_id
        if product_id:
            query = query.filter(ReviewLog.product_id == product_id)
            
        # Sắp xếp mới nhất đưa lên đầu
        reviews = query.order_by(ReviewLog.timestamp.desc()).limit(limit).all()
        
        return {
            "total_fetched": len(reviews),
            "data": reviews
        }
    finally:
        db.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)