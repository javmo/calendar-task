"""
Task history log helper.
"""
from datetime import datetime, timezone

import app.database as _db_module


async def add_history_entry(
    task_id: int,
    action: str,
    user_email: str,
    user_name: str,
    comment: str = "",
    extra: dict = None,
):
    """Add an entry to the task history log."""
    entry = {
        "taskId": task_id,
        "action": action,
        "userEmail": user_email,
        "userName": user_name,
        "comment": comment,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    if extra:
        entry.update(extra)
    await _db_module.db.task_history.insert_one(entry)
