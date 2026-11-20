"""Optimizacija prijevoza radnih strojeva (pickup & delivery s kapacitetom i vremenom).

Pristup
-------
1. Za svaki kamion zasebno: egzaktno dinamičko programiranje nad stanjima
   (status svakog naloga: 0 = čeka, 1 = na kamionu, 2 = isporučen) + trenutna lokacija.
   Prijelazi su samo dopuštene radnje (utovar ako stane, istovar ako je stroj na kamionu),
   pa nosivost i broj strojeva nikad nisu prekoračeni. Rezultat je, za SVAKI podskup
   naloga koji kamion može odraditi, najkraća ruta baza -> ... -> baza.
2. Kombinacija kamiona: od svih parova disjunktnih podskupova koji stanu u radno vrijeme
   bira se onaj s najviše izvršenih naloga, a zatim s najmanjom ukupnom kilometražom.

Udaljenosti su euklidske, zaokružene na 0,1 km po dionici. Interno se računa u
desetinkama kilometra (cijeli brojevi), pa nema grešaka zaokruživanja.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

from .data import LOCATIONS, ORDERS, TRUCKS, Location, Order, Settings, Truck

PICKUP = "Preuzimanje"
DELIVERY = "Isporuka"
START = "Polazak"
RETURN = "Povratak"


# --------------------------------------------------------------------------- udaljenosti
def leg_tenths(a: Location, b: Location) -> int:
    """Euklidska udaljenost u desetinkama km, zaokružena na 0,1 km (half-up)."""
    return math.floor(math.hypot(a.x - b.x, a.y - b.y) * 10 + 0.5 + 1e-9)


def leg_km(a: Location, b: Location) -> float:
    return leg_tenths(a, b) / 10


def distance_matrix(locations: list[Location]) -> dict[str, dict[str, float]]:
    return {a.code: {b.code: leg_km(a, b) for b in locations} for a in locations}


# --------------------------------------------------------------------------- rezultati
@dataclass
class Step:
    seq: int
    location: str
    action: str
    order: str | None
    machine: str | None
    leg_km: float
    cum_km: float
    load_kg: int
    machines_on_board: int
    elapsed_min: float


@dataclass
class TruckPlan:
    truck: Truck
    actions: list[tuple[str, str]]          # [(kod naloga, PICKUP|DELIVERY), ...]
    steps: list[Step]
    km: float
    drive_min: float
    handling_min: float

    @property
    def total_min(self) -> float:
        return self.drive_min + self.handling_min

    @property
    def orders_done(self) -> list[str]:
        return [o for o, a in self.actions if a == DELIVERY]


@dataclass
class Plan:
    trucks: list[TruckPlan]
    unassigned: list[tuple[Order, str]]
    settings: Settings
    optimal: bool = True
    notes: list[str] = field(default_factory=list)

    @property
    def total_km(self) -> float:
        return round(sum(t.km for t in self.trucks), 1)

    @property
    def orders_done(self) -> int:
        return sum(len(t.orders_done) for t in self.trucks)


# --------------------------------------------------------------------------- vrijeme
def drive_minutes(tenths: int, s: Settings) -> float:
    return tenths / 10 / s.speed_kmh * 60


def limit_ok(tenths: int, n_orders: int, s: Settings) -> bool:
    drive = drive_minutes(tenths, s)
    handling = 2 * n_orders * s.handling_min
    used = drive + handling if s.handling_counts else drive
    return used <= s.max_hours * 60 + 1e-9


# --------------------------------------------------------------------------- DP po kamionu
MAX_ORDERS_PER_TRUCK = 12  # 3^12 stanja je gornja granica za egzaktni DP


def solve_single_truck(
    truck: Truck,
    orders: list[Order],
    loc: dict[str, Location],
    s: Settings,
) -> dict[frozenset[str], tuple[int, list[tuple[str, str]]]]:
    """Za svaki izvedivi podskup naloga vrati (km u desetinkama, niz radnji).

    Uključuje i prazan podskup (kamion ostaje u bazi).
    """
    n = len(orders)
    if n > MAX_ORDERS_PER_TRUCK:
        raise ValueError(
            f"{truck.name}: {n} naloga je previše za egzaktni algoritam "
            f"(maksimalno {MAX_ORDERS_PER_TRUCK})."
        )
    p3 = [3**i for i in range(n)]
    w = [o.weight_kg for o in orders]
    codes = list(loc)
    idx = {c: i for i, c in enumerate(codes)}
    dist = [[leg_tenths(loc[a], loc[b]) for b in codes] for a in codes]
    pick = [idx[o.pickup] for o in orders]
    deli = [idx[o.delivery] for o in orders]
    base = idx[s.base]

    # levels[k] = {(stanje, lokacija): trošak}; svaki korak povećava zbroj znamenki za 1
    parent: dict[tuple[int, int], tuple[tuple[int, int], int, int]] = {}
    level: dict[tuple[int, int], int] = {(0, base): 0}
    finals: dict[frozenset[str], tuple[int, tuple[int, int]]] = {}

    for _ in range(2 * n + 1):
        nxt: dict[tuple[int, int], int] = {}
        for key, cost in level.items():
            st, here = key
            digits = [(st // p3[i]) % 3 for i in range(n)]
            onboard = [i for i in range(n) if digits[i] == 1]
            load = sum(w[i] for i in onboard)

            if not onboard:  # kamion je prazan -> može se vratiti u bazu
                done = frozenset(orders[i].code for i in range(n) if digits[i] == 2)
                total = cost + dist[here][base]
                if done not in finals or total < finals[done][0]:
                    finals[done] = (total, key)

            for i in range(n):
                if digits[i] == 0:
                    if load + w[i] > truck.capacity_kg or len(onboard) + 1 > truck.max_machines:
                        continue
                    to, kind = pick[i], 0
                elif digits[i] == 1:
                    to, kind = deli[i], 1
                else:
                    continue
                nkey = (st + p3[i], to)
                ncost = cost + dist[here][to]
                if nkey not in nxt or ncost < nxt[nkey]:
                    nxt[nkey] = ncost
                    parent[nkey] = (key, i, kind)
        level = nxt

    result = {}
    for subset, (total, key) in finals.items():
        if not limit_ok(total, len(subset), s):
            continue
        actions = []
        while key in parent:
            prev, i, kind = parent[key]
            actions.append((orders[i].code, PICKUP if kind == 0 else DELIVERY))
            key = prev
        actions.reverse()
        result[subset] = (total, actions)
    return result


# --------------------------------------------------------------------------- izvještaj rute
def build_truck_plan(
    truck: Truck,
    actions: list[tuple[str, str]],
    orders_by_code: dict[str, Order],
    loc: dict[str, Location],
    s: Settings,
) -> TruckPlan:
    steps = [Step(0, s.base, START, None, None, 0.0, 0.0, 0, 0, 0.0)]
    here, tenths, load, count, handling = s.base, 0, 0, 0, 0.0
    for k, (code, act) in enumerate(actions, start=1):
        o = orders_by_code[code]
        to = o.pickup if act == PICKUP else o.delivery
        leg = leg_tenths(loc[here], loc[to])
        tenths += leg
        handling += s.handling_min
        if act == PICKUP:
            load, count = load + o.weight_kg, count + 1
        else:
            load, count = load - o.weight_kg, count - 1
        steps.append(Step(k, to, act, code, o.machine, leg / 10, tenths / 10, load, count,
                          drive_minutes(tenths, s) + handling))
        here = to
    leg = leg_tenths(loc[here], loc[s.base])
    tenths += leg
    steps.append(Step(len(actions) + 1, s.base, RETURN, None, None, leg / 10, tenths / 10,
                      load, count, drive_minutes(tenths, s) + handling))
    return TruckPlan(truck, actions, steps, tenths / 10, drive_minutes(tenths, s), handling)


# --------------------------------------------------------------------------- glavna funkcija
def optimize(
    orders: list[Order] | None = None,
    trucks: list[Truck] | None = None,
    locations: list[Location] | None = None,
    settings: Settings | None = None,
) -> Plan:
    orders = list(ORDERS if orders is None else orders)
    trucks = list(TRUCKS if trucks is None else trucks)
    locations = list(LOCATIONS if locations is None else locations)
    s = settings or Settings()
    loc = {l.code: l for l in locations}
    by_code = {o.code: o for o in orders}

    unassigned: list[tuple[Order, str]] = []
    candidates: list[Order] = []
    for o in orders:
        if o.pickup not in loc or o.delivery not in loc:
            unassigned.append((o, "Nepoznata lokacija preuzimanja ili isporuke."))
        elif not any(o.weight_kg <= t.capacity_kg and t.max_machines >= 1 for t in trucks):
            unassigned.append((o, f"Stroj {o.machine} ({o.weight_kg:,} kg) je preteži od "
                                  f"nosivosti svih kamiona."))
        else:
            candidates.append(o)

    # opcije po kamionu: podskup -> (desetinke km, radnje)
    options = []
    for t in trucks:
        eligible = [o for o in candidates if o.weight_kg <= t.capacity_kg]
        options.append(solve_single_truck(t, eligible, loc, s))

    # kombiniranje: (broj naloga desc, km asc) preko disjunktnih podskupova
    best: dict[frozenset[str], tuple[int, list[frozenset[str]]]] = {frozenset(): (0, [])}
    for opt in options:
        new: dict[frozenset[str], tuple[int, list[frozenset[str]]]] = {}
        for used, (km, picks) in best.items():
            for subset, (t_km, _) in opt.items():
                if used & subset:
                    continue
                key = used | subset
                total = km + t_km
                if key not in new or total < new[key][0]:
                    new[key] = (total, picks + [subset])
        best = new

    chosen_key = min(best, key=lambda k: (-len(k), best[k][0], sorted(k)))
    _, picks = best[chosen_key]

    truck_plans = [
        build_truck_plan(t, options[i][picks[i]][1], by_code, loc, s)
        for i, t in enumerate(trucks)
    ]

    for o in candidates:
        if o.code in chosen_key:
            continue
        alone = any(frozenset([o.code]) in opt for opt in options)
        if alone:
            reason = ("Nalog je izvediv sam za sebe, ali uz ostale naloge nema dovoljno "
                      "radnog vremena ni u jednom kamionu (ograničenje "
                      f"{s.max_hours:g} h).")
        else:
            reason = (f"Ni jedan kamion ne može odraditi ovaj nalog unutar "
                      f"{s.max_hours:g} h (vožnja baza → preuzimanje → isporuka → baza).")
        unassigned.append((o, reason))

    order_pos = {o.code: i for i, o in enumerate(orders)}
    unassigned.sort(key=lambda x: order_pos[x[0].code])
    return Plan(truck_plans, unassigned, s, optimal=True)
