"""
Database backup/restore using Google Cloud Storage.

GCS operations are synchronous (google-cloud-storage SDK); they are wrapped
with asyncio.to_thread so the FastAPI event loop is never blocked.
Motor operations stay async.
"""
import asyncio
import gzip
import io
import json
from datetime import datetime, timedelta, timezone

from google.cloud import storage
from google.api_core.exceptions import NotFound

import app.database as _db_module

# Collections included in every backup (backup_settings intentionally excluded)
COLLECTIONS = [
    "tasks",
    "users",
    "clientes",
    "vencimientos",
    "task_types",
    "task_history",
    "task_reads",
    "schedules",
]

BLOB_PREFIX = "backups/"


# =================== GCS HELPERS (sync, run in thread) ===================

def _client() -> storage.Client:
    return storage.Client()


def _ensure_bucket(client: storage.Client, name: str) -> storage.Bucket:
    bucket = client.bucket(name)
    try:
        bucket.reload()
    except NotFound:
        bucket = client.create_bucket(name)
    return bucket


def _upload(bucket_name: str, blob_name: str, data: bytes) -> None:
    c = _client()
    bucket = _ensure_bucket(c, bucket_name)
    blob = bucket.blob(blob_name)
    blob.upload_from_string(data, content_type="application/gzip")


def _download(bucket_name: str, blob_name: str) -> bytes:
    c = _client()
    return c.bucket(bucket_name).blob(blob_name).download_as_bytes()


def _list(bucket_name: str) -> list[dict]:
    c = _client()
    _ensure_bucket(c, bucket_name)
    blobs = list(c.list_blobs(bucket_name, prefix=BLOB_PREFIX + "backup_"))
    result = []
    for blob in blobs:
        result.append({
            "id": blob.name[len(BLOB_PREFIX):],
            "blob_name": blob.name,
            "size_bytes": blob.size or 0,
            "created_at": blob.time_created.isoformat() if blob.time_created else "",
        })
    return sorted(result, key=lambda x: x["created_at"], reverse=True)


def _delete(bucket_name: str, blob_name: str) -> None:
    c = _client()
    c.bucket(bucket_name).blob(blob_name).delete()


def _apply_retention_sync(bucket_name: str, retention_days: int) -> int:
    c = _client()
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    blobs = list(c.list_blobs(bucket_name, prefix=BLOB_PREFIX + "backup_"))
    deleted = 0
    for blob in blobs:
        if blob.time_created and blob.time_created.replace(tzinfo=timezone.utc) < cutoff:
            blob.delete()
            deleted += 1
    return deleted


# =================== ASYNC PUBLIC API ===================

async def create_backup(bucket_name: str) -> dict:
    """Export all collections to GCS as a gzipped JSON blob."""
    data: dict = {}
    for name in COLLECTIONS:
        try:
            docs = await getattr(_db_module.db, name).find({}, {"_id": 0}).to_list(None)
            data[name] = docs
        except Exception:
            data[name] = []

    raw = json.dumps(data, default=str, ensure_ascii=False).encode("utf-8")
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb") as gz:
        gz.write(raw)
    compressed = buf.getvalue()

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")
    blob_name = f"{BLOB_PREFIX}backup_{ts}_UTC.json.gz"

    await asyncio.to_thread(_upload, bucket_name, blob_name, compressed)

    return {
        "id": blob_name[len(BLOB_PREFIX):],
        "blob_name": blob_name,
        "size_bytes": len(compressed),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "collections": {k: len(v) for k, v in data.items()},
    }


async def list_backups(bucket_name: str) -> list[dict]:
    return await asyncio.to_thread(_list, bucket_name)


async def restore_backup(bucket_name: str, blob_name: str) -> dict:
    gz_bytes = await asyncio.to_thread(_download, bucket_name, blob_name)

    buf = io.BytesIO(gz_bytes)
    with gzip.GzipFile(fileobj=buf, mode="rb") as gz:
        data = json.loads(gz.read().decode("utf-8"))

    restored: dict = {}
    for coll_name, docs in data.items():
        try:
            coll = getattr(_db_module.db, coll_name)
            await coll.delete_many({})
            if docs:
                await coll.insert_many(docs)
            restored[coll_name] = len(docs)
        except Exception as e:
            restored[coll_name] = f"error: {e}"

    return restored


async def delete_backup(bucket_name: str, blob_name: str) -> None:
    await asyncio.to_thread(_delete, bucket_name, blob_name)


async def apply_retention(bucket_name: str, retention_days: int) -> int:
    return await asyncio.to_thread(_apply_retention_sync, bucket_name, retention_days)
