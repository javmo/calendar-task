"""
MongoDB client setup.

Call `init_db()` during lifespan startup and `close_db()` during shutdown.
All route modules import the module-level `db` variable, which is populated
before any request is handled.
"""
from motor.motor_asyncio import AsyncIOMotorClient

db_client: AsyncIOMotorClient = None
db = None


def init_db(uri: str, db_name: str):
    global db_client, db
    db_client = AsyncIOMotorClient(uri)
    db = db_client[db_name]


def close_db():
    global db_client
    if db_client:
        db_client.close()
