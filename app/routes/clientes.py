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
from typing import List

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


# --------------- Recurrence helpers ---------------

def _normalize_cat(cat) -> dict:
    """Normalize a categoria entry (str or dict) to a uniform dict."""
    if isinstance(cat, str):
        return {"tarea": cat, "frecuencia_tipo": "mensual", "frecuencia_valor": 1}
    # dict / TareaConfig
    return {
        "tarea": cat.get("tarea", cat) if isinstance(cat, dict) else str(cat),
        "frecuencia_tipo": cat.get("frecuencia_tipo", "mensual") if isinstance(cat, dict) else "mensual",
        "frecuencia_valor": cat.get("frecuencia_valor", 1) if isinstance(cat, dict) else 1,
    }


def _last_day(year: int, month: int) -> date:
    if month == 12:
        return date(year, 12, 31)
    return date(year, month + 1, 1) - timedelta(days=1)


def _calc_due_dates(year: int, month: int, tipo: str, valor: int) -> List[date]:
    """Return the list of due dates for the given month and recurrence config."""
    ld = _last_day(year, month)

    # quincenal → mensual×2
    if tipo == "quincenal":
        tipo = "mensual"
        valor = 2

    if tipo == "mensual":
        if valor <= 1:
            return [ld]
        if valor == 2:
            d15 = date(year, month, 15)
            return [d15, ld]
        if valor == 3:
            return [date(year, month, 10), date(year, month, 20), ld]
        # valor >= 4: spread across the month
        step = max(1, ld.day // valor)
        dates = []
        for i in range(valor - 1):
            d = date(year, month, min(1 + step * i, ld.day))
            dates.append(d)
        dates.append(ld)
        return dates

    if tipo == "semanal":
        # 4 weeks, `valor` instances per week, evenly spaced
        weeks = [(1, 7), (8, 14), (15, 21), (22, ld.day)]
        dates = []
        for (wstart, wend) in weeks:
            wend = min(wend, ld.day)
            if wend < wstart:
                continue
            wlen = wend - wstart + 1
            count = min(valor, wlen)
            step = wlen / (count + 1)
            for i in range(1, count + 1):
                day = wstart + round(step * i) - 1
                day = max(wstart, min(day, wend))
                dates.append(date(year, month, day))
        # deduplicate preserving order
        seen = set()
        unique = []
        for d in dates:
            if d not in seen:
                seen.add(d)
                unique.append(d)
        return unique

    if tipo == "diaria":
        dates = []
        d = date(year, month, 1)
        while d <= ld:
            if d.weekday() < 5:  # Mon–Fri
                dates.append(d)
            d += timedelta(days=1)
        return dates

    # fallback
    return [ld]


# --------------- Routes ---------------

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

    categorias = [_normalize_cat(c) for c in cliente.get("categorias", [])]
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
        mes_nombre = MES_NOMBRES[current.month - 1]

        for cfg in categorias:
            tarea = cfg["tarea"]
            due_dates = _calc_due_dates(
                current.year, current.month,
                cfg["frecuencia_tipo"], cfg["frecuencia_valor"]
            )

            for due in due_dates:
                existing = await _db_module.db.tasks.find_one({
                    "cliente": cliente["nombre"],
                    "tarea": tarea,
                    "vencimiento": due.isoformat(),
                })
                if existing:
                    continue

                docs_to_insert.append({
                    "taskId": next_id,
                    "cliente": cliente["nombre"],
                    "tarea": tarea,
                    "responsable": body.responsable,
                    "assignedTo": None,
                    "semana": body.semana,
                    "vencimiento": due.isoformat(),
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
        categorias = [_normalize_cat(c) for c in cliente.get("categorias", [])]
        if not categorias:
            continue

        clients_processed += 1
        for month in range(1, 13):
            mes_nombre = MES_NOMBRES[month - 1]

            for cfg in categorias:
                tarea = cfg["tarea"]
                due_dates = _calc_due_dates(
                    year, month,
                    cfg["frecuencia_tipo"], cfg["frecuencia_valor"]
                )

                for due in due_dates:
                    existing = await _db_module.db.tasks.find_one({
                        "cliente": cliente["nombre"],
                        "tarea": tarea,
                        "vencimiento": due.isoformat(),
                    })
                    if existing:
                        continue

                    docs_to_insert.append({
                        "taskId": next_id,
                        "cliente": cliente["nombre"],
                        "tarea": tarea,
                        "responsable": body.responsable,
                        "assignedTo": None,
                        "semana": body.semana,
                        "vencimiento": due.isoformat(),
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
