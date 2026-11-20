"""Heuristika za veće probleme (kad kamion ima više od MAX_ORDERS_PER_TRUCK naloga).

Egzaktni DP raste kao 3^n, pa se za veći broj naloga koristi:
1. **najjeftinije izvedivo umetanje** – nalozi od najtežeg prema najlakšem; za svaki se
   isprobaju svi kamioni i svi parovi pozicija (preuzimanje prije isporuke), a odabire se
   umetanje s najmanjim povećanjem kilometraže koje ne krši nosivost, broj strojeva ni radno
   vrijeme;
2. **lokalna pretraga** – (a) relokacija para: nalog se izvadi i ponovno umetne na najbolje
   mjesto u bilo kojem kamionu; (b) pomak radnje: pojedino preuzimanje ili isporuka pomakne
   se na drugo mjesto u istoj ruti. Ponavlja se dok se ukupna kilometraža smanjuje, a zatim
   se ponovno pokušaju umetnuti nalozi koji nisu stali;
3. **više početaka** – postupak se pokrene s nekoliko redoslijeda naloga (po težini, po
   udaljenosti, nekoliko pseudoslučajnih uz fiksni seed) i uzme se najbolji rezultat
   (najviše naloga, zatim najmanje km). Rezultat je ponovljiv.

Rezultat nije dokazano optimalan (Plan.optimal = False), ali je uvijek izvediv – a nezavisni
validator ga provjerava kao i egzaktni.
"""
from __future__ import annotations

import random

from .data import Location, Order, Settings, Truck
from .solver import DELIVERY, PICKUP, leg_tenths, limit_ok

Route = list[tuple[str, str]]


def _evaluate(truck: Truck, route: Route, by_code: dict[str, Order],
              loc: dict[str, Location], s: Settings) -> int | None:
    """Kilometraža rute u desetinkama km ili None ako ruta krši neko ograničenje."""
    here, tenths, load, onboard = s.base, 0, 0, set()
    for code, act in route:
        o = by_code[code]
        if act == PICKUP:
            if code in onboard:
                return None
            onboard.add(code)
            load += o.weight_kg
            if load > truck.capacity_kg or len(onboard) > truck.max_machines:
                return None
            to = o.pickup
        else:
            if code not in onboard:          # isporuka prije preuzimanja
                return None
            onboard.discard(code)
            load -= o.weight_kg
            to = o.delivery
        tenths += leg_tenths(loc[here], loc[to])
        here = to
    tenths += leg_tenths(loc[here], loc[s.base])
    if onboard or not limit_ok(tenths, len(route) // 2, s):
        return None
    return tenths


def _best_insertion(truck: Truck, route: Route, o: Order, by_code: dict[str, Order],
                    loc: dict[str, Location], s: Settings) -> tuple[int, Route] | None:
    if o.weight_kg > truck.capacity_kg or truck.max_machines < 1:
        return None
    best: tuple[int, Route] | None = None
    for i in range(len(route) + 1):
        with_pick = route[:i] + [(o.code, PICKUP)] + route[i:]
        for j in range(i + 1, len(with_pick) + 1):
            cand = with_pick[:j] + [(o.code, DELIVERY)] + with_pick[j:]
            t = _evaluate(truck, cand, by_code, loc, s)
            if t is not None and (best is None or t < best[0]):
                best = (t, cand)
    return best


class _Solution:
    def __init__(self, trucks: list[Truck], by_code: dict[str, Order],
                 loc: dict[str, Location], s: Settings):
        self.trucks, self.by_code, self.loc, self.s = trucks, by_code, loc, s
        self.routes: list[Route] = [[] for _ in trucks]
        self.cost = [0 for _ in trucks]

    def eval(self, ti: int, route: Route) -> int | None:
        return _evaluate(self.trucks[ti], route, self.by_code, self.loc, self.s)

    def insert(self, o: Order) -> bool:
        """Umetni nalog tamo gdje najmanje poveća ukupnu kilometražu."""
        best = None
        for ti, t in enumerate(self.trucks):
            r = _best_insertion(t, self.routes[ti], o, self.by_code, self.loc, self.s)
            if r is not None and (best is None or r[0] - self.cost[ti] < best[0]):
                best = (r[0] - self.cost[ti], ti, r)
        if best is None:
            return False
        _, ti, (tenths, route) = best
        self.routes[ti], self.cost[ti] = route, tenths
        return True

    def relocate_pair(self, code: str) -> bool:
        ti = next((i for i, r in enumerate(self.routes) if (code, PICKUP) in r), None)
        if ti is None:
            return False
        saved = ([list(r) for r in self.routes], list(self.cost))
        reduced = [a for a in self.routes[ti] if a[0] != code]
        reduced_cost = self.eval(ti, reduced)
        if reduced_cost is not None:
            self.routes[ti], self.cost[ti] = reduced, reduced_cost
            if self.insert(self.by_code[code]) and sum(self.cost) < sum(saved[1]):
                return True
        self.routes, self.cost = saved
        return False

    def shift_action(self, ti: int) -> bool:
        route, improved = self.routes[ti], False
        for k in range(len(route)):
            rest = route[:k] + route[k + 1:]
            for pos in range(len(rest) + 1):
                if pos == k:
                    continue
                cand = rest[:pos] + [route[k]] + rest[pos:]
                c = self.eval(ti, cand)
                if c is not None and c < self.cost[ti]:
                    route, self.cost[ti], improved = cand, c, True
                    break
        self.routes[ti] = route
        return improved

    @property
    def key(self) -> tuple[int, int]:
        return (-sum(len(r) for r in self.routes), sum(self.cost))


def _run(trucks: list[Truck], seq: list[Order], by_code: dict[str, Order],
         loc: dict[str, Location], s: Settings, max_rounds: int) -> _Solution:
    sol = _Solution(trucks, by_code, loc, s)
    pending = [o for o in seq if not sol.insert(o)]
    for _ in range(max_rounds):
        improved = False
        for o in seq:
            improved |= sol.relocate_pair(o.code)
        for ti in range(len(trucks)):
            improved |= sol.shift_action(ti)
        before = len(pending)
        pending = [o for o in pending if not sol.insert(o)]
        if not improved and len(pending) == before:
            break
    return sol


def insertion_routes(trucks: list[Truck], orders: list[Order], loc: dict[str, Location],
                     s: Settings, starts: int = 6, max_rounds: int = 20) -> list[Route]:
    by_code = {o.code: o for o in orders}
    base = loc[s.base]
    far = lambda o: -(leg_tenths(base, loc[o.pickup]) + leg_tenths(loc[o.pickup], loc[o.delivery]))  # noqa: E731
    seqs = [sorted(orders, key=lambda o: (-o.weight_kg, o.code)),
            sorted(orders, key=lambda o: (far(o), o.code))]
    rng = random.Random(42)
    for _ in range(max(0, starts - len(seqs))):
        seq = list(orders)
        rng.shuffle(seq)
        seqs.append(seq)
    best = min((_run(trucks, seq, by_code, loc, s, max_rounds) for seq in seqs),
               key=lambda sol: sol.key)
    return best.routes
