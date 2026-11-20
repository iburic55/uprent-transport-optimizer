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

Ako neki kamion ima više od MAX_ORDERS_PER_TRUCK mogućih naloga, koristi se heuristika iz
`heuristic.py` (Plan.optimal = False).

Udaljenosti su euklidske, zaokružene na 0,1 km po dionici. Interno se računa u
desetinkama kilometra (cijeli brojevi), pa nema grešaka zaokruživanja.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, replace

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
    optimal: bool = True    # False -> heuristički raspored (prevelik problem za egzaktni DP)

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
    w = [o.weight_kg for o in orders]
    codes = list(loc)
    idx = {c: i for i, c in enumerate(codes)}
    dist = [[leg_tenths(loc[a], loc[b]) for b in codes] for a in codes]
    pick = [idx[o.pickup] for o in orders]
    deli = [idx[o.delivery] for o in orders]
    base = idx[s.base]
    cap, max_m = truck.capacity_kg, truck.max_machines

    load_of: dict[int, int] = {0: 0}   # teret za skup strojeva na kamionu (memoizacija)

    def load(mask: int) -> int:
        if mask not in load_of:
            low = mask & -mask
            load_of[mask] = load(mask ^ low) + w[low.bit_length() - 1]
        return load_of[mask]

    # Stanje = (na kamionu, isporučeno, lokacija) kao bitmaske; svaki korak dodaje jednu radnju,
    # pa se stanja obrađuju po razinama. Za svako stanje pamti se najkraći put do njega.
    State = tuple[int, int, int]
    parent: dict[State, tuple[State, int, int]] = {}
    level: dict[State, int] = {(0, 0, base): 0}
    finals: dict[int, tuple[int, State]] = {}   # isporučeni skup -> (km, završno stanje)

    # Rezanje: stanje se odbacuje čim prijeđeni km + sav utovar/istovar koji je već obavljen ili
    # neizbježan (isporuka strojeva na kamionu) premašuje radno vrijeme. Povratak u bazu se
    # namjerno ne procjenjuje (zaokruživanje dionica može narušiti nejednakost trokuta).
    budget = s.max_hours * 60 + 1e-9
    per_km = 60 / s.speed_kmh
    hmin = s.handling_min if s.handling_counts else 0.0

    for step in range(2 * n + 1):
        nxt: dict[State, int] = {}
        for key, cost in level.items():
            on, done, here = key
            if not on:  # kamion je prazan -> može se vratiti u bazu
                total = cost + dist[here][base]
                if done not in finals or total < finals[done][0]:
                    finals[done] = (total, key)
            free_load = cap - load(on)
            room = on.bit_count() < max_m
            row = dist[here]
            for i in range(n):
                bit = 1 << i
                if on & bit:
                    to, kind, nkey = deli[i], 1, (on ^ bit, done | bit, deli[i])
                elif done & bit or not room or w[i] > free_load:
                    continue
                else:
                    to, kind, nkey = pick[i], 0, (on | bit, done, pick[i])
                ncost = cost + row[to]
                if ncost / 10 * per_km + (step + 1 + nkey[0].bit_count()) * hmin > budget:
                    continue
                if ncost < nxt.get(nkey, 1 << 60):
                    nxt[nkey] = ncost
                    parent[nkey] = (key, i, kind)
        level = nxt

    result = {}
    for mask, (total, key) in finals.items():
        subset = frozenset(orders[i].code for i in range(n) if mask >> i & 1)
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
        elif not trucks:
            unassigned.append((o, "Nema raspoloživih vozila."))
        elif not any(o.weight_kg <= t.capacity_kg and t.max_machines >= 1 for t in trucks):
            unassigned.append((o, f"Stroj {o.machine} ({o.weight_kg:,} kg) je preteži od "
                                  f"nosivosti svih kamiona."))
        else:
            candidates.append(o)

    eligible = [[o for o in candidates if o.weight_kg <= t.capacity_kg] for t in trucks]
    optimal = all(len(e) <= MAX_ORDERS_PER_TRUCK for e in eligible)
    if optimal:
        routes = _exact_routes(trucks, eligible, candidates, loc, s)
    else:
        from .heuristic import insertion_routes
        routes = insertion_routes(trucks, candidates, loc, s)

    truck_plans = [build_truck_plan(t, routes[i], by_code, loc, s) for i, t in enumerate(trucks)]
    done = {c for tp in truck_plans for c in tp.orders_done}

    for o in candidates:
        if o.code not in done:
            unassigned.append((o, _time_reason(o, trucks, truck_plans, by_code, loc, s)))

    order_pos = {o.code: i for i, o in enumerate(orders)}
    unassigned.sort(key=lambda x: order_pos[x[0].code])
    return Plan(truck_plans, unassigned, s, optimal=optimal)


def _hm(minutes: float) -> str:
    m = round(minutes)
    return f"{m // 60} h {m % 60:02d} min"


def _kg(x: int) -> str:
    return f"{x:,}".replace(",", ".")


def _time_reason(o: Order, trucks: list[Truck], truck_plans: list[TruckPlan],
                 by_code: dict[str, Order], loc: dict[str, Location], s: Settings) -> str:
    """Razlog po kamionu za nalog koji nije stao u radno vrijeme.

    Za kamion u koji stroj stane procijeni se koliko bi radio da se nalog najjeftinije umetne
    u njegovu postojeću rutu (bez vremenskog limita). To je samo objašnjenje: raspored se ne
    mijenja, a optimum je već utvrđen.
    """
    from .heuristic import _best_insertion

    no_limit = replace(s, max_hours=math.inf)
    limit = f"limit {s.max_hours:g} h"
    parts = []
    for t, tp in zip(trucks, truck_plans):
        if o.weight_kg > t.capacity_kg:
            parts.append(f"{t.name}: stroj je pretežak ({_kg(o.weight_kg)} kg > "
                         f"{_kg(t.capacity_kg)} kg)")
            continue
        if t.max_machines < 1:
            parts.append(f"{t.name}: ne može voziti strojeve")
            continue
        tenths, route = _best_insertion(t, tp.actions, o, by_code, loc, no_limit)
        handling = len(route) * s.handling_min if s.handling_counts else 0.0
        minutes = drive_minutes(tenths, s) + handling
        if not tp.actions:
            parts.append(f"{t.name}: ni sam ovaj nalog ne stane ({_hm(minutes)})")
        else:
            parts.append(f"{t.name}: stroj stane, ali bi uz svoje naloge radio {_hm(minutes)}")
    if any(single_order_fits(t, o, loc, s) for t in trucks):
        head = f"Uz ostale naloge nema dovoljno radnog vremena ni u jednom kamionu ({limit})."
    else:
        head = (f"Ni jedan kamion nema dovoljno radnog vremena za ovaj nalog ni kad vozi samo "
                f"njega ({limit}).")
    return f"{head} " + "; ".join(parts) + "."


def single_order_fits(truck: Truck, o: Order, loc: dict[str, Location], s: Settings) -> bool:
    """Može li kamion odraditi samo ovaj nalog: baza → preuzimanje → isporuka → baza."""
    if o.weight_kg > truck.capacity_kg or truck.max_machines < 1:
        return False
    b = loc[s.base]
    tenths = (leg_tenths(b, loc[o.pickup]) + leg_tenths(loc[o.pickup], loc[o.delivery])
              + leg_tenths(loc[o.delivery], b))
    return limit_ok(tenths, 1, s)


def _exact_routes(
    trucks: list[Truck],
    eligible: list[list[Order]],
    candidates: list[Order],
    loc: dict[str, Location],
    s: Settings,
) -> list[list[tuple[str, str]]]:
    """Optimalna podjela: najviše izvršenih naloga, zatim najmanja ukupna kilometraža."""
    bit = {o.code: 1 << i for i, o in enumerate(candidates)}
    full = (1 << len(candidates)) - 1
    options = []   # po kamionu: maska podskupa -> (desetinke km, radnje)
    cache: dict[tuple, dict[int, tuple[int, list[tuple[str, str]]]]] = {}
    for t, elig in zip(trucks, eligible):
        sig = (t.capacity_kg, t.max_machines, tuple(o.code for o in elig))
        if sig not in cache:   # isti kamioni s istim nalozima računaju se samo jednom
            opt = solve_single_truck(t, elig, loc, s)
            cache[sig] = {sum(bit[c] for c in sub): v for sub, v in opt.items()}
        options.append(cache[sig])

    # best[maska iskorištenih naloga] = (km, [maska po kamionu])
    best: dict[int, tuple[int, list[int]]] = {0: (0, [])}
    for opt in options:
        new: dict[int, tuple[int, list[int]]] = {}
        for used, (km, picks) in best.items():
            free = full ^ used
            if len(opt) < 1 << free.bit_count():     # manje opcija nego podskupova
                subs = (m for m in opt if not m & used)
            else:                                    # nabroji podskupove slobodnih naloga
                subs = _submasks(free, opt)
            for sub in subs:
                key, total = used | sub, km + opt[sub][0]
                if key not in new or total < new[key][0]:
                    new[key] = (total, picks + [sub])
        best = new

    def rank(mask: int):
        return (-mask.bit_count(), best[mask][0],
                sorted(o.code for o in candidates if bit[o.code] & mask))

    _, picks = best[min(best, key=rank)]
    return [options[i][m][1] for i, m in enumerate(picks)]


def _submasks(free: int, opt: dict[int, object]):
    sub = free
    while True:
        if sub in opt:
            yield sub
        if sub == 0:
            return
        sub = (sub - 1) & free
