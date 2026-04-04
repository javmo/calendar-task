"""
Migration script: Set client categories based on existing tasks.
Run this against the production database after deploying the new code.

Usage:
  MONGO_URI=mongodb://... DB_NAME=calendario python scripts/migrate_client_categories.py
"""

import asyncio
import os

from motor.motor_asyncio import AsyncIOMotorClient


async def main():
    mongo_uri = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "calendario")

    client = AsyncIOMotorClient(mongo_uri)
    db = client[db_name]

    # Get task types per client from existing tasks
    pipeline = [
        {"$group": {"_id": "$cliente", "tareas": {"$addToSet": "$tarea"}}},
    ]
    results = await db.tasks.aggregate(pipeline).to_list(500)
    task_map = {r["_id"]: sorted(r["tareas"]) for r in results}

    # Update each client's categorias based on their existing tasks
    clientes = await db.clientes.find(
        {}, {"_id": 0, "clienteId": 1, "nombre": 1, "categorias": 1}
    ).to_list(500)

    updated = 0
    skipped = 0
    for c in clientes:
        existing_cats = c.get("categorias", [])
        new_cats = task_map.get(c["nombre"], [])

        if not new_cats:
            continue

        # Merge: keep existing + add from tasks
        merged = sorted(set(existing_cats + new_cats))
        if merged != existing_cats:
            await db.clientes.update_one(
                {"clienteId": c["clienteId"]}, {"$set": {"categorias": merged}}
            )
            print(f"  Updated: {c['nombre']} -> {merged}")
            updated += 1
        else:
            skipped += 1

    print(f"\nDone. Updated: {updated}, Already up-to-date: {skipped}, "
          f"Clients without tasks: {len(clientes) - updated - skipped}")


if __name__ == "__main__":
    asyncio.run(main())
