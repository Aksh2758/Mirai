from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import os

load_dotenv()

_client: AsyncIOMotorClient = None

def get_mongo_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(os.getenv("MONGODB_URI"))
    return _client

def get_db():
    client = get_mongo_client()
    return client["nirmaan"]