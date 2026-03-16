"""
Migrate data.json to MongoDB.
Run: python scripts/migrate_data.py
"""
import json
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()


async def migrate():
    uri = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    db_name = os.getenv("DB_NAME", "calendario")

    client = AsyncIOMotorClient(uri)
    db = client[db_name]

    # Load data.json
    data_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data.json")
    with open(data_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    tasks = data["tareas"]

    # Check if already migrated
    count = await db.tasks.count_documents({})
    if count > 0:
        confirm = input(
            f"Ya hay {count} tareas en la base de datos. ¿Borrar y reimportar? (s/n): "
        )
        if confirm.lower() != "s":
            print("Cancelado")
            client.close()
            return
        await db.tasks.delete_many({})
        await db.schedules.delete_many({})
        print(f"🗑️  Eliminadas {count} tareas existentes")

    # Transform tasks: rename 'id' → 'taskId', add new fields
    for t in tasks:
        t["taskId"] = t.pop("id")
        t["finalizada"] = False
        t["fechaFinalizacion"] = None
        t["assignedTo"] = None

    if tasks:
        await db.tasks.insert_many(tasks)

    # Create indexes
    await db.tasks.create_index("taskId", unique=True)
    await db.tasks.create_index("assignedTo")
    await db.tasks.create_index("vencimiento")
    await db.users.create_index("email", unique=True)
    await db.schedules.create_index(
        [("userEmail", 1), ("taskId", 1)], unique=True
    )

    print(f"✅ Migradas {len(tasks)} tareas a MongoDB ({db_name})")
    print(f"   Clientes: {len(set(t['cliente'] for t in tasks))}")
    print(f"   Tipos: {len(set(t['tarea'] for t in tasks))}")

    client.close()


if __name__ == "__main__":
    asyncio.run(migrate())
