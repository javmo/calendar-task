"""
Calendario de Tareas - FastAPI Backend
MongoDB + Firebase Auth
"""
import os
import re
import smtplib
from contextlib import asynccontextmanager
from datetime import date, datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional, Dict, List

from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel

from app.sugerencias_vto import generar_sugerencias

load_dotenv()

# --------------- Configuration ---------------
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "calendario")
FIREBASE_SA_PATH = os.getenv("FIREBASE_SA_PATH", "firebase-sa.json")

# SMTP config for email notifications
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
SMTP_FROM = os.getenv("SMTP_FROM", "")

# Task workflow states
ESTADO_PENDIENTE = "pendiente"
ESTADO_EN_REVISION = "en_revision"
ESTADO_APROBADA = "aprobada"
ESTADO_DEVUELTA = "devuelta"
ESTADOS_VALIDOS = [ESTADO_PENDIENTE, ESTADO_EN_REVISION, ESTADO_APROBADA, ESTADO_DEVUELTA]

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

    # Indexes — use try/except to handle pre-existing conflicting indexes
    async def safe_index(coll, keys, **kwargs):
        try:
            await coll.create_index(keys, **kwargs)
        except Exception as e:
            print(f"⚠️ Index {keys} on {coll.name}: {e}")

    await safe_index(db.tasks, "taskId", unique=True)
    await safe_index(db.tasks, "assignedTo")
    await safe_index(db.tasks, "vencimiento")
    await safe_index(db.users, "email", unique=True)
    await safe_index(db.schedules, [("userEmail", 1), ("taskId", 1)], unique=True)
    await safe_index(db.clientes, "clienteId", unique=True)
    await safe_index(db.clientes, "nombre", unique=True)
    await safe_index(db.clientes, "cuit")
    await safe_index(db.vencimientos, "periodo", unique=True)
    await safe_index(db.task_history, "taskId")
    await safe_index(db.task_history, "createdAt")
    await safe_index(db.task_history, "mentions")
    await safe_index(db.task_reads, [("userEmail", 1), ("taskId", 1)], unique=True)

    # Migrate existing tasks: add estado field if missing
    await db.tasks.update_many(
        {"estado": {"$exists": False}},
        {"$set": {"estado": ESTADO_PENDIENTE}},
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


# --------------- Email Helper ---------------
async def send_email(to_email: str, subject: str, html_body: str):
    """Send email notification via SMTP. Fails silently if not configured."""
    if not SMTP_HOST or not SMTP_USER:
        print(f"⚠️ Email no configurado — no se envió: {subject}")
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = SMTP_FROM or SMTP_USER
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(msg["From"], to_email, msg.as_string())
        print(f"✅ Email enviado a {to_email}: {subject}")
        return True
    except Exception as e:
        print(f"❌ Error enviando email: {e}")
        return False


async def add_history_entry(task_id: int, action: str, user_email: str,
                            user_name: str, comment: str = "", extra: dict = None):
    """Add an entry to the task history log."""
    entry = {
        "taskId": task_id,
        "action": action,
        "userEmail": user_email,
        "userName": user_name,
        "comment": comment,
        "createdAt": datetime.utcnow().isoformat(),
    }
    if extra:
        entry.update(extra)
    await db.task_history.insert_one(entry)


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


class ClienteIn(BaseModel):
    nombre: str
    cuit: Optional[str] = ""
    email: Optional[str] = ""
    claveArca: Optional[str] = ""
    claveAgip: Optional[str] = ""
    claveArba: Optional[str] = ""
    otraClave: Optional[str] = ""
    formaPago: Optional[str] = ""


class ClienteUpdate(BaseModel):
    nombre: Optional[str] = None
    cuit: Optional[str] = None
    email: Optional[str] = None
    claveArca: Optional[str] = None
    claveAgip: Optional[str] = None
    claveArba: Optional[str] = None
    otraClave: Optional[str] = None
    formaPago: Optional[str] = None


class UserUpdate(BaseModel):
    role: Optional[str] = None
    responsableName: Optional[str] = None


class VencimientosUpdate(BaseModel):
    tabla: Dict[str, Dict[str, Optional[str]]]  # {tipo: {digito: fecha}}


class TaskReviewBody(BaseModel):
    comment: Optional[str] = ""


class TaskCommentBody(BaseModel):
    comment: str


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
    doc["estado"] = ESTADO_PENDIENTE
    doc["createdAt"] = datetime.utcnow().isoformat()

    await db.tasks.insert_one(doc)
    doc.pop("_id", None)

    # Log creation
    await add_history_entry(
        new_id, "creada", user.get("email", ""),
        user.get("name", ""), "Tarea creada"
    )

    return doc


# --- Bulk Task Assignment (Admin) ---
class BulkAssignBody(BaseModel):
    taskIds: List[int]
    assignedTo: Optional[str] = None  # user email
    responsable: Optional[str] = None  # responsable name


@app.put("/api/tasks/bulk-assign")
async def bulk_assign_tasks(body: BulkAssignBody, user=Depends(get_current_user)):
    caller = await db.users.find_one({"email": user["email"]})
    if not caller or caller.get("role") != "admin":
        raise HTTPException(403, "Solo admin puede asignar tareas en lote")

    if not body.taskIds:
        raise HTTPException(400, "No se enviaron tareas")

    update_data = {}
    if body.assignedTo is not None:
        update_data["assignedTo"] = body.assignedTo
    if body.responsable is not None:
        update_data["responsable"] = body.responsable

    if not update_data:
        raise HTTPException(400, "Nada que asignar")

    result = await db.tasks.update_many(
        {"taskId": {"$in": body.taskIds}},
        {"$set": update_data},
    )

    return {"ok": True, "modified": result.modified_count}


# --- Admin: Tasks pending review (must be before {task_id} routes) ---
@app.get("/api/tasks/pending-review")
async def get_pending_review(user=Depends(get_current_user)):
    caller = await db.users.find_one({"email": user["email"]})
    if not caller or caller.get("role") != "admin":
        raise HTTPException(403, "Solo admin puede ver tareas en revisión")

    tasks = await db.tasks.find(
        {"estado": ESTADO_EN_REVISION}, {"_id": 0}
    ).sort("vencimiento", 1).to_list(5000)
    return tasks


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

    # Admin can toggle any field; non-admin only completado
    caller = await db.users.find_one({"email": user["email"]})
    is_admin = caller and caller.get("role") == "admin"
    if not is_admin and field != "completado":
        raise HTTPException(403, "Solo admin puede modificar ese campo")

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
            "estado": ESTADO_APROBADA,
        }},
    )

    await add_history_entry(
        task_id, "finalizada", user.get("email", ""),
        user.get("name", ""), "Tarea finalizada directamente"
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
            "estado": ESTADO_PENDIENTE,
        }},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Tarea no encontrada")

    await add_history_entry(
        task_id, "restaurada", user.get("email", ""),
        user.get("name", ""), "Tarea restaurada"
    )

    updated = await db.tasks.find_one({"taskId": task_id}, {"_id": 0})
    return updated


# --- Workflow: Submit for Review (non-admin marks as done) ---
@app.put("/api/tasks/{task_id}/submit-review")
async def submit_for_review(task_id: int, body: TaskReviewBody = None, user=Depends(get_current_user)):
    task = await db.tasks.find_one({"taskId": task_id})
    if not task:
        raise HTTPException(404, "Tarea no encontrada")

    if task.get("estado") not in (ESTADO_PENDIENTE, ESTADO_DEVUELTA):
        raise HTTPException(400, "La tarea no está en estado pendiente o devuelta")

    await db.tasks.update_one(
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

    updated = await db.tasks.find_one({"taskId": task_id}, {"_id": 0})
    return updated


# --- Workflow: Undo Submit (non-admin takes back) ---
@app.put("/api/tasks/{task_id}/undo-submit")
async def undo_submit_review(task_id: int, user=Depends(get_current_user)):
    task = await db.tasks.find_one({"taskId": task_id})
    if not task:
        raise HTTPException(404, "Tarea no encontrada")

    if task.get("estado") != ESTADO_EN_REVISION:
        raise HTTPException(400, "La tarea no está en revisión")

    await db.tasks.update_one(
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

    updated = await db.tasks.find_one({"taskId": task_id}, {"_id": 0})
    return updated


# --- Workflow: Admin Approve (finalizar con email) ---
@app.put("/api/tasks/{task_id}/approve")
async def approve_task(task_id: int, body: TaskReviewBody = None, user=Depends(get_current_user)):
    caller = await db.users.find_one({"email": user["email"]})
    if not caller or caller.get("role") != "admin":
        raise HTTPException(403, "Solo admin puede aprobar tareas")

    task = await db.tasks.find_one({"taskId": task_id})
    if not task:
        raise HTTPException(404, "Tarea no encontrada")

    if task.get("estado") != ESTADO_EN_REVISION:
        raise HTTPException(400, "La tarea no está en revisión")

    today = date.today().isoformat()
    await db.tasks.update_one(
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

    # Send email notification to the assigned user
    assigned_email = task.get("assignedTo", "")
    if assigned_email:
        cliente = task.get("cliente", "")
        tarea = task.get("tarea", "")
        admin_name = caller.get("displayName", user.get("name", "Admin"))
        email_html = f"""
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
            <h2 style="color:#059669">✅ Tarea Aprobada</h2>
            <p>Hola,</p>
            <p>La siguiente tarea fue <strong>aprobada y finalizada</strong> por <strong>{admin_name}</strong>:</p>
            <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:16px;margin:16px 0">
                <p style="margin:4px 0"><strong>Cliente:</strong> {cliente}</p>
                <p style="margin:4px 0"><strong>Tarea:</strong> {tarea}</p>
                <p style="margin:4px 0"><strong>Fecha:</strong> {today}</p>
                {f'<p style="margin:4px 0"><strong>Comentario:</strong> {comment}</p>' if comment and comment != "Tarea aprobada por admin" else ''}
            </div>
            <p style="color:#6b7280;font-size:13px">— Calendario de Tareas</p>
        </div>
        """
        await send_email(
            assigned_email,
            f"✅ Tarea aprobada: {cliente} — {tarea}",
            email_html,
        )

    updated = await db.tasks.find_one({"taskId": task_id}, {"_id": 0})
    return {**updated, "emailSent": bool(assigned_email and SMTP_HOST)}


# --- Workflow: Admin Return with corrections ---
@app.put("/api/tasks/{task_id}/return")
async def return_task(task_id: int, body: TaskReviewBody, user=Depends(get_current_user)):
    caller = await db.users.find_one({"email": user["email"]})
    if not caller or caller.get("role") != "admin":
        raise HTTPException(403, "Solo admin puede devolver tareas")

    task = await db.tasks.find_one({"taskId": task_id})
    if not task:
        raise HTTPException(404, "Tarea no encontrada")

    if task.get("estado") != ESTADO_EN_REVISION:
        raise HTTPException(400, "La tarea no está en revisión")

    await db.tasks.update_one(
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

    # Send email notification to the assigned user
    assigned_email = task.get("assignedTo", "")
    if assigned_email:
        cliente = task.get("cliente", "")
        tarea = task.get("tarea", "")
        admin_name = caller.get("displayName", user.get("name", "Admin"))
        email_html = f"""
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
            <h2 style="color:#d97706">↩️ Tarea Devuelta</h2>
            <p>Hola,</p>
            <p>La siguiente tarea fue <strong>devuelta con observaciones</strong> por <strong>{admin_name}</strong>:</p>
            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:16px 0">
                <p style="margin:4px 0"><strong>Cliente:</strong> {cliente}</p>
                <p style="margin:4px 0"><strong>Tarea:</strong> {tarea}</p>
                <p style="margin:4px 0"><strong>Observación:</strong> {comment}</p>
            </div>
            <p>Por favor revisá la tarea y volvé a enviarla para revisión.</p>
            <p style="color:#6b7280;font-size:13px">— Calendario de Tareas</p>
        </div>
        """
        await send_email(
            assigned_email,
            f"↩️ Tarea devuelta: {cliente} — {tarea}",
            email_html,
        )

    updated = await db.tasks.find_one({"taskId": task_id}, {"_id": 0})
    return updated


# --- Task History / Comments ---
@app.get("/api/tasks/{task_id}/history")
async def get_task_history(task_id: int, user=Depends(get_current_user)):
    entries = await db.task_history.find(
        {"taskId": task_id}, {"_id": 0}
    ).sort("createdAt", -1).to_list(200)
    return entries


@app.post("/api/tasks/{task_id}/comments")
async def add_task_comment(task_id: int, body: TaskCommentBody, user=Depends(get_current_user)):
    task = await db.tasks.find_one({"taskId": task_id})
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
        all_users = await db.users.find(
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


# --- Unread Counts & Mentions ---
@app.get("/api/unread-counts")
async def get_unread_counts(user=Depends(get_current_user)):
    """Return {taskId: unreadCount} for comment/mention history entries."""
    email = user.get("email", "")

    reads = await db.task_reads.find(
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
    results = await db.task_history.aggregate(pipeline).to_list(5000)

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


@app.put("/api/tasks/{task_id}/mark-read")
async def mark_task_read(task_id: int, user=Depends(get_current_user)):
    email = user.get("email", "")
    await db.task_reads.update_one(
        {"userEmail": email, "taskId": task_id},
        {"$set": {"lastReadAt": datetime.utcnow().isoformat()}},
        upsert=True,
    )
    return {"ok": True}


@app.get("/api/mentions")
async def get_mentions(user=Depends(get_current_user)):
    """Get recent mentions for the current user (up to 50)."""
    email = user.get("email", "")

    entries = await db.task_history.find(
        {"mentions": email}, {"_id": 0}
    ).sort("createdAt", -1).to_list(50)

    # Determine which are unread
    task_ids = list(set(e["taskId"] for e in entries))
    reads = await db.task_reads.find(
        {"userEmail": email, "taskId": {"$in": task_ids}}, {"_id": 0}
    ).to_list(500)
    read_map = {r["taskId"]: r["lastReadAt"] for r in reads}

    for e in entries:
        last_read = read_map.get(e["taskId"], "")
        e["isUnread"] = e["createdAt"] > last_read

    return entries


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


# --- Clientes ---
@app.get("/api/clientes")
async def get_clientes(user=Depends(get_current_user)):
    clientes = await db.clientes.find(
        {}, {"_id": 0}
    ).sort("nombre", 1).to_list(500)
    return clientes


@app.get("/api/clientes/{cliente_id}")
async def get_cliente(cliente_id: int, user=Depends(get_current_user)):
    cliente = await db.clientes.find_one(
        {"clienteId": cliente_id}, {"_id": 0}
    )
    if not cliente:
        raise HTTPException(404, "Cliente no encontrado")
    return cliente


@app.post("/api/clientes")
async def create_cliente(cliente: ClienteIn, user=Depends(get_current_user)):
    last = await db.clientes.find_one(
        sort=[("clienteId", -1)], projection={"clienteId": 1}
    )
    new_id = (last["clienteId"] + 1) if last else 1

    doc = cliente.model_dump()
    doc["clienteId"] = new_id
    doc["createdAt"] = datetime.utcnow().isoformat()

    await db.clientes.insert_one(doc)
    doc.pop("_id", None)
    return doc


@app.put("/api/clientes/{cliente_id}")
async def update_cliente(
    cliente_id: int, body: ClienteUpdate, user=Depends(get_current_user)
):
    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(400, "Nada que actualizar")

    # If nombre changed, also update tasks
    old = await db.clientes.find_one({"clienteId": cliente_id})
    if not old:
        raise HTTPException(404, "Cliente no encontrado")

    result = await db.clientes.update_one(
        {"clienteId": cliente_id}, {"$set": update_data}
    )

    if "nombre" in update_data and update_data["nombre"] != old["nombre"]:
        await db.tasks.update_many(
            {"cliente": old["nombre"]},
            {"$set": {"cliente": update_data["nombre"]}},
        )

    updated = await db.clientes.find_one(
        {"clienteId": cliente_id}, {"_id": 0}
    )
    return updated


@app.delete("/api/clientes/{cliente_id}")
async def delete_cliente(cliente_id: int, user=Depends(get_current_user)):
    cliente = await db.clientes.find_one({"clienteId": cliente_id})
    if not cliente:
        raise HTTPException(404, "Cliente no encontrado")
    await db.clientes.delete_one({"clienteId": cliente_id})
    return {"ok": True}


@app.get("/api/clientes/{cliente_id}/tasks")
async def get_cliente_tasks(
    cliente_id: int, user=Depends(get_current_user)
):
    cliente = await db.clientes.find_one(
        {"clienteId": cliente_id}, {"_id": 0}
    )
    if not cliente:
        raise HTTPException(404, "Cliente no encontrado")
    tasks = await db.tasks.find(
        {"cliente": cliente["nombre"]}, {"_id": 0}
    ).sort("vencimiento", 1).to_list(5000)
    return tasks


# --- Vencimientos ---
MES_MAP = {
    "01": "Enero", "02": "Febrero", "03": "Marzo", "04": "Abril",
    "05": "Mayo", "06": "Junio", "07": "Julio", "08": "Agosto",
    "09": "Septiembre", "10": "Octubre", "11": "Noviembre", "12": "Diciembre",
}

TASK_TYPES_CON_VTO = [
    "Casas Particulares", "VEP Monotributo", "VEP Autonomos",
    "IIBB CM", "IIBB ARBA", "IIBB AGIP", "IVA", "Libro IVA Digital",
]


@app.get("/api/vencimientos")
async def list_vencimientos(user=Depends(get_current_user)):
    docs = await db.vencimientos.find(
        {}, {"_id": 0}
    ).sort("periodo", 1).to_list(24)
    return docs


@app.get("/api/vencimientos/{periodo}")
async def get_vencimientos(periodo: str, user=Depends(get_current_user)):
    doc = await db.vencimientos.find_one({"periodo": periodo}, {"_id": 0})
    if not doc:
        # Return empty template
        tabla = {}
        for tipo in TASK_TYPES_CON_VTO:
            tabla[tipo] = {str(d): None for d in range(10)}
        return {"periodo": periodo, "tabla": tabla}
    return doc


@app.put("/api/vencimientos/{periodo}")
async def update_vencimientos(
    periodo: str, body: VencimientosUpdate, user=Depends(get_current_user)
):
    now = datetime.utcnow().isoformat()
    await db.vencimientos.update_one(
        {"periodo": periodo},
        {
            "$set": {"tabla": body.tabla, "updatedAt": now},
            "$setOnInsert": {"createdAt": now},
        },
        upsert=True,
    )
    return {"ok": True, "periodo": periodo}


@app.get("/api/vencimientos/{periodo}/sugerencias")
async def get_sugerencias_vencimientos(periodo: str, user=Depends(get_current_user)):
    """Devuelve sugerencias de vencimientos basadas en calendarios oficiales."""
    return generar_sugerencias(periodo)


@app.post("/api/vencimientos/{periodo}/aplicar")
async def apply_vencimientos(
    periodo: str, user=Depends(get_current_user)
):
    """Recalculate task vencimientos based on CUIT last digit."""
    doc = await db.vencimientos.find_one({"periodo": periodo})
    if not doc:
        raise HTTPException(404, "No hay vencimientos para ese periodo")

    tabla = doc["tabla"]
    mes_num = periodo.split("-")[1]
    mes_nombre = MES_MAP.get(mes_num, "")

    if not mes_nombre:
        raise HTTPException(400, "Periodo inv\u00e1lido")

    # Build CUIT last digit map
    clientes = await db.clientes.find(
        {}, {"nombre": 1, "cuit": 1}
    ).to_list(500)
    cuit_map = {}
    for c in clientes:
        cuit = str(c.get("cuit", "")).replace(".", "").strip()
        if cuit:
            cuit_map[c["nombre"]] = cuit[-1]

    # Update tasks for this month
    tasks = await db.tasks.find({"mes": mes_nombre}).to_list(5000)
    updated = 0
    for task in tasks:
        cliente = task.get("cliente", "")
        tarea = task.get("tarea", "")

        if cliente not in cuit_map:
            continue
        if tarea not in tabla:
            continue

        digit = cuit_map[cliente]
        new_vto = tabla[tarea].get(digit)

        if new_vto and new_vto != task.get("vencimiento"):
            await db.tasks.update_one(
                {"_id": task["_id"]},
                {"$set": {"vencimiento": new_vto}},
            )
            updated += 1

    return {
        "ok": True,
        "periodo": periodo,
        "mes": mes_nombre,
        "tareasActualizadas": updated,
        "totalTareas": len(tasks),
    }


# --------------- Serve Frontend ---------------
static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/")
async def root():
    return FileResponse(os.path.join(static_dir, "index.html"))
