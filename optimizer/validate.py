"""Nezavisna provjera plana: sve se ponovno računa iz niza radnji.

Koristi se u testovima i u aplikaciji (zeleni/crveni status), kako se ne bi
slijepo vjerovalo optimizatoru.
"""
from __future__ import annotations

import math

from .data import Location, Order, Settings
from .solver import DELIVERY, PICKUP, Plan


def _km(a: Location, b: Location) -> float:
    return round(math.floor(math.hypot(a.x - b.x, a.y - b.y) * 10 + 0.5 + 1e-9) / 10, 1)


def validate_plan(plan: Plan, orders: list[Order], locations: list[Location]) -> list[str]:
    """Vrati popis prekršaja. Prazan popis znači da je plan ispravan."""
    s: Settings = plan.settings
    loc = {l.code: l for l in locations}
    by_code = {o.code: o for o in orders}
    errors: list[str] = []
    seen: dict[str, str] = {}

    for tp in plan.trucks:
        t = tp.truck
        here, km, load, onboard = s.base, 0.0, 0, set()
        picked: set[str] = set()
        for k, (code, act) in enumerate(tp.actions, start=1):
            o = by_code.get(code)
            if o is None:
                errors.append(f"{t.name}: nalog {code} ne postoji u popisu naloga.")
                continue
            if act == PICKUP:
                if code in picked:
                    errors.append(f"{t.name}: nalog {code} preuzet dvaput.")
                if code in seen:
                    errors.append(f"{code} je dodijeljen i kamionu {seen[code]} i kamionu {t.name}.")
                seen[code] = t.name
                picked.add(code)
                to = o.pickup
                load += o.weight_kg
                onboard.add(code)
            elif act == DELIVERY:
                if code not in onboard:
                    errors.append(f"{t.name}: {code} isporučen prije preuzimanja "
                                  f"ili ga nije preuzeo ovaj kamion.")
                to = o.delivery
                load -= o.weight_kg
                onboard.discard(code)
            else:
                errors.append(f"{t.name}: nepoznata radnja {act}.")
                continue
            km += _km(loc[here], loc[to])
            here = to
            if k < len(tp.steps) and (tp.steps[k].load_kg != load
                                      or tp.steps[k].machines_on_board != len(onboard)):
                errors.append(f"{t.name}: prikazano opterećenje nakon radnje {k} "
                              f"({tp.steps[k].load_kg} kg, {tp.steps[k].machines_on_board} str.) "
                              f"≠ izračunato ({load} kg, {len(onboard)} str.).")
            if load > t.capacity_kg:
                errors.append(f"{t.name}: prekoračena nosivost ({load} kg > {t.capacity_kg} kg) "
                              f"nakon radnje na {code}.")
            if len(onboard) > t.max_machines:
                errors.append(f"{t.name}: previše strojeva ({len(onboard)} > {t.max_machines}).")
        if onboard:
            errors.append(f"{t.name}: strojevi {sorted(onboard)} nisu isporučeni.")
        km += _km(loc[here], loc[s.base])
        if tp.steps[-1].location != s.base:
            errors.append(f"{t.name}: ruta ne završava u bazi.")
        if abs(km - tp.km) > 0.05:
            errors.append(f"{t.name}: prijavljena kilometraža {tp.km} ≠ izračunata {km:.1f}.")
        drive = km / s.speed_kmh * 60
        handling = len(tp.actions) * s.handling_min
        used = drive + handling if s.handling_counts else drive
        if used > s.max_hours * 60 + 1e-6:
            errors.append(f"{t.name}: prekoračeno radno vrijeme ({used / 60:.2f} h > {s.max_hours} h).")

    unassigned = {o.code for o, _ in plan.unassigned}
    for code in sorted(unassigned & set(seen)):
        errors.append(f"Nalog {code} je izvršen, a istodobno označen kao neizvršiv.")
    for o in orders:
        if o.code not in seen and o.code not in unassigned:
            errors.append(f"Nalog {o.code} nije ni izvršen ni označen kao neizvršiv.")
    return errors
