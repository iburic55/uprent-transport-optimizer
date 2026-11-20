"""REST API oko optimizatora (za React sučelje).

Pokretanje:  uvicorn api.main:app --reload
Ako postoji izgrađeni frontend (frontend/dist), isti proces ga i poslužuje na /.
"""
from __future__ import annotations

from dataclasses import replace
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from optimizer import LOCATIONS, MACHINES, ORDERS, TRUCKS, Location, Order, Settings, Truck
from optimizer import check_inputs, optimize, validate_plan
from optimizer.insight import UNLIMITED_H, time_limit_insight, unlimited_settings
from optimizer.solver import DELIVERY, PICKUP, RETURN, START, Plan, TruckPlan

app = FastAPI(title="UP Rent – optimizacija prijevoza", version="1.0.0")

ACTION_KIND = {START: "start", PICKUP: "pickup", DELIVERY: "delivery", RETURN: "return"}


# ------------------------------------------------------------------ ulazni modeli
class TruckIn(BaseModel):
    name: str
    capacity_kg: int
    max_machines: int


class MachineIn(BaseModel):
    code: str
    weight_kg: int


class LocationIn(BaseModel):
    code: str
    x: float
    y: float
    label: str = ""


class OrderIn(BaseModel):
    code: str
    machine: str
    pickup: str
    delivery: str


class SettingsIn(BaseModel):
    max_hours: float = Field(9.0, gt=0, le=24)
    handling_min: float = Field(20.0, ge=0, le=240)
    speed_kmh: float = Field(60.0, gt=0, le=200)
    handling_counts: bool = True


class ProblemIn(BaseModel):
    trucks: list[TruckIn]
    machines: list[MachineIn]
    locations: list[LocationIn]
    orders: list[OrderIn]
    settings: SettingsIn = SettingsIn()


# ------------------------------------------------------------------ pretvorba
def to_model(p: ProblemIn) -> tuple[tuple[Truck, ...], tuple[Location, ...], tuple[Order, ...],
                                     Settings, list[str]]:
    problems: list[str] = []
    codes = [m.code for m in p.machines]
    for c in sorted({c for c in codes if codes.count(c) > 1}):
        problems.append(f"Oznaka stroja „{c}” pojavljuje se više puta.")
    weights = {m.code: m.weight_kg for m in p.machines}
    trucks = tuple(Truck(t.name, t.capacity_kg, t.max_machines) for t in p.trucks)
    locations = tuple(Location(l.code, l.x, l.y, l.label) for l in p.locations)
    orders = []
    for o in p.orders:
        if o.machine not in weights:
            problems.append(f"Nalog {o.code}: nepoznat stroj „{o.machine}”.")
            continue
        orders.append(Order(o.code, o.machine, weights[o.machine], o.pickup, o.delivery))
    s = Settings(max_hours=p.settings.max_hours, handling_min=p.settings.handling_min,
                 speed_kmh=p.settings.speed_kmh, handling_counts=p.settings.handling_counts)
    problems += check_inputs(list(trucks), list(locations), orders, s.base)
    return trucks, locations, tuple(orders), s, problems


@lru_cache(maxsize=256)
def cached_optimize(trucks, locations, orders, s: Settings) -> Plan:
    return optimize(orders=list(orders), trucks=list(trucks), locations=list(locations),
                    settings=s)


# ------------------------------------------------------------------ izlaz
def truck_out(tp: TruckPlan, s: Settings, weights: dict[str, int]) -> dict:
    steps, timeline = [], []
    prev_end, prev_loc = 0.0, s.base
    for st in tp.steps:
        kind = ACTION_KIND[st.action]
        drive = st.leg_km / s.speed_kmh * 60
        handling = s.handling_min if kind in ("pickup", "delivery") else 0.0
        if drive > 0:
            timeline.append({"kind": "drive", "start": prev_end, "end": prev_end + drive,
                             "from": prev_loc, "to": st.location})
        if handling:
            timeline.append({"kind": kind, "start": prev_end + drive,
                             "end": prev_end + drive + handling, "at": st.location,
                             "order": st.order, "machine": st.machine})
        prev_end += drive + handling
        prev_loc = st.location
        steps.append({
            "seq": st.seq, "location": st.location, "kind": kind, "action": st.action,
            "order": st.order, "machine": st.machine,
            "weight_kg": weights.get(st.order) if st.order else None,
            "leg_km": st.leg_km, "cum_km": st.cum_km, "load_kg": st.load_kg,
            "machines_on_board": st.machines_on_board, "elapsed_min": round(prev_end, 2),
        })
    route = [x.location for x in tp.steps]
    used = tp.total_min if s.handling_counts else tp.drive_min
    return {
        "name": tp.truck.name, "capacity_kg": tp.truck.capacity_kg,
        "max_machines": tp.truck.max_machines, "km": tp.km,
        "drive_min": round(tp.drive_min, 2), "handling_min": round(tp.handling_min, 2),
        "total_min": round(tp.total_min, 2), "limit_used_min": round(used, 2),
        "utilization": round(used / (s.max_hours * 60), 4),
        "orders_done": tp.orders_done,
        "route": [c for i, c in enumerate(route) if i == 0 or c != route[i - 1]],
        "peak_load_kg": max(x.load_kg for x in tp.steps),
        "steps": steps, "timeline": timeline,
    }


def plan_out(plan: Plan, orders, locations) -> dict:
    weights = {o.code: o.weight_kg for o in orders}
    errors = validate_plan(plan, list(orders), list(locations))
    return {
        "total_km": plan.total_km, "orders_done": plan.orders_done,
        "orders_total": len(orders), "optimal": plan.optimal,
        "valid": not errors, "validation_errors": errors,
        "trucks": [truck_out(tp, plan.settings, weights) for tp in plan.trucks],
        "unassigned": [{"order": o.code, "machine": o.machine, "weight_kg": o.weight_kg,
                        "pickup": o.pickup, "delivery": o.delivery, "reason": r}
                       for o, r in plan.unassigned],
    }


def scenario_out(key: str, label: str, plan: Plan) -> dict:
    return {"key": key, "label": label, "total_km": plan.total_km,
            "orders_done": plan.orders_done, "optimal": plan.optimal,
            "trucks": [{"name": tp.truck.name, "km": tp.km, "orders": len(tp.orders_done),
                        "total_min": round(tp.total_min, 2), "drive_min": round(tp.drive_min, 2)}
                       for tp in plan.trucks]}


# ------------------------------------------------------------------ rute
@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/defaults")
def defaults() -> dict:
    return {
        "trucks": [{"name": t.name, "capacity_kg": t.capacity_kg,
                    "max_machines": t.max_machines} for t in TRUCKS],
        "machines": [{"code": k, "weight_kg": v} for k, v in MACHINES.items()],
        "locations": [{"code": l.code, "x": l.x, "y": l.y, "label": l.label} for l in LOCATIONS],
        "orders": [{"code": o.code, "machine": o.machine, "pickup": o.pickup,
                    "delivery": o.delivery} for o in ORDERS],
        "settings": SettingsIn().model_dump(),
    }


@app.post("/api/optimize")
def optimize_endpoint(problem: ProblemIn) -> dict:
    trucks, locations, orders, s, problems = to_model(problem)
    if problems:
        return {"problems": problems, "plan": None, "scenarios": [], "insight": None}

    plan = cached_optimize(trucks, locations, orders, s)
    free = cached_optimize(trucks, locations, orders, unlimited_settings(s))
    strict = cached_optimize(trucks, locations, orders, replace(s, handling_counts=True))
    drive_only = cached_optimize(trucks, locations, orders, replace(s, handling_counts=False))
    ins = time_limit_insight(plan, free)
    return {
        "problems": [],
        "plan": plan_out(plan, orders, locations),
        "scenarios": [
            scenario_out("strict", "Vožnja + utovar/istovar ≤ limit", strict),
            scenario_out("drive", "Samo vožnja ≤ limit", drive_only),
            scenario_out("free", "Bez vremenskog ograničenja (teoretski minimum)", free),
        ],
        "insight": None if ins is None else {
            "free_km": ins.free_km, "plan_km": ins.plan_km, "delta_km": ins.delta_km,
            "longest_truck": ins.longest_truck, "longest_min": round(ins.longest_min, 2),
            "limit_h": ins.limit_h, "handling_counts": ins.handling_counts,
            "moved": [{"order": c, "truck": t} for c, t in ins.moved],
        },
        "unlimited_h": UNLIMITED_H,
    }


# ------------------------------------------------------------------ izgrađeni frontend
DIST = Path(__file__).resolve().parents[1] / "frontend" / "dist"
if DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        file = DIST / path
        if path and file.is_file() and DIST in file.resolve().parents:
            return FileResponse(file)
        return FileResponse(DIST / "index.html")
