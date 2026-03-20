"""
Script para borrar todas las tareas actuales y cargar las nuevas
tareas recurrentes de abril a diciembre 2026.
"""
import os
import sys
from datetime import datetime
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = os.getenv("DB_NAME", "calendario")

# --- Datos de tareas ---
TAREAS_BASE = [
    ("Agustina Lopez", "IIBB CM", "ASISTENTE", "2DA SEMANA"),
    ("Andres Scaliter", "Tareas generales", "ASISTENTE", "1ER SEMANA"),
    ("Beatriz Orellana", "VEP Monotributo", "ASISTENTE", "1ER SEMANA"),
    ("Belen Pianesi", "VEP Monotributo", "ASISTENTE", "1ER SEMANA"),
    ("Belen Pianesi", "Tareas generales", "ASISTENTE", "1ER SEMANA"),
    ("Carla Mariel Romero", "Tareas generales", "ASISTENTE", "1ER SEMANA"),
    ("Carla Mariel Romero", "VEP Monotributo", "ASISTENTE", "1ER SEMANA"),
    ("Carolina Hidalgo", "VEP Monotributo", "ASISTENTE", "1ER SEMANA"),
    ("Claudio Eduardo Petrelli", "VEP Autonomos", "ASISTENTE", "1ER SEMANA"),
    ("Daniel Gonzalez", "VEP Monotributo", "ASISTENTE", "1ER SEMANA"),
    ("Diego Haberman", "IVA", "ASISTENTE", "3ER SEMANA"),
    ("Diego Haberman", "Libro IVA Digital", "ASISTENTE", "3ER SEMANA"),
    ("Diego Haberman", "VEP Autonomos", "ASISTENTE", "1ER SEMANA"),
    ("Diego Touceda", "IVA", "ASISTENTE", "3ER SEMANA"),
    ("Diego Touceda", "Libro IVA Digital", "ASISTENTE", "3ER SEMANA"),
    ("Diego Touceda", "IIBB CM", "ASISTENTE", "3ER SEMANA"),
    ("Eduardo Gonzalez", "IIBB CM", "ASISTENTE", "2DA SEMANA"),
    ("Fabian Recchia", "IVA", "ASISTENTE", "3ER SEMANA"),
    ("Fabian Recchia", "Libro IVA Digital", "ASISTENTE", "3ER SEMANA"),
    ("Fabian Recchia", "IIBB ARBA", "ASISTENTE", "3ER SEMANA"),
    ("Florencia Díaz Benitez", "VEP Monotributo", "ASISTENTE", "2DA SEMANA"),
    ("Florencia Díaz Benitez", "IIBB CM", "ASISTENTE", "2DA SEMANA"),
    ("Florencia Díaz Benitez", "Tareas generales", "ASISTENTE", "2DA SEMANA"),
    ("Francisco Blanco", "IVA", "ASISTENTE", "3ER SEMANA"),
    ("Francisco Blanco", "Libro IVA Digital", "ASISTENTE", "3ER SEMANA"),
    ("Franco Cervetto", "IIBB CM", "ASISTENTE", "2DA SEMANA"),
    ("Franco Cervetto", "Tareas generales", "ASISTENTE", "2DA SEMANA"),
    ("Guido Spairani", "IIBB AGIP", "ASISTENTE", "2DA SEMANA"),
    ("Guillermina Sandra Guzzeti", "VEP Autonomos", "ASISTENTE", "1ER SEMANA"),
    ("Hector Espinola", "VEP Autonomos", "ASISTENTE", "1ER SEMANA"),
    ("Hector Espinola", "IVA", "ASISTENTE", "3ER SEMANA"),
    ("Hector Espinola", "Libro IVA Digital", "ASISTENTE", "3ER SEMANA"),
    ("Hector Espinola", "IIBB ARBA", "ASISTENTE", "3ER SEMANA"),
    ("Hierros Misa", "IVA", "ASISTENTE", "3ER SEMANA"),
    ("Hierros Misa", "Libro IVA Digital", "ASISTENTE", "3ER SEMANA"),
    ("Hierros Misa", "IIBB CM", "ASISTENTE", "3ER SEMANA"),
    ("Honos Temis", "IIBB AGIP", "ASISTENTE", "3ER SEMANA"),
    ("Honos Temis", "Libro IVA Digital", "ASISTENTE", "3ER SEMANA"),
    ("Honos Temis", "IVA", "ASISTENTE", "3ER SEMANA"),
    ("Jonathan Sacaba", "VEP Monotributo", "ASISTENTE", "2DA SEMANA"),
    ("Jorge Zappettini", "Tareas generales", "ASISTENTE", "4TA SEMANA"),
    ("Jorge Zappettini", "IIBB AGIP", "ASISTENTE", "2DA SEMANA"),
    ("Jorge Zappettini", "IVA", "ASISTENTE", "2DA SEMANA"),
    ("Jorge Zappettini", "Libro IVA Digital", "ASISTENTE", "2DA SEMANA"),
    ("Lara Gonzalez Lanzillota", "VEP Autonomos", "ASISTENTE", "1ER SEMANA"),
    ("Leandra Italiani", "IVA", "ASISTENTE", "3ER SEMANA"),
    ("Leandra Italiani", "Libro IVA Digital", "ASISTENTE", "3ER SEMANA"),
    ("Leandra Italiani", "IIBB CM", "ASISTENTE", "3ER SEMANA"),
    ("Leonela Librera", "VEP Monotributo", "ASISTENTE", "1ER SEMANA"),
    ("Leonela Librera", "Tareas generales", "ASISTENTE", "1ER SEMANA"),
    ("Luisa Enith Gomez", "IIBB AGIP", "ASISTENTE", "1ER SEMANA"),
    ("Luisa Enith Gomez", "Tareas generales", "ASISTENTE", "1ER SEMANA"),
    ("Maite Madinaveitia", "Tareas generales", "ASISTENTE", "2DA SEMANA"),
    ("Maite Madinaveitia", "IIBB CM", "ASISTENTE", "2DA SEMANA"),
    ("Manuel Almiron", "VEP Monotributo", "ASISTENTE", "2DA SEMANA"),
    ("Maria Sol Gonzalez Lanzillota", "VEP Autonomos", "ASISTENTE", "1ER SEMANA"),
    ("Melina Ercoli", "VEP Monotributo", "ASISTENTE", "2DA SEMANA"),
    ("Melina Ercoli", "IIBB AGIP", "ASISTENTE", "2DA SEMANA"),
    ("Melina Ercoli", "Tareas generales", "ASISTENTE", "1ER SEMANA"),
    ("Micaela Fernandez Alvi", "Tareas generales", "ASISTENTE", "1ER SEMANA"),
    ("Micaela Vazquez", "IIBB CM", "ASISTENTE", "2DA SEMANA"),
    ("Micaela Vazquez", "VEP Monotributo", "ASISTENTE", "2DA SEMANA"),
    ("Pablo Azor", "IIBB CM", "ASISTENTE", "2DA SEMANA"),
    ("Pablo Azor", "VEP Monotributo", "ASISTENTE", "2DA SEMANA"),
    ("Pablo Luis Maquieyra", "Tareas generales", "ASISTENTE", "1ER SEMANA"),
    ("Pablo Martinez Roca", "IVA", "ASISTENTE", "3ER SEMANA"),
    ("Pablo Martinez Roca", "Libro IVA Digital", "ASISTENTE", "3ER SEMANA"),
    ("Pablo Martinez Roca", "IIBB CM", "ASISTENTE", "3ER SEMANA"),
    ("Pablo Martinez Roca", "VEP Autonomos", "ASISTENTE", "1ER SEMANA"),
    ("Pedro Andrade", "Tareas generales", "ASISTENTE", "1ER SEMANA"),
    ("Rocío Lorusso", "VEP Monotributo", "ASISTENTE", "1ER SEMANA"),
    ("Rosana Diem", "IVA", "ASISTENTE", "3ER SEMANA"),
    ("Rosana Diem", "Libro IVA Digital", "ASISTENTE", "3ER SEMANA"),
    ("Rosana Diem", "IIBB ARBA", "ASISTENTE", "3ER SEMANA"),
    ("Rosana Diem", "VEP Autonomos", "ASISTENTE", "1ER SEMANA"),
    ("Sergio Agresti", "Tareas generales", "ASISTENTE", "1ER SEMANA"),
    ("Sociedad de Diseño SRL", "IVA", "ASISTENTE", "3ER SEMANA"),
    ("Sociedad de Diseño SRL", "Libro IVA Digital", "ASISTENTE", "3ER SEMANA"),
    ("Sociedad de Diseño SRL", "IIBB AGIP", "ASISTENTE", "3ER SEMANA"),
    ("Soledad Carlini", "VEP Monotributo", "ASISTENTE", "2DA SEMANA"),
    ("Soledad Carlini", "Tareas generales", "ASISTENTE", "2DA SEMANA"),
    ("Sucesion Sobrado", "IIBB CM", "ASISTENTE", "1ER SEMANA"),
    ("Sucesion Sobrado", "IVA", "ASISTENTE", "1ER SEMANA"),
    ("Sucesion Sobrado", "Libro IVA Digital", "ASISTENTE", "1ER SEMANA"),
    ("Tamara Maquieyra", "Tareas generales", "ASISTENTE", "1ER SEMANA"),
    ("Tamara Maquieyra", "VEP Monotributo", "ASISTENTE", "1ER SEMANA"),
    ("Valle Trivellini", "IIBB AGIP", "ASISTENTE", "2DA SEMANA"),
    ("Valle Trivellini", "VEP Monotributo", "ASISTENTE", "2DA SEMANA"),
    ("Victoria Carlini", "VEP Monotributo", "ASISTENTE", "2DA SEMANA"),
    ("Victoria Carlini", "IIBB CM", "ASISTENTE", "2DA SEMANA"),
    ("Victoria Carlini", "Tareas generales", "ASISTENTE", "2DA SEMANA"),
    ("Victoria Recchia", "IIBB AGIP", "ASISTENTE", "1ER SEMANA"),
    ("Virginia Esquivel", "IIBB AGIP", "ASISTENTE", "1ER SEMANA"),
    ("Virginia Esquivel", "Tareas generales", "ASISTENTE", "1ER SEMANA"),
]

# Mapeo semana → día del mes para el vencimiento
SEMANA_DIA = {
    "1ER SEMANA": 7,
    "2DA SEMANA": 14,
    "3ER SEMANA": 21,
    "4TA SEMANA": 28,
}

# Meses: abril (4) a diciembre (12) de 2026
MESES = list(range(4, 13))  # [4, 5, 6, 7, 8, 9, 10, 11, 12]

NOMBRE_MES = {
    4: "Abril", 5: "Mayo", 6: "Junio", 7: "Julio",
    8: "Agosto", 9: "Septiembre", 10: "Octubre",
    11: "Noviembre", 12: "Diciembre",
}


def generate_tasks():
    """Genera todas las tareas para abril-diciembre 2026."""
    docs = []
    task_id = 1

    for mes in MESES:
        for (cliente, tarea, responsable, semana) in TAREAS_BASE:
            dia = SEMANA_DIA[semana]
            vencimiento = f"2026-{mes:02d}-{dia:02d}"
            doc = {
                "taskId": task_id,
                "cliente": cliente,
                "tarea": tarea,
                "responsable": responsable,
                "assignedTo": None,
                "semana": semana,
                "vencimiento": vencimiento,
                "mes": NOMBRE_MES[mes],
                "completado": False,
                "revisado": False,
                "enviado": False,
                "finalizada": False,
                "fechaFinalizacion": None,
                "createdAt": datetime.utcnow().isoformat(),
            }
            docs.append(doc)
            task_id += 1

    return docs


def main():
    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]

    # 1. Borrar todas las tareas actuales
    result = db.tasks.delete_many({})
    print(f"✅ Tareas borradas: {result.deleted_count}")

    # 2. Borrar schedules asociados
    result2 = db.schedules.delete_many({})
    print(f"✅ Schedules borrados: {result2.deleted_count}")

    # 3. Generar e insertar nuevas tareas
    docs = generate_tasks()
    print(f"📋 Tareas a insertar: {len(docs)}")

    result3 = db.tasks.insert_many(docs)
    print(f"✅ Tareas insertadas: {len(result3.inserted_ids)}")

    # Resumen por mes
    for mes in MESES:
        count = db.tasks.count_documents({"mes": NOMBRE_MES[mes]})
        print(f"   {NOMBRE_MES[mes]}: {count} tareas")

    client.close()
    print("\n🎉 ¡Listo! Base de datos actualizada.")


if __name__ == "__main__":
    main()
