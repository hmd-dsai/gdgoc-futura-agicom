import os
import json
from fastapi import HTTPException
from google.genai import types
from config import client
from prompts import DATA_ANALYST_PROMPT
from models import MarketInsight

def fetch_raw_market_data(sku_id: str) -> dict:
    file_path = f"backend/mock_data/{sku_id}-raw.json"
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"Không tìm thấy file: {file_path}")
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)

async def analyze_raw_data_phase1(sku_id: str) -> MarketInsight:
    print(f"[*] PHASE 1: Đang trích xuất dữ liệu thô cho {sku_id}...")
    
    # 1. Đọc dữ liệu thô
    raw_data = fetch_raw_market_data(sku_id)
    user_prompt = f"Dữ liệu thô từ sàn: {json.dumps(raw_data, ensure_ascii=False)}"
    
    # 2. Gọi Gemini đóng vai Data Analyst
    response = await client.aio.models.generate_content(
        model="gemini-flash-latest",
        contents=[DATA_ANALYST_PROMPT, user_prompt],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=MarketInsight,
            http_options={'timeout': 45000}
        )
    )
    
    if not response.text:
        raise HTTPException(status_code=500, detail="Lỗi Phase 1: Không có phản hồi.")
        
    clean_text = response.text.replace("```json", "").replace("```", "").strip()
    insight_dict = json.loads(clean_text)
    
    print(f"[*] PHASE 1 HOÀN TẤT: {insight_dict['analyst_summary']}")
    
    # Trả về cả Insight đã lọc và Internal Data gốc (để lát nữa đưa cho Strategist)
    return {
        "insight": insight_dict,
        "internal_data": raw_data["internal_data"]
    }

async def analyze_strategy_slow_track(data: dict):
    """THINK -> PLAN: Luồng chậm (Phân tích giá & Nội dung)"""
    prompt = f"Phân tích dữ liệu thị trường sau và đưa ra chiến lược định giá/nội dung: {data}"
    
    response = await client.aio.models.generate_content(
        model="gemini-flash-latest",
        contents=prompt,
        config=types.GenerateContentConfig(response_mime_type="application/json")
    )
    # Trong thực tế, sẽ có response_schema ở đây
    return {"track": "Slow Track", "strategy": "Pricing & Content Proposal", "details": response.text}

async def customer_care_fast_track(data: dict):
    """THINK -> PLAN -> GUARDRAIL: Luồng nhanh (CSKH)"""
    chat_history = data.get("message", "")
    
    # Prompt tích hợp Safety Guardrail
    prompt = f"""Bạn là Agent CSKH. Trả lời tin nhắn sau: '{chat_history}'.
    Đồng thời tự đánh giá độ tự tin (confidence) của bạn từ 0.0 đến 1.0. 
    Nếu bạn không chắc chắn hoặc khách hàng đang giận dữ, hãy cho confidence < 0.7.
    Trả về định dạng JSON: {{"reply": "...", "confidence": 0.9}}"""
    
    response = await client.aio.models.generate_content(
        model="gemini-flash-latest",
        contents=prompt,
        config=types.GenerateContentConfig(response_mime_type="application/json")
    )
    
    try:
        result = json.loads(response.text)
        confidence = result.get("confidence", 1.0)
        
        # ACT: SAFETY GUARDRAIL LOGIC
        if confidence >= 0.7:
            return {"track": "Fast Track", "action": "Auto Reply to Customers", "message": result["reply"], "status": "Safe"}
        else:
            return {"track": "Fast Track", "action": "Send Proposals to Dashboard", "draft": result["reply"], "status": "Flagged / Low Confidence"}
    except:
        return {"track": "Fast Track", "status": "Error parsing JSON"}