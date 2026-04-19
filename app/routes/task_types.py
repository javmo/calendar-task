"""
Task Types routes — management of the task type lookup table.

All endpoints require admin role.

Endpoints:
  GET    /api/task-types                    — list (query: incluirInactivos, conUso)
  POST   /api/task-types                    — create
  GET    /api/task-types/{id}/usage         — usage counts
  POST   /api/task-types/merge              — merge two types (cascade + delete origen)
  PUT    /api/task-types/{id}               — partial update (rename cascades)
  DELETE /api/task-types/{id}              — soft delete; hard delete with ?hard=true
  POST   /api/task-types/{id}/rename        — explicit rename with cascade

Note on transactions: this deployment runs a standalone Mongo instance (no replica
set), so multi-document transactions are not available. All cascade operations are
performed as sequential atomic updates. Each individual update_many / update_one call
is atomic at the collection level; partial failure is logged clearly.

Note on merge notes: when both origen and destino have a note for the same key in
notasPorTarea, the destino's note is preserved (not overwritten). This avoids losing
intentional per-client overrides on the target type.
"""
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

import app.database as _db_module
from app.auth import require_admin
from app.models import TaskTypeIn, TaskTypeMergeBody, TaskTypeRenameBody, TaskTypeUpdate

router = APIRouter(prefix="/api")


# --------------- helpers ---------------

def _serialize(doc: dict) -> dict:
    """Expose _id as 'id' (hex string) and strip internal fields from API output."""
    oid = doc.pop("_id", None)
    if oid is not None:
        doc["id"] = str(oid)
    doc.pop("nameLower", None)
    return doc


async def _get_by_id(id: str) -> dict:
    """Fetch a task_type by its hex ObjectId string. Raises 404 if missing."""
    try:
        oid = ObjectId(id)
    except Exception:
        raise HTTPException(400, "ID inválido")
    doc = await _db_module.db.task_types.find_one({"_id": oid})
    if not doc:
        raise HTTPException(404, "Tipo de tarea no encontrado")
    return doc


async def _usage_counts(name: str) -> tuple[int, int]:
    """Return (usageClientes, usageTasks) for a given type name."""
    db = _db_module.db
    usage_clientes = await db.clientes.count_documents({"categorias": name})
    usage_tasks = await db.tasks.count_documents({"tarea": name})
    return usage_clientes, usage_tasks


async def _next_task_type_id() -> int:
    last = await _db_module.db.task_types.find_one(
        sort=[("taskTypeId", -1)], projection={"taskTypeId": 1}
    )
    return (last["taskTypeId"] + 1) if last else 1


async def _next_orden() -> int:
    last = await _db_module.db.task_types.find_one(
        sort=[("orden", -1)], projection={"orden": 1}
    )
    return (last["orden"] + 1) if last else 0


# --------------- endpoints ---------------

@router.get("/task-types")
async def list_task_types(
    incluirInactivos: bool = Query(False),
    conUso: bool = Query(False),
    user=Depends(require_admin),
):
    """List all task types, sorted by orden then name."""
    db = _db_module.db
    query = {} if incluirInactivos else {"activo": True}
    docs = await db.task_types.find(query).sort(
        [("orden", 1), ("name", 1)]
    ).to_list(500)

    result = []
    for doc in docs:
        out = _serialize(doc)
        if conUso:
            uc, ut = await _usage_counts(out["name"])
            out["usageClientes"] = uc
            out["usageTasks"] = ut
        result.append(out)

    return result


@router.post("/task-types")
async def create_task_type(body: TaskTypeIn, user=Depends(require_admin)):
    """Create a new task type. 409 if name already exists (case-insensitive)."""
    db = _db_module.db
    name_lower = body.name.strip().lower()

    existing = await db.task_types.find_one({"nameLower": name_lower})
    if existing:
        raise HTTPException(409, f"Ya existe un tipo con el nombre '{body.name}'")

    now = datetime.now(timezone.utc).isoformat()
    new_id = await _next_task_type_id()
    orden = body.orden if body.orden is not None else await _next_orden()

    doc = {
        "taskTypeId": new_id,
        "name": body.name.strip(),
        "nameLower": name_lower,
        "color": body.color,
        "icon": body.icon,
        "descripcion": body.descripcion,
        "categoria": body.categoria,
        "tieneVencimiento": body.tieneVencimiento,
        "activo": body.activo,
        "orden": orden,
        "createdAt": now,
        "updatedAt": now,
    }
    await db.task_types.insert_one(doc)
    return _serialize(doc)


@router.get("/task-types/{id}/usage")
async def get_task_type_usage(id: str, user=Depends(require_admin)):
    """Return usage detail: list of clientes containing this type + task count."""
    doc = await _get_by_id(id)
    name = doc["name"]
    db = _db_module.db

    clientes_raw = await db.clientes.find(
        {"categorias": name}, {"_id": 0, "clienteId": 1, "nombre": 1}
    ).to_list(500)

    usage_tasks = await db.tasks.count_documents({"tarea": name})

    return {
        "clientes": clientes_raw,
        "tasks": usage_tasks,
    }


@router.post("/task-types/merge")
async def merge_task_types(body: TaskTypeMergeBody, user=Depends(require_admin)):
    """
    Merge origen into destino:
    1. Move all tasks where tarea == origen.name → destino.name
    2. For each cliente:
       - Replace origen.name in categorias with destino.name (deduplicated)
       - In notasPorTarea: if destino key absent, move origen's note to destino key;
         if destino key already present, keep destino's note (origen note discarded)
    3. Hard-delete origen type
    """
    db = _db_module.db
    origen_doc = await _get_by_id(body.origenId)
    destino_doc = await _get_by_id(body.destinoId)

    if body.origenId == body.destinoId:
        raise HTTPException(400, "origen y destino deben ser distintos")

    origen_name = origen_doc["name"]
    destino_name = destino_doc["name"]

    # 1. Update tasks
    tasks_result = await db.tasks.update_many(
        {"tarea": origen_name},
        {"$set": {"tarea": destino_name}},
    )
    tasks_actualizadas = tasks_result.modified_count

    # 2. Update clientes
    clientes_con_origen = await db.clientes.find(
        {"categorias": origen_name},
        {"_id": 1, "categorias": 1, "notasPorTarea": 1},
    ).to_list(500)

    clientes_actualizados = 0
    for c in clientes_con_origen:
        cats = c.get("categorias", [])
        # Replace origen_name with destino_name, then deduplicate preserving order
        new_cats = []
        seen = set()
        for cat in cats:
            effective = destino_name if cat == origen_name else cat
            if effective not in seen:
                seen.add(effective)
                new_cats.append(effective)

        # Handle notasPorTarea: keep destino's note if present, else move origen's
        notas = dict(c.get("notasPorTarea") or {})
        if origen_name in notas:
            if destino_name not in notas:
                # Move note to destino key
                notas[destino_name] = notas.pop(origen_name)
            else:
                # Destino already has a note — discard origen's note
                del notas[origen_name]

        await db.clientes.update_one(
            {"_id": c["_id"]},
            {"$set": {"categorias": new_cats, "notasPorTarea": notas}},
        )
        clientes_actualizados += 1

    # 3. Hard-delete origen
    try:
        origen_oid = ObjectId(body.origenId)
    except Exception:
        raise HTTPException(400, "origenId inválido")
    await db.task_types.delete_one({"_id": origen_oid})

    return {
        "ok": True,
        "origenEliminado": origen_name,
        "destinoNombre": destino_name,
        "tasksActualizadas": tasks_actualizadas,
        "clientesActualizados": clientes_actualizados,
    }


@router.put("/task-types/{id}")
async def update_task_type(id: str, body: TaskTypeUpdate, user=Depends(require_admin)):
    """
    Partial update. If name changes, cascades rename to tasks and clientes
    (same logic as the /rename endpoint) before saving.
    """
    db = _db_module.db
    doc = await _get_by_id(id)

    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(400, "Nada que actualizar")

    tasks_actualizadas = 0
    clientes_actualizados = 0

    # Handle rename cascade
    old_name = doc["name"]
    new_name = update_data.get("name")
    if new_name and new_name.strip() != old_name:
        new_name = new_name.strip()
        name_lower = new_name.lower()

        conflict = await db.task_types.find_one({"nameLower": name_lower})
        if conflict and str(conflict["_id"]) != id:
            raise HTTPException(409, f"Ya existe un tipo con el nombre '{new_name}'")

        update_data["name"] = new_name
        update_data["nameLower"] = name_lower

        # Cascade to tasks
        tasks_result = await db.tasks.update_many(
            {"tarea": old_name},
            {"$set": {"tarea": new_name}},
        )
        tasks_actualizadas = tasks_result.modified_count

        # Cascade to clientes.categorias and notasPorTarea
        clientes_con_tipo = await db.clientes.find(
            {"categorias": old_name},
            {"_id": 1, "categorias": 1, "notasPorTarea": 1},
        ).to_list(500)

        for c in clientes_con_tipo:
            new_cats = [new_name if cat == old_name else cat for cat in c.get("categorias", [])]
            notas = dict(c.get("notasPorTarea") or {})
            if old_name in notas:
                notas[new_name] = notas.pop(old_name)
            await db.clientes.update_one(
                {"_id": c["_id"]},
                {"$set": {"categorias": new_cats, "notasPorTarea": notas}},
            )
            clientes_actualizados += 1

    update_data["updatedAt"] = datetime.now(timezone.utc).isoformat()

    try:
        oid = ObjectId(id)
    except Exception:
        raise HTTPException(400, "ID inválido")

    await db.task_types.update_one({"_id": oid}, {"$set": update_data})

    updated = await db.task_types.find_one({"_id": oid})
    out = _serialize(updated)

    if tasks_actualizadas or clientes_actualizados:
        out["_cascade"] = {
            "tasksActualizadas": tasks_actualizadas,
            "clientesActualizados": clientes_actualizados,
        }

    return out


@router.delete("/task-types/{id}")
async def delete_task_type(
    id: str,
    hard: bool = Query(False),
    user=Depends(require_admin),
):
    """
    Soft delete (sets activo=false) by default.
    With ?hard=true performs a physical delete — only allowed if usageClientes == 0
    AND usageTasks == 0. Returns 409 if usage exists.
    """
    db = _db_module.db
    doc = await _get_by_id(id)

    if hard:
        uc, ut = await _usage_counts(doc["name"])
        if uc > 0 or ut > 0:
            raise HTTPException(
                409,
                f"No se puede eliminar: el tipo '{doc['name']}' está en uso "
                f"({ut} tareas, {uc} clientes). Use merge o rename primero.",
            )
        try:
            oid = ObjectId(id)
        except Exception:
            raise HTTPException(400, "ID inválido")
        await db.task_types.delete_one({"_id": oid})
        return {"ok": True, "eliminado": True, "nombre": doc["name"]}

    # Soft delete
    try:
        oid = ObjectId(id)
    except Exception:
        raise HTTPException(400, "ID inválido")
    await db.task_types.update_one(
        {"_id": oid},
        {"$set": {"activo": False, "updatedAt": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True, "desactivado": True, "nombre": doc["name"]}


@router.post("/task-types/{id}/rename")
async def rename_task_type(
    id: str, body: TaskTypeRenameBody, user=Depends(require_admin)
):
    """
    Rename a task type and cascade to tasks.tarea and clientes.categorias /
    clientes.notasPorTarea keys. Sequential updates (no Mongo transaction —
    single-node deployment without replica set).
    """
    db = _db_module.db
    doc = await _get_by_id(id)
    old_name = doc["name"]
    new_name = body.nuevoNombre.strip()

    if not new_name:
        raise HTTPException(400, "nuevoNombre no puede estar vacío")
    if new_name == old_name:
        raise HTTPException(400, "El nuevo nombre es igual al actual")

    name_lower = new_name.lower()
    conflict = await db.task_types.find_one({"nameLower": name_lower})
    if conflict and str(conflict["_id"]) != id:
        raise HTTPException(409, f"Ya existe un tipo con el nombre '{new_name}'")

    # 1. Update task_types record
    try:
        oid = ObjectId(id)
    except Exception:
        raise HTTPException(400, "ID inválido")
    await db.task_types.update_one(
        {"_id": oid},
        {"$set": {
            "name": new_name,
            "nameLower": name_lower,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }},
    )

    # 2. Cascade to tasks
    tasks_result = await db.tasks.update_many(
        {"tarea": old_name},
        {"$set": {"tarea": new_name}},
    )
    tasks_actualizadas = tasks_result.modified_count

    # 3. Cascade to clientes.categorias and notasPorTarea keys
    clientes_con_tipo = await db.clientes.find(
        {"categorias": old_name},
        {"_id": 1, "categorias": 1, "notasPorTarea": 1},
    ).to_list(500)

    clientes_actualizados = 0
    for c in clientes_con_tipo:
        new_cats = [new_name if cat == old_name else cat for cat in c.get("categorias", [])]
        notas = dict(c.get("notasPorTarea") or {})
        if old_name in notas:
            notas[new_name] = notas.pop(old_name)
        await db.clientes.update_one(
            {"_id": c["_id"]},
            {"$set": {"categorias": new_cats, "notasPorTarea": notas}},
        )
        clientes_actualizados += 1

    return {
        "ok": True,
        "anteriorNombre": old_name,
        "nuevoNombre": new_name,
        "tasksActualizadas": tasks_actualizadas,
        "clientesActualizados": clientes_actualizados,
    }
