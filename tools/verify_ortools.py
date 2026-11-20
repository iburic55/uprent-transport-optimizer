"""Nezavisna provjera rezultata pomoću Google OR-Tools (opcionalno).

Isti problem modeliran je kao Pickup & Delivery VRP u OR-Toolsu i uspoređen s
egzaktnim DP rezultatom iz `optimizer`. OR-Tools je heuristika (lokalna pretraga),
pa ne smije naći BOLJE rješenje od DP-a; ako nađe isto, to je dobar znak.

Pokretanje:  pip install ortools  &&  python tools/verify_ortools.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ortools.constraint_solver import pywrapcp, routing_enums_pb2  # noqa: E402

from optimizer import LOCATIONS, ORDERS, TRUCKS, Settings, optimize  # noqa: E402
from optimizer.solver import leg_tenths  # noqa: E402


def solve_with_ortools(settings: Settings, seconds: int = 10) -> tuple[float, int] | None:
    """Vrati (ukupno km, broj izostavljenih naloga) ili None ako OR-Tools ne nađe rješenje."""
    loc = {l.code: l for l in LOCATIONS}
    # čvor 0 = baza, zatim (preuzimanje, isporuka) za svaki nalog
    nodes = [settings.base]
    pairs = []
    for o in ORDERS:
        pairs.append((len(nodes), len(nodes) + 1))
        nodes += [o.pickup, o.delivery]
    n = len(nodes)
    dist = [[leg_tenths(loc[a], loc[b]) for b in nodes] for a in nodes]
    weight = [0] * n
    count = [0] * n
    for (p, d), o in zip(pairs, ORDERS):
        weight[p], weight[d] = o.weight_kg, -o.weight_kg
        count[p], count[d] = 1, -1

    manager = pywrapcp.RoutingIndexManager(n, len(TRUCKS), 0)
    routing = pywrapcp.RoutingModel(manager)

    def d_cb(i, j):
        return dist[manager.IndexToNode(i)][manager.IndexToNode(j)]

    transit = routing.RegisterTransitCallback(d_cb)
    routing.SetArcCostEvaluatorOfAllVehicles(transit)

    w_cb = routing.RegisterUnaryTransitCallback(lambda i: weight[manager.IndexToNode(i)])
    routing.AddDimensionWithVehicleCapacity(w_cb, 0, [t.capacity_kg for t in TRUCKS], True, "w")
    c_cb = routing.RegisterUnaryTransitCallback(lambda i: count[manager.IndexToNode(i)])
    routing.AddDimensionWithVehicleCapacity(c_cb, 0, [t.max_machines for t in TRUCKS], True, "c")

    # vrijeme u desetinkama minute: 0,1 km pri 60 km/h = 0,1 min
    service = int(settings.handling_min * 10) if settings.handling_counts else 0
    scale = 60 / settings.speed_kmh

    def t_cb(i, j):
        a, b = manager.IndexToNode(i), manager.IndexToNode(j)
        return int(round(dist[a][b] * scale)) + (service if a != 0 else 0)

    time_cb = routing.RegisterTransitCallback(t_cb)
    routing.AddDimension(time_cb, 0, int(settings.max_hours * 600), True, "t")

    for p, d in pairs:
        pi, di = manager.NodeToIndex(p), manager.NodeToIndex(d)
        routing.AddPickupAndDelivery(pi, di)
        routing.solver().Add(routing.VehicleVar(pi) == routing.VehicleVar(di))
        routing.solver().Add(routing.GetDimensionOrDie("t").CumulVar(pi)
                             <= routing.GetDimensionOrDie("t").CumulVar(di))
        routing.AddDisjunction([pi], 10**7)  # dopušteno izostaviti nalog uz veliku kaznu
        routing.AddDisjunction([di], 10**7)

    params = pywrapcp.DefaultRoutingSearchParameters()
    params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PARALLEL_CHEAPEST_INSERTION
    params.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    params.time_limit.seconds = seconds
    sol = routing.SolveWithParameters(params)
    if not sol:
        return None
    total = 0
    for v in range(len(TRUCKS)):
        i = routing.Start(v)
        while not routing.IsEnd(i):
            j = sol.Value(routing.NextVar(i))
            total += dist[manager.IndexToNode(i)][manager.IndexToNode(j)]
            i = j
    dropped = sum(1 for k in range(routing.Size())
                  if not routing.IsStart(k) and not routing.IsEnd(k) and sol.Value(routing.NextVar(k)) == k)
    return total / 10, dropped // 2


if __name__ == "__main__":
    for hc in (True, False):
        s = Settings(handling_counts=hc)
        dp = optimize(settings=s)
        ort = solve_with_ortools(s)
        if ort is None:
            print(f"handling_counts={hc}: DP = {dp.total_km} km | OR-Tools nije našao rješenje")
            continue
        print(f"handling_counts={hc}: DP = {dp.total_km} km ({dp.orders_done} naloga) | "
              f"OR-Tools = {ort[0]} km (izostavljeno naloga: {ort[1]})")
