"""
User routes: GET /api/me, GET /api/users, PUT /api/users/{email}
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

import app.database as _db_module
from app.auth import get_current_user
from app.models import UserUpdate

router = APIRouter(prefix="/api")


@router.get("/me")
async def get_me(user=Depends(get_current_user)):
    email = user.get("email", "")
    db_user = await _db_module.db.users.find_one({"email": email}, {"_id": 0})
    if not db_user:
        count = await _db_module.db.users.count_documents({})
        db_user = {
            "email": email,
            "displayName": user.get("name", email.split("@")[0]),
            "photoURL": user.get("picture", ""),
            "responsableName": "",
            "role": "admin" if count == 0 else "user",
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        await _db_module.db.users.insert_one({**db_user})
        db_user.pop("_id", None)
    return db_user


@router.get("/users")
async def list_users(user=Depends(get_current_user)):
    users = await _db_module.db.users.find({}, {"_id": 0}).to_list(100)
    return users


@router.put("/users/{email}")
async def update_user(email: str, body: UserUpdate, user=Depends(get_current_user)):
    caller = await _db_module.db.users.find_one({"email": user["email"]})
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

    result = await _db_module.db.users.update_one({"email": email}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(404, "Usuario no encontrado")

    updated = await _db_module.db.users.find_one({"email": email}, {"_id": 0})
    return updated
