"""
Application configuration — env vars and constants.
"""
import os

from dotenv import load_dotenv

load_dotenv()

# --------------- MongoDB ---------------
MONGO_URI: str = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME: str = os.getenv("DB_NAME", "calendario")

# --------------- Firebase ---------------
FIREBASE_SA_PATH: str = os.getenv("FIREBASE_SA_PATH", "firebase-sa.json")

# --------------- SMTP ---------------
SMTP_HOST: str = os.getenv("SMTP_HOST", "")
SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER: str = os.getenv("SMTP_USER", "")
SMTP_PASS: str = os.getenv("SMTP_PASS", "")
SMTP_FROM: str = os.getenv("SMTP_FROM", "")

# --------------- Task workflow states ---------------
ESTADO_PENDIENTE = "pendiente"
ESTADO_EN_REVISION = "en_revision"
ESTADO_APROBADA = "aprobada"
ESTADO_DEVUELTA = "devuelta"
ESTADOS_VALIDOS = [ESTADO_PENDIENTE, ESTADO_EN_REVISION, ESTADO_APROBADA, ESTADO_DEVUELTA]

# --------------- Month helpers ---------------
MES_NOMBRES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

MES_MAP = {
    "01": "Enero", "02": "Febrero", "03": "Marzo", "04": "Abril",
    "05": "Mayo", "06": "Junio", "07": "Julio", "08": "Agosto",
    "09": "Septiembre", "10": "Octubre", "11": "Noviembre", "12": "Diciembre",
}

# --------------- Vencimientos task types ---------------
TASK_TYPES_CON_VTO = [
    "Casas Particulares", "VEP Monotributo", "VEP Autonomos",
    "IIBB CM", "IIBB ARBA", "IIBB AGIP", "IVA", "Libro IVA Digital",
]
