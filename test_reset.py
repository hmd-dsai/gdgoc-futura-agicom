import asyncio
from backend.main import reset_all_data
async def main():
    try:
        res = await reset_all_data()
        print(res)
    except Exception as e:
        import traceback
        traceback.print_exc()

asyncio.run(main())
