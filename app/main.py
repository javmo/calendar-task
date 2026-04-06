"""
Calendario de Tareas - FastAPI Backend
MongoDB + Firebase Auth

Slim entrypoint: creates the app, runs lifespan (indexes + migration + Firebase),
mounts static files, includes all routers, serves index.html.
"""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.auth import init_firebase
from app.config import DB_NAME, ESTADO_PENDIENTE, MONGO_URI
from app.database import close_db, db, init_db
from app.routes.clientes import router as clientes_router
from app.routes.schedule import router as schedule_router
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

    # --- Migration: add estado field to existing tasks if missing ---
    await _db_module.db.tasks.update_many(
        {"estado": {"$exists": False}},
        {"$set": {"estado": ESTADO_PENDIENTE}},
    )

    # --- Firebase ---
    init_firebase()

    yield

    close_db()


app = FastAPI(title="Calendario de Tareas", lifespan=lifespan)

app.include_router(users_router)
app.include_router(tasks_router)
app.include_router(schedule_router)
app.include_router(clientes_router)
app.include_router(vencimientos_router)

# --------------- Serve Frontend ---------------
static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/")
async def root():
    return FileResponse(os.path.join(static_dir, "index.html"))
