"""
Sugerencias de vencimientos fiscales argentinos 2026.

Basado en:
- ARCA (ex AFIP): Monotributo, Autónomos, IVA, Libro IVA Digital
- COMARB (RG CA 20/2025): IIBB Convenio Multilateral
- ARBA: IIBB Provincia de Buenos Aires
- AGIP: IIBB Ciudad de Buenos Aires
- ARCA: Casas Particulares (Régimen Especial de Seguridad Social)

Fuentes: argentina.gob.ar/arca/vencimientos, ca.gob.ar, Ámbito, iProfesional.
Nota: No existe API pública de ARCA. Estos datos son orientativos y deben
verificarse mes a mes contra las resoluciones oficiales vigentes.
"""

from datetime import date, timedelta
from typing import Dict, Optional

# Feriados nacionales Argentina 2026 (inamovibles + trasladables confirmados)
FERIADOS_2026 = {
    date(2026, 1, 1),   # Año Nuevo
    date(2026, 2, 16),  # Carnaval
    date(2026, 2, 17),  # Carnaval
    date(2026, 3, 24),  # Día de la Memoria
    date(2026, 4, 2),   # Día del Veterano (Malvinas)
    date(2026, 4, 3),   # Viernes Santo
    date(2026, 5, 1),   # Día del Trabajador
    date(2026, 5, 25),  # Revolución de Mayo
    date(2026, 6, 15),  # Paso a la Inmortalidad Güemes (trasladado)
    date(2026, 6, 20),  # Día de la Bandera
    date(2026, 7, 9),   # Día de la Independencia
    date(2026, 8, 17),  # Paso a la Inmortalidad San Martín
    date(2026, 10, 12), # Día del Respeto a la Diversidad Cultural
    date(2026, 11, 23), # Día de la Soberanía Nacional (trasladado)
    date(2026, 12, 8),  # Inmaculada Concepción
    date(2026, 12, 25), # Navidad
}


def siguiente_dia_habil(d: date) -> date:
    """Si cae en fin de semana o feriado, avanza al siguiente día hábil."""
    while d.weekday() >= 5 or d in FERIADOS_2026:
        d += timedelta(days=1)
    return d


def _fecha(year: int, month: int, day: int) -> str:
    """Genera fecha ajustada a día hábil en formato ISO."""
    try:
        d = date(year, month, day)
    except ValueError:
        # Si el día no existe en ese mes, usar último día del mes
        if month == 12:
            d = date(year + 1, 1, 1) - timedelta(days=1)
        else:
            d = date(year, month + 1, 1) - timedelta(days=1)
    return siguiente_dia_habil(d).isoformat()


# ─── Patrones base de vencimiento por dígito CUIT ───
# Cada entrada: {dígito: día_del_mes}
# Basado en calendarios ARCA/COMARB 2025-2026

# VEP Monotributo - Componente impositivo y previsional
# Fuente: ARCA - generalmente alrededor del 20 de cada mes
PATRON_MONOTRIBUTO = {
    "0": 20, "1": 20,
    "2": 20, "3": 20,
    "4": 21, "5": 21,
    "6": 22, "7": 22,
    "8": 23, "9": 23,
}

# VEP Autónomos - Aportes previsionales
# Fuente: ARCA - mismo patrón que Monotributo
PATRON_AUTONOMOS = {
    "0": 20, "1": 20,
    "2": 20, "3": 20,
    "4": 21, "5": 21,
    "6": 22, "7": 22,
    "8": 23, "9": 23,
}

# IVA - Declaración Jurada mensual
# Fuente: ARCA - generalmente entre el 18 y 22
PATRON_IVA = {
    "0": 18, "1": 18,
    "2": 19, "3": 19,
    "4": 20, "5": 20,
    "6": 21, "7": 21,
    "8": 22, "9": 22,
}

# Libro IVA Digital - Se presenta unos días antes del IVA
# Fuente: ARCA
PATRON_LIBRO_IVA = {
    "0": 14, "1": 14,
    "2": 15, "3": 15,
    "4": 16, "5": 16,
    "6": 17, "7": 17,
    "8": 18, "9": 18,
}

# IIBB Convenio Multilateral - Anticipo mensual (CM03/CM04)
# Fuente: COMARB RG CA 20/2025
PATRON_IIBB_CM = {
    "0": 15, "1": 15,
    "2": 16, "3": 16,
    "4": 17, "5": 17,
    "6": 18, "7": 18,
    "8": 19, "9": 19,
}

# IIBB ARBA - Provincia de Buenos Aires
# Fuente: ARBA calendario fiscal
PATRON_IIBB_ARBA = {
    "0": 17, "1": 17,
    "2": 18, "3": 18,
    "4": 19, "5": 19,
    "6": 20, "7": 20,
    "8": 21, "9": 21,
}

# IIBB AGIP - Ciudad de Buenos Aires
# Fuente: AGIP calendario fiscal
PATRON_IIBB_AGIP = {
    "0": 15, "1": 15,
    "2": 16, "3": 16,
    "4": 17, "5": 17,
    "6": 18, "7": 18,
    "8": 19, "9": 19,
}

# Casas Particulares - Régimen Especial Seguridad Social
# Fuente: ARCA - generalmente el 10 para todos los dígitos
PATRON_CASAS = {
    "0": 10, "1": 10,
    "2": 10, "3": 10,
    "4": 10, "5": 10,
    "6": 10, "7": 10,
    "8": 10, "9": 10,
}

# Mapeo tipo de tarea -> patrón base
PATRONES = {
    "Casas Particulares": PATRON_CASAS,
    "VEP Monotributo": PATRON_MONOTRIBUTO,
    "VEP Autonomos": PATRON_AUTONOMOS,
    "IIBB CM": PATRON_IIBB_CM,
    "IIBB ARBA": PATRON_IIBB_ARBA,
    "IIBB AGIP": PATRON_IIBB_AGIP,
    "IVA": PATRON_IVA,
    "Libro IVA Digital": PATRON_LIBRO_IVA,
}

# Fuentes por tipo de tarea (para mostrar en la UI)
FUENTES = {
    "Casas Particulares": "ARCA - Régimen Especial Seg. Social",
    "VEP Monotributo": "ARCA - Resolución General vigente",
    "VEP Autonomos": "ARCA - Resolución General vigente",
    "IIBB CM": "COMARB - RG CA 20/2025",
    "IIBB ARBA": "ARBA - Calendario Fiscal",
    "IIBB AGIP": "AGIP - Calendario Fiscal",
    "IVA": "ARCA - Resolución General vigente",
    "Libro IVA Digital": "ARCA - Resolución General vigente",
}


def generar_sugerencias(periodo: str) -> Dict:
    """
    Genera tabla de sugerencias de vencimientos para un período dado.

    Args:
        periodo: formato "YYYY-MM" (ej: "2026-03")

    Returns:
        {
            "periodo": "2026-03",
            "tabla": {
                "VEP Monotributo": {"0": "2026-03-20", ...},
                ...
            },
            "fuentes": {
                "VEP Monotributo": "ARCA - Resolución General vigente",
                ...
            },
            "nota": "Fechas orientativas basadas en calendarios oficiales..."
        }
    """
    parts = periodo.split("-")
    if len(parts) != 2:
        return {"periodo": periodo, "tabla": {}, "fuentes": {}, "nota": "Período inválido"}

    year = int(parts[0])
    month = int(parts[1])

    tabla = {}
    for tipo, patron in PATRONES.items():
        tabla[tipo] = {}
        for digito, dia in patron.items():
            tabla[tipo][digito] = _fecha(year, month, dia)

    return {
        "periodo": periodo,
        "tabla": tabla,
        "fuentes": FUENTES,
        "nota": (
            "Fechas orientativas basadas en calendarios oficiales de ARCA, COMARB, "
            "ARBA y AGIP. Ajustadas automáticamente por días hábiles y feriados "
            "nacionales. Verificar contra resoluciones vigentes antes de aplicar."
        ),
    }
