import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

_client: AsyncIOMotorClient | None = None

def get_mongo_db():
    global _client
    if _client is None:
        uri = os.getenv("MONGODB_URI")
        db_name = os.getenv("MONGODB_DB_NAME", "nirmaan")
        if not uri:
            raise ValueError("MONGODB_URI must be set in .env")
        _client = AsyncIOMotorClient(uri)
    return _client[os.getenv("MONGODB_DB_NAME", "nirmaan")]

def get_projects_collection():
    db = get_mongo_db()
    return db["projects"]
