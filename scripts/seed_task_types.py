"""
Seed script: populate the task_types collection with the canonical 14 types
derived from TASK_COLORS in static/js/constants.js.

Idempotent — safe to re-run. Uses upsert by nameLower so renaming a type in
the DB will not create a duplicate, but adding a brand-new name here will
insert it on the next run.

Usage:
  python scripts/seed_task_types.py
  # or against a remote DB:
  MONGO_URI=mongodb://... DB_NAME=calendario python scripts/seed_task_types.py
"""
import asyncio
import os
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

# --------------- Seed data ---------------
# Canonical list mirrored from static/js/constants.js TASK_COLORS.
# Order here determines the default `orden` value (0-indexed).
TASK_COLORS = [
    ("Casas Particulares",    "#ec4899"),
    ("VEP Monotributo",       "#f97316"),
    ("VEP Autonomos",         "#eab308"),
    ("IVA",                   "#3b82f6"),
    ("Libro IVA Digital",     "#10b981"),
    ("IIBB CM",               "#8b5cf6"),
    ("IIBB ARBA",             "#a855f7"),
    ("IIBB AGIP",             "#d946ef"),
    ("Liquidación de sueldos","#ef4444"),
    ("Tareas generales",      "#64748b"),
    ("LSD / F 931",           "#ef4444"),
    ("Boletas sindicales",    "#fb7185"),
    ("VEP Anticipo BP",       "#eab308"),
    ("VEP Anticipo Gcias",    "#ca8a04"),
]

# Seed default from app/config.py TASK_TYPES_CON_VTO
# (runtime list is stored in DB; this is only used during seeding)
TASK_TYPES_CON_VTO = {
    "Casas Particulares",
    "VEP Monotributo",
    "VEP Autonomos",
    "IIBB CM",
    "IIBB ARBA",
    "IIBB AGIP",
    "IVA",
    "Libro IVA Digital",
}


async def main():
    mongo_uri = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "calendario")

    client = AsyncIOMotorClient(mongo_uri)
    db = client[db_name]

    # Ensure the unique index on nameLower exists before upserting
    try:
        await db.task_types.create_index("nameLower", unique=True)
        await db.task_types.create_index("taskTypeId", unique=True)
    except Exception as e:
        print(f"  Index creation note: {e}")

    # Determine next taskTypeId to use for new docs
    last = await db.task_types.find_one(
        sort=[("taskTypeId", -1)], projection={"taskTypeId": 1}
    )
    next_id = (last["taskTypeId"] + 1) if last else 1

    now = datetime.now(timezone.utc).isoformat()
    inserted = 0
    skipped = 0

    for orden, (name, color) in enumerate(TASK_COLORS):
        name_lower = name.lower()
        tiene_vencimiento = name in TASK_TYPES_CON_VTO
        categoria = "fiscal" if tiene_vencimiento else "general"

        # Check if this name already exists (idempotent)
        existing = await db.task_types.find_one({"nameLower": name_lower})
        if existing:
            skipped += 1
            print(f"  SKIP (already exists): {name}")
            continue

        doc = {
            "taskTypeId": next_id,
            "name": name,
            "nameLower": name_lower,
            "color": color,
            "icon": None,
            "descripcion": None,
            "categoria": categoria,
            "tieneVencimiento": tiene_vencimiento,
            "activo": True,
            "orden": orden,
            "createdAt": now,
            "updatedAt": now,
        }

        try:
            await db.task_types.insert_one(doc)
            print(f"  INSERTED: {name} (taskTypeId={next_id}, orden={orden}, "
                  f"tieneVencimiento={tiene_vencimiento})")
            next_id += 1
            inserted += 1
        except Exception as e:
            print(f"  ERROR inserting '{name}': {e}")

    print(f"\nDone. Inserted: {inserted}, Already existed: {skipped}")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
