#!/bin/bash
export PYTHONPATH="/Users/javmo/Documents/Workspace/calendar-task/.venv/lib/python3.14/site-packages"
cd "$(dirname "$0")"
exec /opt/homebrew/bin/python3.14 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8080
