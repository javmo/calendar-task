"""
Firebase auth initialization and FastAPI dependencies.
"""
import os

from fastapi import Depends, Header, HTTPException

from app.config import FIREBASE_SA_PATH
import app.database as _db_module

firebase_initialized = False


def init_firebase():
    """Initialize Firebase Admin SDK. Called once during lifespan startup."""
    global firebase_initialized
    firebase_sa_json = os.getenv("FIREBASE_SA_JSON", "")
    if firebase_sa_json:
        try:
            import json as _json
            from firebase_admin import credentials, initialize_app
            sa_dict = _json.loads(firebase_sa_json)
            cred = credentials.Certificate(sa_dict)
            initialize_app(cred)
            firebase_initialized = True
            print("Firebase Admin SDK initialized (from env var)")
        except Exception as e:
            print(f"Firebase init error (env): {e}")
    elif os.path.exists(FIREBASE_SA_PATH):
        try:
            from firebase_admin import credentials, initialize_app
            cred = credentials.Certificate(FIREBASE_SA_PATH)
            initialize_app(cred)
            firebase_initialized = True
            print("Firebase Admin SDK initialized (from file)")
        except Exception as e:
            print(f"Firebase init error: {e}")
    else:
        print(f"Firebase SA not found at {FIREBASE_SA_PATH} — auth disabled for dev")


async def get_current_user(authorization: str = Header(None)):
    """Verify Firebase ID token. In dev mode (no Firebase SA), accept any request."""
    global firebase_initialized

    if not firebase_initialized:
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


async def require_admin(user=Depends(get_current_user)):
    """Dependency that verifies the caller is an admin. Raises 403 otherwise."""
    # Access db through the module so we always get the initialized reference.
    caller = await _db_module.db.users.find_one({"email": user["email"]})
    if not caller or caller.get("role") != "admin":
        raise HTTPException(403, "Solo admin")
    return user
