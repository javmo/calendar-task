"""
Calendario de Tareas - FastAPI Backend
MongoDB + Firebase Auth
"""
import os
from contextlib import asynccontextmanager
from datetime import date, datetime
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel

load_dotenv()

# --------------- Configuration ---------------
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "calendario")
FIREBASE_SA_PATH = os.getenv("FIREBASE_SA_PATH", "firebase-sa.json")

# --------------- Globals ---------------
db_client: AsyncIOMotorClient = None
db = None
firebase_initialized = False


# --------------- Lifespan ---------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    global db_client, db, firebase_initialized

    # MongoDB
    db_client = AsyncIOMotorClient(MONGO_URI)
    db = db_client[DB_NAME]

    # Indexes
    await db.tasks.create_index("taskId", unique=True)
    await db.tasks.create_index("assignedTo")
    await db.tasks.create_index("vencimiento")
    await db.users.create_index("email", unique=True)
    await db.schedules.create_index(
        [("userEmail", 1), ("taskId", 1)], unique=True
    )

    # Firebase Admin SDK
    firebase_sa_json = os.getenv("FIREBASE_SA_JSON", "")
    if firebase_sa_json:
        try:
            import json as _json
            from firebase_admin import credentials, initialize_app
            sa_dict = _json.loads(firebase_sa_json)
            cred = credentials.Certificate(sa_dict)
            initialize_app(cred)
            firebase_initialized = True
            print("✅ Firebase Admin SDK initialized (from env var)")
        except Exception as e:
            print(f"⚠️ Firebase init error (env): {e}")
    elif os.path.exists(FIREBASE_SA_PATH):
        try:
            from firebase_admin import credentials, initialize_app
            cred = credentials.Certificate(FIREBASE_SA_PATH)
            initialize_app(cred)
            firebase_initialized = True
            print("✅ Firebase Admin SDK initialized (from file)")
        except Exception as e:
            print(f"⚠️ Firebase init error: {e}")
    else:
        print(f"⚠️ Firebase SA not found at {FIREBASE_SA_PATH} — auth disabled for dev")

    yield

    db_client.close()


app = FastAPI(title="Calendario de Tareas", lifespan=lifespan)


# --------------- Auth Dependency ---------------
async def get_current_user(authorization: str = Header(None)):
    """Verify Firebase ID token. In dev mode (no Firebase SA), accept any request."""
    global firebase_initialized

    if not firebase_initialized:
        # Dev mode: no auth required, return mock user
        return {
            "email": "dev@localhost",
            "name": "Developer",
            "picture": "",
        }

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autorizado")

    token = authorization.split("Bearer ")[1]
    try:
        from firebase_admin import auth as firebase_auth
        decoded = firebase_auth.verify_id_token(token)
        return decoded
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido")


# --------------- Pydantic Models ---------------
class TaskIn(BaseModel):
    cliente: str
    tarea: str
    responsable: str
    assignedTo: Optional[str] = None
    semana: str
    vencimiento: str


class TaskUpdate(BaseModel):
    cliente: Optional[str] = None
    tarea: Optional[str] = None
    responsable: Optional[str] = None
    assignedTo: Optional[str] = None
    semana: Optional[str] = None
    vencimiento: Optional[str] = None


class ScheduleIn(BaseModel):
    taskId: int
    scheduledDate: str
    notes: Optional[str] = ""


class UserUpdate(BaseModel):
    role: Optional[str] = None
    responsableName: Optional[str] = None


# =============== API Routes ===============

# --- Users ---
@app.get("/api/me")
async def get_me(user=Depends(get_current_user)):
    email = user.get("email", "")
    db_user = await db.users.find_one({"email": email}, {"_id": 0})
    if not db_user:
        count = await db.users.count_documents({})
        db_user = {
            "email": email,
            "displayName": user.get("name", email.split("@")[0]),
            "photoURL": user.get("picture", ""),
            "responsableName": "",
            "role": "admin" if count == 0 else "user",
            "createdAt": datetime.utcnow().isoformat(),
        }
        await db.users.insert_one({**db_user})
        db_user.pop("_id", None)
    return db_user


@app.get("/api/users")
async def list_users(user=Depends(get_current_user)):
    users = await db.users.find({}, {"_id": 0}).to_list(100)
    return users


@app.put("/api/users/{email}")
async def update_user(email: str, body: UserUpdate, user=Depends(get_current_user)):
    caller = await db.users.find_one({"email": user["email"]})
    update_data = {}

    # Only admin can change roles
    if body.role is not None:
        if not caller or caller.get("role") != "admin":
            raise HTTPException(403, "Solo admin puede cambiar roles")
        update_data["role"] = body.role

    # User can update own responsableName, admin can update anyone's
    if body.responsableName is not None:
        if user["email"] != email and (not caller or caller.get("role") != "admin"):
            raise HTTPException(403, "No autorizado")
        update_data["responsableName"] = body.responsableName

    if not update_data:
        raise HTTPException(400, "Nada que actualizar")

    result = await db.users.update_one({"email": email}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(404, "Usuario no encontrado")

    updated = await db.users.find_one({"email": email}, {"_id": 0})
    return updated


# --- Tasks ---
@app.get("/api/tasks")
async def get_tasks(user=Depends(get_current_user)):
    tasks = await db.tasks.find({}, {"_id": 0}).sort("taskId", 1).to_list(5000)
    return tasks


@app.post("/api/tasks")
async def create_task(task: TaskIn, user=Depends(get_current_user)):
    last = await db.tasks.find_one(
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
    doc["createdAt"] = datetime.utcnow().isoformat()

    await db.tasks.insert_one(doc)
    doc.pop("_id", None)
    return doc


@app.put("/api/tasks/{task_id}")
async def update_task(task_id: int, task: TaskUpdate, user=Depends(get_current_user)):
    update_data = {k: v for k, v in task.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(400, "Nada que actualizar")

    result = await db.tasks.update_one({"taskId": task_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(404, "Tarea no encontrada")

    updated = await db.tasks.find_one({"taskId": task_id}, {"_id": 0})
    return updated


@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: int, user=Depends(get_current_user)):
    result = await db.tasks.delete_one({"taskId": task_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Tarea no encontrada")
    await db.schedules.delete_many({"taskId": task_id})
    return {"ok": True}


@app.put("/api/tasks/{task_id}/status")
async def toggle_status(task_id: int, body: dict, user=Depends(get_current_user)):
    field = body.get("field")
    if field not in ("completado", "revisado", "enviado"):
        raise HTTPException(400, "Campo inválido")

    task = await db.tasks.find_one({"taskId": task_id})
    if not task:
        raise HTTPException(404, "Tarea no encontrada")

    new_val = not task.get(field, False)
    await db.tasks.update_one({"taskId": task_id}, {"$set": {field: new_val}})

    updated = await db.tasks.find_one({"taskId": task_id}, {"_id": 0})
    return updated


@app.put("/api/tasks/{task_id}/finalize")
async def finalize_task(task_id: int, user=Depends(get_current_user)):
    task = await db.tasks.find_one({"taskId": task_id})
    if not task:
        raise HTTPException(404, "Tarea no encontrada")

    today = date.today().isoformat()
    await db.tasks.update_one(
        {"taskId": task_id},
        {"$set": {
            "finalizada": True,
            "fechaFinalizacion": today,
            "completado": True,
            "revisado": True,
            "enviado": True,
        }},
    )
    updated = await db.tasks.find_one({"taskId": task_id}, {"_id": 0})
    return updated


@app.put("/api/tasks/{task_id}/restore")
async def restore_task(task_id: int, user=Depends(get_current_user)):
    result = await db.tasks.update_one(
        {"taskId": task_id},
        {"$set": {
            "finalizada": False,
            "fechaFinalizacion": None,
            "completado": False,
            "revisado": False,
            "enviado": False,
        }},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Tarea no encontrada")

    updated = await db.tasks.find_one({"taskId": task_id}, {"_id": 0})
    return updated


# --- Schedule (Personal Calendar) ---
@app.get("/api/schedule")
async def get_schedule(user=Depends(get_current_user)):
    entries = await db.schedules.find(
        {"userEmail": user["email"]}, {"_id": 0}
    ).to_list(5000)
    return entries


@app.post("/api/schedule")
async def upsert_schedule(entry: ScheduleIn, user=Depends(get_current_user)):
    existing = await db.schedules.find_one(
        {"userEmail": user["email"], "taskId": entry.taskId}
    )
    if existing:
        await db.schedules.update_one(
            {"userEmail": user["email"], "taskId": entry.taskId},
            {"$set": {
                "scheduledDate": entry.scheduledDate,
                "notes": entry.notes,
            }},
        )
    else:
        doc = entry.model_dump()
        doc["userEmail"] = user["email"]
        doc["createdAt"] = datetime.utcnow().isoformat()
        await db.schedules.insert_one(doc)
    return {"ok": True}


@app.delete("/api/schedule/{task_id}")
async def delete_schedule(task_id: int, user=Depends(get_current_user)):
    await db.schedules.delete_one(
        {"userEmail": user["email"], "taskId": task_id}
    )
    return {"ok": True}


# --------------- Serve Frontend ---------------
static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/")
async def root():
    return FileResponse(os.path.join(static_dir, "index.html"))
