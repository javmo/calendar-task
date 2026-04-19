"""
Seed helpers for bootstrap data.

`seed_task_types_if_empty` is called from the app lifespan so a fresh DB
auto-populates the `task_types` collection on first startup. The standalone
`scripts/seed_task_types.py` wrapper reuses the same logic for manual runs.
"""
from datetime import datetime, timezone


# Canonical 14 types mirrored from static/js/constants.js TASK_COLORS.
# Order here determines the default `orden` value (0-indexed).
_TASK_COLORS = [
    ("Casas Particulares",     "#ec4899"),
    ("VEP Monotributo",        "#f97316"),
    ("VEP Autonomos",          "#eab308"),
    ("IVA",                    "#3b82f6"),
    ("Libro IVA Digital",      "#10b981"),
    ("IIBB CM",                "#8b5cf6"),
    ("IIBB ARBA",              "#a855f7"),
    ("IIBB AGIP",              "#d946ef"),
    ("Liquidación de sueldos", "#ef4444"),
    ("Tareas generales",       "#64748b"),
    ("LSD / F 931",            "#ef4444"),
    ("Boletas sindicales",     "#fb7185"),
    ("VEP Anticipo BP",        "#eab308"),
    ("VEP Anticipo Gcias",     "#ca8a04"),
]

_CON_VTO = {
    "Casas Particulares", "VEP Monotributo", "VEP Autonomos",
    "IIBB CM", "IIBB ARBA", "IIBB AGIP", "IVA", "Libro IVA Digital",
}


async def seed_task_types_if_empty(db) -> int:
    """Insert the canonical 14 task types if the collection is empty.

    Returns the number of documents inserted (0 if the collection already had data).
    Safe to call on every startup — no-op after the first run.
    """
    existing = await db.task_types.count_documents({}, limit=1)
    if existing:
        return 0

    now = datetime.now(timezone.utc).isoformat()
    docs = []
    for orden, (name, color) in enumerate(_TASK_COLORS):
        tiene_vto = name in _CON_VTO
        docs.append({
            "taskTypeId": orden + 1,
            "name": name,
            "nameLower": name.lower(),
            "color": color,
            "icon": None,
            "descripcion": None,
            "categoria": "fiscal" if tiene_vto else "general",
            "tieneVencimiento": tiene_vto,
            "activo": True,
            "orden": orden,
            "createdAt": now,
            "updatedAt": now,
        })

    await db.task_types.insert_many(docs)
    return len(docs)
