from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import backend.database as db
from backend.main import reset_all_data
import asyncio
import os

os.environ["ADMIN_API_KEY"] = "test"

async def test():
    print("Testing reset_all_data...")
    try:
        res = await reset_all_data()
        print(res)
        
        session = db.SessionLocal()
        print("Count reviews:", session.query(db.ReviewLog).count())
        session.close()
    except Exception as e:
        print("ERROR:", e)

asyncio.run(test())
