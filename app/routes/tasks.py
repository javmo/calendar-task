"""
Task routes — CRUD + full workflow.

Endpoints:
  GET    /api/tasks
  POST   /api/tasks
  PUT    /api/tasks/bulk-assign          (admin)
  GET    /api/tasks/pending-review       (admin)
  PUT    /api/tasks/{task_id}
  DELETE /api/tasks/{task_id}
  PUT    /api/tasks/{task_id}/status
  PUT    /api/tasks/{task_id}/finalize
  PUT    /api/tasks/{task_id}/restore
  PUT    /api/tasks/{task_id}/submit-review
  PUT    /api/tasks/{task_id}/undo-submit
  PUT    /api/tasks/{task_id}/approve    (admin)
  PUT    /api/tasks/{task_id}/return     (admin)
  GET    /api/tasks/{task_id}/history
  POST   /api/tasks/{task_id}/comments
  PUT    /api/tasks/{task_id}/mark-read
  GET    /api/unread-counts
  GET    /api/mentions
"""
import re
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

import app.database as _db_module
from app.auth import get_current_user, require_admin
from app.config import (
    ESTADO_APROBADA,
    ESTADO_DEVUELTA,
    ESTADO_EN_REVISION,
    ESTADO_PENDIENTE,
    MES_NOMBRES,
    SMTP_HOST,
)
from app.email import _approval_email_html, _return_email_html, send_email
from app.history import add_history_entry
from app.models import (
    BulkAssignBody,
    TaskCommentBody,
    TaskIn,
    TaskReviewBody,
    TaskUpdate,
)

router = APIRouter(prefix="/api")


# --------------- Task CRUD ---------------

@router.get("/tasks")
async def get_tasks(user=Depends(get_current_user)):
    tasks = await _db_module.db.tasks.find({}, {"_id": 0}).sort("taskId", 1).to_list(5000)
    return tasks


@router.post("/tasks")
async def create_task(task: TaskIn, user=Depends(get_current_user)):
    last = await _db_module.db.tasks.find_one(
        sort=[("taskId", -1)], projection={"taskId": 1}
    )
    new_id = (last["taskId"] + 1) if last else 1

    doc = task.model_dump()
    doc["taskId"] = new_id
    doc["completado"] = False
    doc["revisado"] = False
    doc["enviado"] = False
    doc["finalizada"] = False
    doc["fechaFinalizacion"] = None
    doc["estado"] = ESTADO_PENDIENTE
    doc["createdAt"] = datetime.now(timezone.utc).isoformat()
    # Derive mes from vencimiento
    try:
        vto_parts = doc["vencimiento"].split("-")
        doc["mes"] = MES_NOMBRES[int(vto_parts[1]) - 1]
    except (IndexError, ValueError):
        doc["mes"] = ""

    await _db_module.db.tasks.insert_one(doc)
    doc.pop("_id", None)

    await add_history_entry(
        new_id, "creada", user.get("email", ""),
        user.get("name", ""), "Tarea creada"
    )

    return doc


# NOTE: bulk-assign and pending-review MUST come before {task_id} routes so
# FastAPI does not try to cast "bulk-assign" or "pending-review" as an int.

@router.put("/tasks/bulk-assign")
async def bulk_assign_tasks(body: BulkAssignBody, user=Depends(require_admin)):
    if not body.taskIds:
        raise HTTPException(400, "No se enviaron tareas")

    update_data = {}
    if body.assignedTo is not None:
        update_data["assignedTo"] = body.assignedTo
    if body.responsable is not None:
        update_data["responsable"] = body.responsable

    if not update_data:
        raise HTTPException(400, "Nada que asignar")

    result = await _db_module.db.tasks.update_many(
        {"taskId": {"$in": body.taskIds}},
        {"$set": update_data},
    )

    return {"ok": True, "modified": result.modified_count}


@router.get("/tasks/pending-review")
async def get_pending_review(user=Depends(require_admin)):
    tasks = await _db_module.db.tasks.find(
        {"estado": ESTADO_EN_REVISION}, {"_id": 0}
    ).sort("vencimiento", 1).to_list(5000)
    return tasks


@router.put("/tasks/{task_id}")
async def update_task(task_id: int, task: TaskUpdate, user=Depends(get_current_user)):
    update_data = {k: v for k, v in task.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(400, "Nada que actualizar")

    result = await _db_module.db.tasks.update_one({"taskId": task_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(404, "Tarea no encontrada")

    updated = await _db_module.db.tasks.find_one({"taskId": task_id}, {"_id": 0})
    return updated


@router.delete("/tasks/{task_id}")
async def delete_task(task_id: int, user=Depends(get_current_user)):
    result = await _db_module.db.tasks.delete_one({"taskId": task_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Tarea no encontrada")
    await _db_module.db.schedules.delete_many({"taskId": task_id})
    return {"ok": True}


# --------------- Workflow ---------------

@router.put("/tasks/{task_id}/status")
async def toggle_status(task_id: int, body: dict, user=Depends(get_current_user)):
    field = body.get("field")
    if field not in ("completado", "revisado", "enviado"):
        raise HTTPException(400, "Campo inválido")

    caller = await _db_module.db.users.find_one({"email": user["email"]})
    is_admin = caller and caller.get("role") == "admin"
    if not is_admin and field != "completado":
        raise HTTPException(403, "Solo admin puede modificar ese campo")

    task = await _db_module.db.tasks.find_one({"taskId": task_id})
    if not task:
        raise HTTPException(404, "Tarea no encontrada")

    new_val = not task.get(field, False)
    await _db_module.db.tasks.update_one({"taskId": task_id}, {"$set": {field: new_val}})

    updated = await _db_module.db.tasks.find_one({"taskId": task_id}, {"_id": 0})
    return updated


@router.put("/tasks/{task_id}/finalize")
async def finalize_task(task_id: int, user=Depends(get_current_user)):
    task = await _db_module.db.tasks.find_one({"taskId": task_id})
    if not task:
        raise HTTPException(404, "Tarea no encontrada")

    today = date.today().isoformat()
    await _db_module.db.tasks.update_one(
        {"taskId": task_id},
        {"$set": {
            "finalizada": True,
            "fechaFinalizacion": today,
            "completado": True,
            "revisado": True,
            "enviado": True,
            "estado": ESTADO_APROBADA,
        }},
    )

    await add_history_entry(
        task_id, "finalizada", user.get("email", ""),
        user.get("name", ""), "Tarea finalizada directamente"
    )

    updated = await _db_module.db.tasks.find_one({"taskId": task_id}, {"_id": 0})
    return updated


@router.put("/tasks/{task_id}/restore")
async def restore_task(task_id: int, user=Depends(get_current_user)):
    result = await _db_module.db.tasks.update_one(
        {"taskId": task_id},
        {"$set": {
            "finalizada": False,
            "fechaFinalizacion": None,
            "completado": False,
            "revisado": False,
            "enviado": False,
            "estado": ESTADO_PENDIENTE,
        }},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Tarea no encontrada")

    await add_history_entry(
        task_id, "restaurada", user.get("email", ""),
        user.get("name", ""), "Tarea restaurada"
    )

    updated = await _db_module.db.tasks.find_one({"taskId": task_id}, {"_id": 0})
    return updated


@router.put("/tasks/{task_id}/submit-review")
async def submit_for_review(task_id: int, body: TaskReviewBody = None, user=Depends(get_current_user)):
    task = await _db_module.db.tasks.find_one({"taskId": task_id})
    if not task:
        raise HTTPException(404, "Tarea no encontrada")

    if task.get("estado") not in (ESTADO_PENDIENTE, ESTADO_DEVUELTA):
        raise HTTPException(400, "La tarea no está en estado pendiente o devuelta")

    await _db_module.db.tasks.update_one(
        {"taskId": task_id},
        {"$set": {
            "estado": ESTADO_EN_REVISION,
            "completado": True,
        }},
    )

    comment = (body.comment if body else "") or "Tarea enviada a revisión"
    await add_history_entry(
        task_id, "enviada_a_revision", user.get("email", ""),
        user.get("name", ""), comment
    )

    updated = await _db_module.db.tasks.find_one({"taskId": task_id}, {"_id": 0})
    return updated


@router.put("/tasks/{task_id}/undo-submit")
async def undo_submit_review(task_id: int, user=Depends(get_current_user)):
    task = await _db_module.db.tasks.find_one({"taskId": task_id})
    if not task:
        raise HTTPException(404, "Tarea no encontrada")

    if task.get("estado") != ESTADO_EN_REVISION:
        raise HTTPException(400, "La tarea no está en revisión")

    await _db_module.db.tasks.update_one(
        {"taskId": task_id},
        {"$set": {
            "estado": ESTADO_PENDIENTE,
            "completado": False,
        }},
    )

    await add_history_entry(
        task_id, "revision_deshecha", user.get("email", ""),
        user.get("name", ""), "Revisión deshecha por el usuario"
    )

    updated = await _db_module.db.tasks.find_one({"taskId": task_id}, {"_id": 0})
    return updated


@router.put("/tasks/{task_id}/approve")
async def approve_task(task_id: int, body: TaskReviewBody = None, user=Depends(require_admin)):
    caller = await _db_module.db.users.find_one({"email": user["email"]})
    task = await _db_module.db.tasks.find_one({"taskId": task_id})
    if not task:
        raise HTTPException(404, "Tarea no encontrada")

    if task.get("estado") != ESTADO_EN_REVISION:
        raise HTTPException(400, "La tarea no está en revisión")

    today = date.today().isoformat()
    await _db_module.db.tasks.update_one(
        {"taskId": task_id},
        {"$set": {
            "estado": ESTADO_APROBADA,
            "completado": True,
            "revisado": True,
            "enviado": True,
            "finalizada": True,
            "fechaFinalizacion": today,
        }},
    )

    comment = (body.comment if body else "") or "Tarea aprobada por admin"
    await add_history_entry(
        task_id, "aprobada", user.get("email", ""),
        user.get("name", ""), comment
    )

    assigned_email = task.get("assignedTo", "")
    if assigned_email:
        cliente = task.get("cliente", "")
        tarea = task.get("tarea", "")
        admin_name = caller.get("displayName", user.get("name", "Admin"))
        await send_email(
            assigned_email,
            f"Tarea aprobada: {cliente} — {tarea}",
            _approval_email_html(cliente, tarea, admin_name, today, comment),
        )

    updated = await _db_module.db.tasks.find_one({"taskId": task_id}, {"_id": 0})
    return {**updated, "emailSent": bool(assigned_email and SMTP_HOST)}


@router.put("/tasks/{task_id}/return")
async def return_task(task_id: int, body: TaskReviewBody, user=Depends(require_admin)):
    caller = await _db_module.db.users.find_one({"email": user["email"]})
    task = await _db_module.db.tasks.find_one({"taskId": task_id})
    if not task:
        raise HTTPException(404, "Tarea no encontrada")

    if task.get("estado") != ESTADO_EN_REVISION:
        raise HTTPException(400, "La tarea no está en revisión")

    await _db_module.db.tasks.update_one(
        {"taskId": task_id},
        {"$set": {
            "estado": ESTADO_DEVUELTA,
            "completado": False,
            "revisado": False,
        }},
    )

    comment = body.comment or "Devuelta con ajustes"
    await add_history_entry(
        task_id, "devuelta", user.get("email", ""),
        user.get("name", ""), comment
    )

    assigned_email = task.get("assignedTo", "")
    if assigned_email:
        cliente = task.get("cliente", "")
        tarea = task.get("tarea", "")
        admin_name = caller.get("displayName", user.get("name", "Admin"))
        await send_email(
            assigned_email,
            f"Tarea devuelta: {cliente} — {tarea}",
            _return_email_html(cliente, tarea, admin_name, comment),
        )

    updated = await _db_module.db.tasks.find_one({"taskId": task_id}, {"_id": 0})
    return updated


# --------------- History / Comments ---------------

@router.get("/tasks/{task_id}/history")
async def get_task_history(task_id: int, user=Depends(get_current_user)):
    entries = await _db_module.db.task_history.find(
        {"taskId": task_id}, {"_id": 0}
    ).sort("createdAt", -1).to_list(200)
    return entries


@router.post("/tasks/{task_id}/comments")
async def add_task_comment(task_id: int, body: TaskCommentBody, user=Depends(get_current_user)):
    task = await _db_module.db.tasks.find_one({"taskId": task_id})
    if not task:
        raise HTTPException(404, "Tarea no encontrada")

    comment = body.comment.strip()
    if not comment:
        raise HTTPException(400, "El comentario no puede estar vacío")

    # Parse @mentions (match @Word or @"Name With Spaces")
    raw_mentions = re.findall(r'@"([^"]+)"|@(\S+)', comment)
    mention_names = [m[0] or m[1] for m in raw_mentions]

    mentioned_emails = []
    if mention_names:
        all_users = await _db_module.db.users.find(
            {}, {"email": 1, "responsableName": 1, "displayName": 1}
        ).to_list(200)
        for name in mention_names:
            name_lower = name.lower()
            for u in all_users:
                if (u.get("responsableName", "").lower() == name_lower or
                        u.get("displayName", "").lower() == name_lower or
                        u.get("email", "").lower() == name_lower):
                    if u["email"] not in mentioned_emails:
                        mentioned_emails.append(u["email"])
                    break

    extra = {}
    if mentioned_emails:
        extra["mentions"] = mentioned_emails

    await add_history_entry(
        task_id, "comentario", user.get("email", ""),
        user.get("name", ""), comment, extra=extra
    )
    return {"ok": True, "mentions": mentioned_emails}


# --------------- Unread Counts & Mentions ---------------

@router.get("/unread-counts")
async def get_unread_counts(user=Depends(get_current_user)):
    """Return {taskId: unreadCount} for comment/mention history entries."""
    email = user.get("email", "")

    reads = await _db_module.db.task_reads.find(
        {"userEmail": email}, {"_id": 0}
    ).to_list(5000)
    read_map = {r["taskId"]: r["lastReadAt"] for r in reads}

    pipeline = [
        {"$match": {"action": {"$in": ["comentario", "mencion"]}}},
        {"$group": {
            "_id": "$taskId",
            "entries": {"$push": {
                "createdAt": "$createdAt",
                "userEmail": "$userEmail"
            }}
        }},
    ]
    results = await _db_module.db.task_history.aggregate(pipeline).to_list(5000)

    counts = {}
    for r in results:
        task_id = r["_id"]
        last_read = read_map.get(task_id, "")
        unread = sum(
            1 for e in r["entries"]
            if e["createdAt"] > last_read and e["userEmail"] != email
        )
        if unread > 0:
            counts[str(task_id)] = unread
    return counts


@router.put("/tasks/{task_id}/mark-read")
async def mark_task_read(task_id: int, user=Depends(get_current_user)):
    email = user.get("email", "")
    await _db_module.db.task_reads.update_one(
        {"userEmail": email, "taskId": task_id},
        {"$set": {"lastReadAt": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True}


@router.get("/mentions")
async def get_mentions(user=Depends(get_current_user)):
    """Get recent mentions for the current user (up to 50)."""
    email = user.get("email", "")

    entries = await _db_module.db.task_history.find(
        {"mentions": email}, {"_id": 0}
    ).sort("createdAt", -1).to_list(50)

    task_ids = list(set(e["taskId"] for e in entries))
    reads = await _db_module.db.task_reads.find(
        {"userEmail": email, "taskId": {"$in": task_ids}}, {"_id": 0}
    ).to_list(500)
    read_map = {r["taskId"]: r["lastReadAt"] for r in reads}

    for e in entries:
        last_read = read_map.get(e["taskId"], "")
        e["isUnread"] = e["createdAt"] > last_read

    return entries
