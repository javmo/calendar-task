"""
Seed script: populate the task_types collection with the canonical 14 types.

This is a thin wrapper around `app.seed.seed_task_types_if_empty` — the app
also runs that same function automatically on startup, so this script is only
needed when you want to seed a DB without booting the full FastAPI app.

Idempotent — re-running is a no-op once the collection has data.

Usage:
  python scripts/seed_task_types.py
  MONGO_URI=mongodb+srv://... DB_NAME=calendario python scripts/seed_task_types.py
"""
import asyncio
import os
import sys

# Make `app` importable when running from the repo root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient

from app.seed import seed_task_types_if_empty


async def main():
    mongo_uri = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "calendario")

    client = AsyncIOMotorClient(mongo_uri)
    db = client[db_name]

    # Ensure unique indexes exist before inserting
    try:
        await db.task_types.create_index("nameLower", unique=True)
        await db.task_types.create_index("taskTypeId", unique=True)
    except Exception as e:
        print(f"  Index creation note: {e}")

    inserted = await seed_task_types_if_empty(db)
    if inserted:
        print(f"Inserted {inserted} task types.")
    else:
        print("Collection already had data — nothing to seed.")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
