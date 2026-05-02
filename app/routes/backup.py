"""
Admin backup routes — all admin-only.

POST /trigger also accepts the X-Backup-Secret header so Cloud Scheduler
can call it without a Firebase token.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

import app.database as _db_module
from app import backup_service
from app.auth import get_current_user, require_admin
from app.config import BACKUP_SECRET, GCS_BUCKET_NAME

router = APIRouter(prefix="/api/admin/backup", tags=["backup"])


# =================== HELPERS ===================

async def _require_trigger_access(
    user=Depends(get_current_user),
    x_backup_secret: str = Header(None, alias="X-Backup-Secret"),
):
    """Accept either a valid admin session OR the BACKUP_SECRET header."""
    if x_backup_secret and BACKUP_SECRET and x_backup_secret == BACKUP_SECRET:
        return {"email": "scheduler", "role": "admin"}
    caller = await _db_module.db.users.find_one({"email": user["email"]})
    if not caller or caller.get("role") != "admin":
        raise HTTPException(403, "Solo admin")
    return user


async def _bucket() -> str:
    s = await _db_module.db.backup_settings.find_one({}, {"_id": 0})
    return s.get("gcs_bucket", GCS_BUCKET_NAME) if s else GCS_BUCKET_NAME


# =================== SETTINGS ===================

class SettingsBody(BaseModel):
    frequency: str = "monthly"   # manual | daily | weekly | monthly
    retention_days: int = 90
    enabled: bool = True
    gcs_bucket: str = GCS_BUCKET_NAME


@router.get("/settings")
async def get_settings(_=Depends(require_admin)):
    s = await _db_module.db.backup_settings.find_one({}, {"_id": 0})
    if not s:
        return {
            "frequency": "monthly",
            "retention_days": 90,
            "enabled": True,
            "gcs_bucket": GCS_BUCKET_NAME,
            "last_backup_at": None,
            "last_backup_size": None,
            "last_backup_status": None,
        }
    s.pop("_id", None)
    return s


@router.put("/settings")
async def update_settings(body: SettingsBody, _=Depends(require_admin)):
    existing = await _db_module.db.backup_settings.find_one({}, {"_id": 0}) or {}
    merged = {**existing, **body.model_dump()}
    merged.pop("_id", None)
    await _db_module.db.backup_settings.replace_one({}, merged, upsert=True)
    result = await _db_module.db.backup_settings.find_one({}, {"_id": 0})
    result.pop("_id", None)
    return result


# =================== TRIGGER ===================

@router.post("/trigger")
async def trigger_backup(_=Depends(_require_trigger_access)):
    bucket = await _bucket()
    try:
        result = await backup_service.create_backup(bucket)
        s = await _db_module.db.backup_settings.find_one({}, {"_id": 0}) or {}
        await _db_module.db.backup_settings.update_one(
            {},
            {"$set": {
                "last_backup_at": datetime.now(timezone.utc).isoformat(),
                "last_backup_size": result["size_bytes"],
                "last_backup_status": "success",
            }},
            upsert=True,
        )
        await backup_service.apply_retention(bucket, s.get("retention_days", 90))
        return result
    except Exception as e:
        await _db_module.db.backup_settings.update_one(
            {}, {"$set": {"last_backup_status": "error"}}, upsert=True
        )
        raise HTTPException(500, f"Error al crear backup: {e}")


# =================== LIST ===================

@router.get("/list")
async def list_backups(_=Depends(require_admin)):
    return await backup_service.list_backups(await _bucket())


# =================== RESTORE ===================

@router.post("/{backup_id:path}/restore")
async def restore_backup(backup_id: str, _=Depends(require_admin)):
    blob_name = f"backups/{backup_id}"
    try:
        restored = await backup_service.restore_backup(await _bucket(), blob_name)
        return {"restored": restored}
    except Exception as e:
        raise HTTPException(500, f"Error al restaurar: {e}")


# =================== DELETE ===================

@router.delete("/{backup_id:path}")
async def delete_backup(backup_id: str, _=Depends(require_admin)):
    blob_name = f"backups/{backup_id}"
    try:
        await backup_service.delete_backup(await _bucket(), blob_name)
        return {"deleted": backup_id}
    except Exception as e:
        raise HTTPException(500, f"Error al eliminar: {e}")
