"""
Schedule (Personal Calendar) routes.

Endpoints:
  GET    /api/schedule
  POST   /api/schedule
  PUT    /api/schedule/reorder
  DELETE /api/schedule/{task_id}
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pymongo import UpdateOne

import app.database as _db_module
from app.auth import get_current_user
from app.models import ScheduleIn, ScheduleReorder

router = APIRouter(prefix="/api")


@router.get("/schedule")
async def get_schedule(user=Depends(get_current_user)):
    entries = await _db_module.db.schedules.find(
        {"userEmail": user["email"]}, {"_id": 0}
    ).to_list(5000)
    entries.sort(key=lambda e: e.get("sortOrder", 0))
    return entries


@router.post("/schedule")
async def upsert_schedule(entry: ScheduleIn, user=Depends(get_current_user)):
    existing = await _db_module.db.schedules.find_one(
        {"userEmail": user["email"], "taskId": entry.taskId}
    )

    async def next_sort_order_for_date(scheduled_date: str) -> int:
        pipeline = [
            {"$match": {"userEmail": user["email"], "scheduledDate": scheduled_date}},
            {"$group": {"_id": None, "maxOrder": {"$max": "$sortOrder"}}},
        ]
        result = await _db_module.db.schedules.aggregate(pipeline).to_list(1)
        if result and result[0].get("maxOrder") is not None:
            return result[0]["maxOrder"] + 1
        return 0

    if existing:
        update_fields = {
            "scheduledDate": entry.scheduledDate,
            "notes": entry.notes,
        }
        if existing.get("scheduledDate") != entry.scheduledDate:
            update_fields["sortOrder"] = await next_sort_order_for_date(entry.scheduledDate)
        await _db_module.db.schedules.update_one(
            {"userEmail": user["email"], "taskId": entry.taskId},
            {"$set": update_fields},
        )
    else:
        doc = entry.model_dump()
        doc["userEmail"] = user["email"]
        doc["createdAt"] = datetime.now(timezone.utc).isoformat()
        doc["sortOrder"] = await next_sort_order_for_date(entry.scheduledDate)
        await _db_module.db.schedules.insert_one(doc)
    return {"ok": True}


@router.put("/schedule/reorder")
async def reorder_schedule(body: ScheduleReorder, user=Depends(get_current_user)):
    """
    Set sortOrder for each taskId in the list to match its index position.
    Only updates entries belonging to the current user.
    """
    ops = [
        UpdateOne(
            {"userEmail": user["email"], "taskId": task_id, "scheduledDate": body.scheduledDate},
            {"$set": {"sortOrder": index}},
        )
        for index, task_id in enumerate(body.taskIds)
    ]
    if ops:
        await _db_module.db.schedules.bulk_write(ops)
    return {"ok": True}


@router.delete("/schedule/{task_id}")
async def delete_schedule(task_id: int, user=Depends(get_current_user)):
    await _db_module.db.schedules.delete_one(
        {"userEmail": user["email"], "taskId": task_id}
    )
    return {"ok": True}
