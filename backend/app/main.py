from __future__ import annotations

import random
import time
from collections import deque
from datetime import datetime, timezone
from threading import Lock
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="MotorGuard API", version="1.0.0",
              description="Educational three-phase motor protection simulator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

LOCK = Lock()
MOTORS = [
    {"id": "MTR-001", "name": "Main Conveyor Motor", "location": "Packaging Line A",
     "rating_kw": 7.5, "rated_current": 15.2, "rated_voltage": 415, "status": "RUNNING"},
    {"id": "MTR-002", "name": "Cooling Water Pump", "location": "Utility Section",
     "rating_kw": 5.5, "rated_current": 11.4, "rated_voltage": 415, "status": "RUNNING"},
    {"id": "MTR-003", "name": "Air Compressor Motor", "location": "Compressor Room",
     "rating_kw": 11.0, "rated_current": 21.5, "rated_voltage": 415, "status": "RUNNING"},
]
FAULTS: dict[str, set[str]] = {m["id"]: set() for m in MOTORS}
HISTORY: deque[dict[str, Any]] = deque(maxlen=180)
EVENTS: deque[dict[str, Any]] = deque(maxlen=100)
LAST_TICK = 0.0
LATEST: list[dict[str, Any]] = []

FAULT_INFO = {
    "overload": ("OVERLOAD", "Current above illustrative overload threshold",
                 "Check mechanical loading, bearing condition, driven equipment and motor current."),
    "phase_loss": ("PHASE LOSS", "One phase is missing or severely reduced",
                   "Isolate safely; inspect fuses, contactors, terminals and supply conductors."),
    "undervoltage": ("UNDERVOLTAGE", "Supply voltage below illustrative limit",
                     "Check incoming supply, transformer loading, cable voltage drop and connections."),
    "overvoltage": ("OVERVOLTAGE", "Supply voltage above illustrative limit",
                    "Check supply regulation, transformer taps and measurement circuit."),
    "overtemperature": ("OVERTEMPERATURE", "Motor temperature above illustrative limit",
                        "Check cooling airflow, fan, ambient temperature, loading and insulation condition."),
    "high_vibration": ("HIGH VIBRATION", "Vibration above illustrative warning limit",
                       "Inspect alignment, coupling, bearings, looseness and foundation."),
}

class FaultRequest(BaseModel):
    fault: str = Field(..., description="One of: overload, phase_loss, undervoltage, overvoltage, overtemperature, high_vibration")

def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()

def make_reading(motor: dict[str, Any]) -> dict[str, Any]:
    active = FAULTS[motor["id"]]
    voltage = [motor["rated_voltage"] + random.uniform(-4, 4) for _ in range(3)]
    current = [motor["rated_current"] * random.uniform(.68, .88) for _ in range(3)]
    temp = random.uniform(48, 62)
    vibration = random.uniform(1.0, 2.2)
    if "overload" in active:
        current = [motor["rated_current"] * random.uniform(1.22, 1.42) for _ in range(3)]
        temp += random.uniform(12, 20)
    if "phase_loss" in active:
        current[2] = random.uniform(.1, 1.0)
        voltage[2] *= random.uniform(.05, .18)
    if "undervoltage" in active:
        voltage = [v * random.uniform(.78, .84) for v in voltage]
    if "overvoltage" in active:
        voltage = [v * random.uniform(1.17, 1.22) for v in voltage]
    if "overtemperature" in active:
        temp = random.uniform(96, 108)
    if "high_vibration" in active:
        vibration = random.uniform(7.0, 9.0)

    avg_v = sum(voltage) / 3
    avg_i = sum(current) / 3
    v_imbalance = (max(voltage) - min(voltage)) / avg_v * 100 if avg_v else 0
    i_imbalance = (max(current) - min(current)) / avg_i * 100 if avg_i else 0
    alerts: list[dict[str, str]] = []
    if avg_i > motor["rated_current"] * 1.15:
        alerts.append({"code": "OVERLOAD", "severity": "CRITICAL", "message": FAULT_INFO["overload"][1]})
    if min(voltage) < 0.85 * motor["rated_voltage"]:
        alerts.append({"code": "PHASE LOSS", "severity": "CRITICAL", "message": FAULT_INFO["phase_loss"][1]})
    elif avg_v < 0.90 * motor["rated_voltage"]:
        alerts.append({"code": "UNDERVOLTAGE", "severity": "WARNING", "message": FAULT_INFO["undervoltage"][1]})
    if avg_v > 1.10 * motor["rated_voltage"]:
        alerts.append({"code": "OVERVOLTAGE", "severity": "WARNING", "message": FAULT_INFO["overvoltage"][1]})
    if temp > 90:
        alerts.append({"code": "OVERTEMPERATURE", "severity": "CRITICAL", "message": FAULT_INFO["overtemperature"][1]})
    if vibration > 5:
        alerts.append({"code": "HIGH VIBRATION", "severity": "WARNING", "message": FAULT_INFO["high_vibration"][1]})
    status = "TRIP" if any(a["severity"] == "CRITICAL" for a in alerts) else ("WARNING" if alerts else "HEALTHY")
    return {
        "motor_id": motor["id"], "timestamp": utc_now(),
        "voltage": [round(x, 1) for x in voltage],
        "current": [round(x, 2) for x in current],
        "avg_voltage": round(avg_v, 1), "avg_current": round(avg_i, 2),
        "temperature": round(temp, 1), "vibration": round(vibration, 2),
        "frequency": round(random.uniform(49.8, 50.2), 2),
        "speed_rpm": round(random.uniform(1430, 1480), 0),
        "voltage_imbalance_pct": round(v_imbalance, 2),
        "current_imbalance_pct": round(i_imbalance, 2),
        "power_factor": round(random.uniform(.78, .91), 2),
        "status": status, "alerts": alerts,
    }

def tick() -> list[dict[str, Any]]:
    global LAST_TICK, LATEST
    with LOCK:
        if time.monotonic() - LAST_TICK < 1 and LATEST:
            return LATEST
        readings = [make_reading(m) for m in MOTORS]
        for item in readings:
            HISTORY.append(item)
            for alert in item["alerts"]:
                if not any(e["motor_id"] == item["motor_id"] and e["code"] == alert["code"]
                           and not e["acknowledged"] for e in EVENTS):
                    EVENTS.appendleft({
                        "id": f"EVT-{int(time.time() * 1000)}-{random.randint(100,999)}",
                        "motor_id": item["motor_id"], "code": alert["code"],
                        "severity": alert["severity"], "message": alert["message"],
                        "timestamp": item["timestamp"], "acknowledged": False,
                    })
        LATEST = readings
        LAST_TICK = time.monotonic()
        return readings

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "MotorGuard API", "time": utc_now()}

@app.get("/api/motors")
def motors():
    readings = {r["motor_id"]: r for r in tick()}
    return [{**m, "live_status": readings[m["id"]]["status"]} for m in MOTORS]

@app.get("/api/telemetry")
def telemetry():
    return {"timestamp": utc_now(), "motors": tick()}

@app.get("/api/history")
def history(limit: int = 60, motor_id: str | None = None):
    rows = list(HISTORY)
    if motor_id:
        rows = [r for r in rows if r["motor_id"] == motor_id]
    return list(reversed(rows[-max(1, min(limit, 180)): ]))

@app.get("/api/events")
def events():
    return list(EVENTS)

@app.post("/api/faults/{motor_id}")
def inject_fault(motor_id: str, body: FaultRequest):
    if motor_id not in FAULTS:
        raise HTTPException(404, "Motor not found")
    if body.fault not in FAULT_INFO:
        raise HTTPException(400, f"Unsupported fault. Choose: {', '.join(FAULT_INFO)}")
    FAULTS[motor_id].add(body.fault)
    return {"message": f"Demonstration fault '{body.fault}' enabled on {motor_id}", "active_faults": sorted(FAULTS[motor_id])}

@app.post("/api/reset/{motor_id}")
def reset_motor(motor_id: str):
    if motor_id not in FAULTS:
        raise HTTPException(404, "Motor not found")
    FAULTS[motor_id].clear()
    return {"message": "Injected demonstration faults cleared", "motor_id": motor_id}

@app.post("/api/acknowledge/{event_id}")
def acknowledge(event_id: str):
    for event in EVENTS:
        if event["id"] == event_id:
            event["acknowledged"] = True
            return event
    raise HTTPException(404, "Event not found")

@app.get("/api/diagnostics")
def diagnostics():
    result = []
    for reading in tick():
        likely = []
        for alert in reading["alerts"]:
            match = next((v for v in FAULT_INFO.values() if v[0] == alert["code"]), None)
            if match:
                likely.append({"fault": match[0], "symptom": match[1], "inspection": match[2]})
        result.append({"motor_id": reading["motor_id"], "status": reading["status"], "likely_causes": likely})
    return result
