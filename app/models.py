"""
Pydantic request/response models.
"""
from typing import Dict, List, Optional

from pydantic import BaseModel


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


class ScheduleReorder(BaseModel):
    scheduledDate: str
    taskIds: list[int]


class ClienteIn(BaseModel):
    nombre: str
    cuit: Optional[str] = ""
    email: Optional[str] = ""
    claveArca: Optional[str] = ""
    claveAgip: Optional[str] = ""
    claveArba: Optional[str] = ""
    otraClave: Optional[str] = ""
    formaPago: Optional[str] = ""
    categorias: Optional[List[str]] = []  # task types: ["IIBB CM", "IVA", ...]


class ClienteUpdate(BaseModel):
    nombre: Optional[str] = None
    cuit: Optional[str] = None
    email: Optional[str] = None
    claveArca: Optional[str] = None
    claveAgip: Optional[str] = None
    claveArba: Optional[str] = None
    otraClave: Optional[str] = None
    formaPago: Optional[str] = None
    categorias: Optional[List[str]] = None


class UserUpdate(BaseModel):
    role: Optional[str] = None
    responsableName: Optional[str] = None


class VencimientosUpdate(BaseModel):
    tabla: Dict[str, Dict[str, Optional[str]]]  # {tipo: {digito: fecha}}


class TaskReviewBody(BaseModel):
    comment: Optional[str] = ""


class TaskCommentBody(BaseModel):
    comment: str


class BulkAssignBody(BaseModel):
    taskIds: List[int]
    assignedTo: Optional[str] = None   # user email
    responsable: Optional[str] = None  # responsable name


class GenerateTasksBody(BaseModel):
    fromMonth: str              # "2026-04"
    toMonth: str                # "2026-12"
    responsable: Optional[str] = ""
    semana: Optional[str] = "1ER SEMANA"


class GenerateFiscalPeriodBody(BaseModel):
    year: int                           # 2027
    clienteIds: Optional[List[int]] = None  # None = all clients with categorias
    responsable: Optional[str] = ""
    semana: Optional[str] = "1ER SEMANA"
