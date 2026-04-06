"""
Clientes routes + task generation.

Endpoints:
  GET    /api/clientes
  GET    /api/clientes/{cliente_id}
  POST   /api/clientes
  PUT    /api/clientes/{cliente_id}
  DELETE /api/clientes/{cliente_id}
  GET    /api/clientes/{cliente_id}/tasks
  POST   /api/clientes/{cliente_id}/generate-tasks   (admin)
  POST   /api/generate-fiscal-period                 (admin)
"""
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

import app.database as _db_module
from app.auth import get_current_user, require_admin
from app.config import ESTADO_PENDIENTE, MES_NOMBRES
from app.models import (
    ClienteIn,
    ClienteUpdate,
    GenerateFiscalPeriodBody,
    GenerateTasksBody,
)

router = APIRouter(prefix="/api")


@router.get("/clientes")
async def get_clientes(user=Depends(get_current_user)):
    clientes = await _db_module.db.clientes.find(
        {}, {"_id": 0}
    ).sort("nombre", 1).to_list(500)
    return clientes


@router.get("/clientes/{cliente_id}")
async def get_cliente(cliente_id: int, user=Depends(get_current_user)):
    cliente = await _db_module.db.clientes.find_one(
        {"clienteId": cliente_id}, {"_id": 0}
    )
    if not cliente:
        raise HTTPException(404, "Cliente no encontrado")
    return cliente


@router.post("/clientes")
async def create_cliente(cliente: ClienteIn, user=Depends(get_current_user)):
    last = await _db_module.db.clientes.find_one(
        sort=[("clienteId", -1)], projection={"clienteId": 1}
    )
    new_id = (last["clienteId"] + 1) if last else 1

    doc = cliente.model_dump()
    doc["clienteId"] = new_id
    doc["createdAt"] = datetime.now(timezone.utc).isoformat()

    await _db_module.db.clientes.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/clientes/{cliente_id}")
async def update_cliente(
    cliente_id: int, body: ClienteUpdate, user=Depends(get_current_user)
):
    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(400, "Nada que actualizar")

    old = await _db_module.db.clientes.find_one({"clienteId": cliente_id})
    if not old:
        raise HTTPException(404, "Cliente no encontrado")

    await _db_module.db.clientes.update_one(
        {"clienteId": cliente_id}, {"$set": update_data}
    )

    if "nombre" in update_data and update_data["nombre"] != old["nombre"]:
        await _db_module.db.tasks.update_many(
            {"cliente": old["nombre"]},
            {"$set": {"cliente": update_data["nombre"]}},
        )

    updated = await _db_module.db.clientes.find_one(
        {"clienteId": cliente_id}, {"_id": 0}
    )
    return updated


@router.delete("/clientes/{cliente_id}")
async def delete_cliente(cliente_id: int, user=Depends(get_current_user)):
    cliente = await _db_module.db.clientes.find_one({"clienteId": cliente_id})
    if not cliente:
        raise HTTPException(404, "Cliente no encontrado")
    await _db_module.db.clientes.delete_one({"clienteId": cliente_id})
    return {"ok": True}


@router.get("/clientes/{cliente_id}/tasks")
async def get_cliente_tasks(cliente_id: int, user=Depends(get_current_user)):
    cliente = await _db_module.db.clientes.find_one(
        {"clienteId": cliente_id}, {"_id": 0}
    )
    if not cliente:
        raise HTTPException(404, "Cliente no encontrado")
    tasks = await _db_module.db.tasks.find(
        {"cliente": cliente["nombre"]}, {"_id": 0}
    ).sort("vencimiento", 1).to_list(5000)
    return tasks


@router.post("/clientes/{cliente_id}/generate-tasks")
async def generate_client_tasks(
    cliente_id: int, body: GenerateTasksBody, user=Depends(require_admin)
):
    """Generate tasks for a client's categories from a month range."""
    cliente = await _db_module.db.clientes.find_one({"clienteId": cliente_id}, {"_id": 0})
    if not cliente:
        raise HTTPException(404, "Cliente no encontrado")

    categorias = cliente.get("categorias", [])
    if not categorias:
        raise HTTPException(400, "El cliente no tiene categorías asignadas")

    from_y, from_m = map(int, body.fromMonth.split("-"))
    to_y, to_m = map(int, body.toMonth.split("-"))

    last = await _db_module.db.tasks.find_one(sort=[("taskId", -1)], projection={"taskId": 1})
    next_id = (last["taskId"] + 1) if last else 1

    created = 0
    current = date(from_y, from_m, 1)
    end = date(to_y, to_m, 1)
    docs_to_insert = []

    while current <= end:
        periodo = f"{current.year}-{current.month:02d}"
        mes_nombre = MES_NOMBRES[current.month - 1]

        for tarea in categorias:
            existing = await _db_module.db.tasks.find_one({
                "cliente": cliente["nombre"],
                "tarea": tarea,
                "mes": mes_nombre,
                "vencimiento": {"$regex": f"^{periodo}"}
            })
            if existing:
                continue

            if current.month == 12:
                last_day = date(current.year, 12, 31)
            else:
                last_day = date(current.year, current.month + 1, 1) - timedelta(days=1)

            docs_to_insert.append({
                "taskId": next_id,
                "cliente": cliente["nombre"],
                "tarea": tarea,
                "responsable": body.responsable,
                "assignedTo": None,
                "semana": body.semana,
                "vencimiento": last_day.isoformat(),
                "mes": mes_nombre,
                "completado": False,
                "revisado": False,
                "enviado": False,
                "finalizada": False,
                "fechaFinalizacion": None,
                "estado": ESTADO_PENDIENTE,
                "createdAt": datetime.now(timezone.utc).isoformat(),
            })
            next_id += 1
            created += 1

        if current.month == 12:
            current = date(current.year + 1, 1, 1)
        else:
            current = date(current.year, current.month + 1, 1)

    if docs_to_insert:
        await _db_module.db.tasks.insert_many(docs_to_insert)

    return {"ok": True, "created": created, "cliente": cliente["nombre"]}


@router.post("/generate-fiscal-period")
async def generate_fiscal_period(
    body: GenerateFiscalPeriodBody, user=Depends(require_admin)
):
    """Bulk-generate tasks for a fiscal year for all (or selected) clients with categorias."""
    year = body.year
    query = {"categorias": {"$exists": True, "$ne": []}}
    if body.clienteIds:
        query["clienteId"] = {"$in": body.clienteIds}

    clientes = await _db_module.db.clientes.find(query, {"_id": 0}).to_list(500)
    if not clientes:
        raise HTTPException(400, "No hay clientes con categorías asignadas")

    last = await _db_module.db.tasks.find_one(sort=[("taskId", -1)], projection={"taskId": 1})
    next_id = (last["taskId"] + 1) if last else 1

    total_created = 0
    clients_processed = 0
    docs_to_insert = []

    for cliente in clientes:
        categorias = cliente.get("categorias", [])
        if not categorias:
            continue

        clients_processed += 1
        for month in range(1, 13):
            periodo = f"{year}-{month:02d}"
            mes_nombre = MES_NOMBRES[month - 1]

            for tarea in categorias:
                existing = await _db_module.db.tasks.find_one({
                    "cliente": cliente["nombre"],
                    "tarea": tarea,
                    "mes": mes_nombre,
                    "vencimiento": {"$regex": f"^{periodo}"}
                })
                if existing:
                    continue

                if month == 12:
                    last_day = date(year, 12, 31)
                else:
                    last_day = date(year, month + 1, 1) - timedelta(days=1)

                docs_to_insert.append({
                    "taskId": next_id,
                    "cliente": cliente["nombre"],
                    "tarea": tarea,
                    "responsable": body.responsable,
                    "assignedTo": None,
                    "semana": body.semana,
                    "vencimiento": last_day.isoformat(),
                    "mes": mes_nombre,
                    "completado": False,
                    "revisado": False,
                    "enviado": False,
                    "finalizada": False,
                    "fechaFinalizacion": None,
                    "estado": ESTADO_PENDIENTE,
                    "createdAt": datetime.now(timezone.utc).isoformat(),
                })
                next_id += 1
                total_created += 1

    if docs_to_insert:
        await _db_module.db.tasks.insert_many(docs_to_insert)

    return {
        "ok": True,
        "year": year,
        "clientsProcessed": clients_processed,
        "totalCreated": total_created,
    }
