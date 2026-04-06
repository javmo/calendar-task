"""
Vencimientos routes.

Endpoints:
  GET  /api/vencimientos
  GET  /api/vencimientos/{periodo}
  PUT  /api/vencimientos/{periodo}
  GET  /api/vencimientos/{periodo}/sugerencias
  POST /api/vencimientos/{periodo}/aplicar
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pymongo import UpdateOne

import app.database as _db_module
from app.auth import get_current_user
from app.config import MES_MAP, TASK_TYPES_CON_VTO
from app.models import VencimientosUpdate
from app.sugerencias_vto import generar_sugerencias

router = APIRouter(prefix="/api")


@router.get("/vencimientos")
async def list_vencimientos(user=Depends(get_current_user)):
    docs = await _db_module.db.vencimientos.find(
        {}, {"_id": 0}
    ).sort("periodo", 1).to_list(24)
    return docs


@router.get("/vencimientos/{periodo}")
async def get_vencimientos(periodo: str, user=Depends(get_current_user)):
    doc = await _db_module.db.vencimientos.find_one({"periodo": periodo}, {"_id": 0})
    if not doc:
        tabla = {}
        for tipo in TASK_TYPES_CON_VTO:
            tabla[tipo] = {str(d): None for d in range(10)}
        return {"periodo": periodo, "tabla": tabla}
    return doc


@router.put("/vencimientos/{periodo}")
async def update_vencimientos(
    periodo: str, body: VencimientosUpdate, user=Depends(get_current_user)
):
    now = datetime.now(timezone.utc).isoformat()
    await _db_module.db.vencimientos.update_one(
        {"periodo": periodo},
        {
            "$set": {"tabla": body.tabla, "updatedAt": now},
            "$setOnInsert": {"createdAt": now},
        },
        upsert=True,
    )
    return {"ok": True, "periodo": periodo}


@router.get("/vencimientos/{periodo}/sugerencias")
async def get_sugerencias_vencimientos(periodo: str, user=Depends(get_current_user)):
    """Devuelve sugerencias de vencimientos basadas en calendarios oficiales."""
    return generar_sugerencias(periodo)


@router.post("/vencimientos/{periodo}/aplicar")
async def apply_vencimientos(periodo: str, user=Depends(get_current_user)):
    """Recalculate task vencimientos based on CUIT last digit."""
    doc = await _db_module.db.vencimientos.find_one({"periodo": periodo})
    if not doc:
        raise HTTPException(404, "No hay vencimientos para ese periodo")

    tabla = doc["tabla"]
    mes_num = periodo.split("-")[1]
    mes_nombre = MES_MAP.get(mes_num, "")

    if not mes_nombre:
        raise HTTPException(400, "Periodo inválido")

    clientes = await _db_module.db.clientes.find(
        {}, {"nombre": 1, "cuit": 1}
    ).to_list(500)
    cuit_map = {}
    for c in clientes:
        cuit = str(c.get("cuit", "")).replace(".", "").strip()
        if cuit:
            cuit_map[c["nombre"]] = cuit[-1]

    tasks = await _db_module.db.tasks.find({"mes": mes_nombre}).to_list(5000)
    ops = []
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
            ops.append(UpdateOne({"_id": task["_id"]}, {"$set": {"vencimiento": new_vto}}))

    updated = 0
    if ops:
        result = await _db_module.db.tasks.bulk_write(ops)
        updated = result.modified_count

    return {
        "ok": True,
        "periodo": periodo,
        "mes": mes_nombre,
        "tareasActualizadas": updated,
        "totalTareas": len(tasks),
    }
