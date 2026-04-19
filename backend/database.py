# from motor.motor_asyncio import AsyncIOMotorClient
# from pymongo import MongoClient

import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI")
DB_NAME = os.getenv("DB_NAME", "supply_chain")

client = AsyncIOMotorClient(MONGODB_URI)
db = client[DB_NAME]

async def ping_db():
    await client.admin.command("ping")
    return True

# tesing only runs when "python thisfile name and run it"
if __name__ == "__main__":
    import asyncio
    async def test():
        try:
            await ping_db()
            print("Connected to MongoDB Atlas successfully")
        except Exception as e:
            print(f"Connection failed: {e}")
    asyncio.run(test())