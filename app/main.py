"""
Calendario de Tareas - FastAPI Backend
MongoDB + Firebase Auth

Slim entrypoint: creates the app, runs lifespan (indexes + migration + Firebase),
mounts static files, includes all routers, serves index.html.
"""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.auth import init_firebase
from app.config import DB_NAME, ESTADO_PENDIENTE, MONGO_URI
from app.database import close_db, db, init_db
from app.seed import seed_task_types_if_empty
from app.routes.backup import router as backup_router
from app.routes.clientes import router as clientes_router
from app.routes.schedule import router as schedule_router
from app.routes.task_types import router as task_types_router
from app.routes.tasks import router as tasks_router
from app.routes.users import router as users_router
from app.routes.vencimientos import router as vencimientos_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Database ---
    init_db(MONGO_URI, DB_NAME)

    # Re-import db after init so the module-level name is resolved
    import app.database as _db_module

    # --- Indexes (safe: ignore pre-existing conflicting indexes) ---
    async def safe_index(coll, keys, **kwargs):
        try:
            await coll.create_index(keys, **kwargs)
        except Exception as e:
            print(f"Index {keys} on {coll.name}: {e}")

    await safe_index(_db_module.db.tasks, "taskId", unique=True)
    await safe_index(_db_module.db.tasks, "assignedTo")
    await safe_index(_db_module.db.tasks, "vencimiento")
    await safe_index(_db_module.db.users, "email", unique=True)
    await safe_index(_db_module.db.schedules, [("userEmail", 1), ("taskId", 1)], unique=True)
    await safe_index(_db_module.db.clientes, "clienteId", unique=True)
    await safe_index(_db_module.db.clientes, "nombre", unique=True)
    await safe_index(_db_module.db.clientes, "cuit")
    await safe_index(_db_module.db.vencimientos, "periodo", unique=True)
    await safe_index(_db_module.db.task_history, "taskId")
    await safe_index(_db_module.db.task_history, "createdAt")
    await safe_index(_db_module.db.task_history, "mentions")
    await safe_index(_db_module.db.task_reads, [("userEmail", 1), ("taskId", 1)], unique=True)
    await safe_index(_db_module.db.tasks, [("cliente", 1), ("tarea", 1), ("mes", 1)])
    await safe_index(_db_module.db.task_types, "taskTypeId", unique=True)
    await safe_index(_db_module.db.task_types, "nameLower", unique=True)

    # --- Migration: add estado field to existing tasks if missing ---
    await _db_module.db.tasks.update_many(
        {"estado": {"$exists": False}},
        {"$set": {"estado": ESTADO_PENDIENTE}},
    )

    # --- Auto-seed task_types on first boot (no-op if collection has data) ---
    inserted = await seed_task_types_if_empty(_db_module.db)
    if inserted:
        print(f"Seeded {inserted} task types on empty collection")

    # --- Firebase ---
    init_firebase()

    yield

    close_db()


app = FastAPI(title="Calendario de Tareas", lifespan=lifespan)


@app.middleware("http")
async def no_cache_js(request: Request, call_next):
    """Prevent browsers from caching JS/HTML so deploys take effect immediately."""
    response = await call_next(request)
    path = request.url.path
    if path.endswith((".js", ".html")) or path == "/":
        response.headers["Cache-Control"] = "no-cache, must-revalidate"
        response.headers["Pragma"] = "no-cache"
    return response

app.include_router(users_router)
app.include_router(tasks_router)
app.include_router(schedule_router)
app.include_router(clientes_router)
app.include_router(vencimientos_router)
app.include_router(task_types_router)
app.include_router(backup_router)

# --------------- Serve Frontend ---------------
static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/")
async def root():
    return FileResponse(os.path.join(static_dir, "index.html"))
