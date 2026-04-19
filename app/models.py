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
    notas: Optional[str] = ""
    notasPorTarea: Optional[Dict[str, str]] = {}  # {tarea: nota}, e.g. {"IVA": "nota..."}


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
    notas: Optional[str] = None
    notasPorTarea: Optional[Dict[str, str]] = None


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


# --------------- Task Types ---------------

class TaskTypeIn(BaseModel):
    name: str
    color: str                          # hex "#rrggbb"
    icon: Optional[str] = None          # emoji, optional
    descripcion: Optional[str] = None
    categoria: str                      # "fiscal" | "general" | "operativa"
    tieneVencimiento: bool = False
    activo: bool = True
    orden: Optional[int] = None         # if None, auto-assigned as max+1


class TaskTypeUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    descripcion: Optional[str] = None
    categoria: Optional[str] = None
    tieneVencimiento: Optional[bool] = None
    activo: Optional[bool] = None
    orden: Optional[int] = None


class TaskTypeOut(BaseModel):
    taskTypeId: int
    name: str
    color: str
    icon: Optional[str] = None
    descripcion: Optional[str] = None
    categoria: str
    tieneVencimiento: bool
    activo: bool
    orden: int
    createdAt: str
    updatedAt: str
    # Computed on demand (populated when ?conUso=true)
    usageClientes: Optional[int] = None
    usageTasks: Optional[int] = None


class TaskTypeRenameBody(BaseModel):
    nuevoNombre: str


class TaskTypeMergeBody(BaseModel):
    origenId: str
    destinoId: str
