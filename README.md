# MotorGuard — Smart Motor Protection & Fault Diagnosis

**A portfolio-grade educational simulator for three-phase induction motor monitoring, protection logic and maintenance diagnostics.**

MotorGuard provides a live HMI-style dashboard for simulated motors. It generates telemetry, evaluates configurable protection limits, identifies common electrical/mechanical symptoms and records events.

> **Safety:** This is a software demonstration using synthetic data. It is not a certified protection relay, safety controller, or substitute for properly engineered motor protection. Never connect it to live equipment or use its output to make safety-critical decisions.

## Features
- Live simulated voltage, current, winding temperature, vibration, frequency and speed
- Three-phase voltage/current imbalance indicators
- Protection logic: overload, under/overvoltage, phase loss, overtemperature and high vibration
- Fault diagnosis with likely causes and recommended inspection steps
- Fault injection controls for demonstrations
- Event history and acknowledge/reset workflow
- KPI cards and live trend chart
- REST API with interactive Swagger docs

## Stack
- Backend: Python 3.10+, FastAPI, Pydantic
- Frontend: React, Vite, Recharts
- Data: in-memory simulation (resets when backend restarts)

## Run on Windows

### 1. Backend
Open CMD:
```cmd
cd path\to\MotorGuard-Smart-Motor-Protection\backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```
API: http://localhost:8000  
Swagger: http://localhost:8000/docs

### 2. Frontend
Open a **second** CMD:
```cmd
cd path\to\MotorGuard-Smart-Motor-Protection\frontend
npm install
npm run dev
```
Dashboard: http://localhost:5173

Keep both CMD windows open while using the dashboard.

## API overview
- `GET /api/health` — service status
- `GET /api/motors` — configured motors
- `GET /api/telemetry` — latest simulated readings and protection status
- `GET /api/history?limit=60` — recent readings
- `GET /api/events` — event log
- `POST /api/faults/{motor_id}` — inject a demonstration fault
- `POST /api/acknowledge/{event_id}` — acknowledge an event
- `POST /api/reset/{motor_id}` — clear injected faults after inspection

## Protection model
The demo uses transparent rule-based thresholds. Limits are illustrative and configurable in `backend/app/main.py`; they are not universal motor settings. Real settings must come from motor nameplate data, manufacturer documentation, coordination studies and applicable standards.

## Suggested extensions
1. Replace the simulator with Modbus TCP/OPC UA data from a test PLC.
2. Add authenticated users and persistent PostgreSQL storage.
3. Add motor nameplate configuration and engineering-unit calibration.
4. Train and validate a fault-classification model on labelled, representative data.
5. Add downloadable maintenance reports.

## Interview talking points
Explain the difference between overload and short-circuit protection, why phase imbalance heats a motor, what vibration can indicate, how protection thresholds should be selected, and why a simulation must not be treated as a certified relay.
