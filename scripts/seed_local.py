"""
Seed script: carga clientes y tareas desde data.json a la API local.
Uso: python scripts/seed_local.py
"""
import json
import sys
import urllib.request
import urllib.error

BASE_URL = "http://localhost:8080"


def post(path, data):
    body = json.dumps(data).encode()
    req = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        print(f"  ERROR {e.code}: {err[:100]}")
        return None


def get(path):
    req = urllib.request.Request(f"{BASE_URL}{path}", method="GET")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def main():
    with open("data.json") as f:
        data = json.load(f)

    # ---- Clientes ----
    print("Cargando clientes...")
    existing_clientes = {c["nombre"] for c in get("/api/clientes")}
    clientes_creados = 0
    for nombre in data["clientes"]:
        if nombre in existing_clientes:
            continue
        result = post("/api/clientes", {"nombre": nombre})
        if result:
            clientes_creados += 1
    print(f"  {clientes_creados} clientes creados ({len(existing_clientes)} ya existían)")

    # ---- Tareas ----
    print("Cargando tareas...")
    existing_tasks = {t["taskId"] for t in get("/api/tasks")}
    tasks_creadas = 0
    for t in data["tareas"]:
        task_payload = {
            "cliente": t["cliente"],
            "tarea": t["tarea"],
            "responsable": t["responsable"],
            "semana": t["semana"],
            "vencimiento": t["vencimiento"],
            "assignedTo": t.get("assignedTo", ""),
        }
        result = post("/api/tasks", task_payload)
        if result:
            tasks_creadas += 1
    print(f"  {tasks_creadas} tareas creadas ({len(existing_tasks)} ya existían)")

    print("\nDone! Base de datos populada.")


if __name__ == "__main__":
    main()
