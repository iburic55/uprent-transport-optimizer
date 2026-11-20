"""Testovi poslovnih ograničenja.

Pokretanje:  pytest -v
"""
from __future__ import annotations

import itertools
import sys
from dataclasses import replace
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from optimizer import LOCATIONS, ORDERS, TRUCKS, Order, Settings, Truck, optimize, validate_plan  # noqa: E402
from optimizer.solver import DELIVERY, PICKUP, build_truck_plan, leg_km  # noqa: E402

LOC = {l.code: l for l in LOCATIONS}
BY_CODE = {o.code: o for o in ORDERS}


@pytest.fixture(scope="module")
def plan():
    return optimize()


# ----------------------------------------------------------------- osnovni rezultat
def test_zadani_primjer_je_ispravan_i_potpun(plan):
    assert validate_plan(plan, ORDERS, LOCATIONS) == []
    assert plan.orders_done == 10
    assert plan.unassigned == []
    assert plan.total_km == pytest.approx(200.1)


def test_udaljenost_je_euklidska_zaokruzena_na_decimalu():
    assert leg_km(LOC["L0"], LOC["L1"]) == 8.5     # sqrt(73) = 8.544
    assert leg_km(LOC["L5"], LOC["L7"]) == 12.5    # sqrt(157) = 12.530
    assert leg_km(LOC["L0"], LOC["L0"]) == 0.0


# ----------------------------------------------------------------- nosivost i broj strojeva
def test_nosivost_i_broj_strojeva_nikad_nisu_prekoraceni(plan):
    for tp in plan.trucks:
        for step in tp.steps:
            assert 0 <= step.load_kg <= tp.truck.capacity_kg, (tp.truck.name, step)
            assert 0 <= step.machines_on_board <= tp.truck.max_machines, (tp.truck.name, step)


def test_teski_strojevi_ne_idu_kamionom_a(plan):
    truck_a = next(t for t in plan.trucks if t.truck.name == "Kamion A")
    heavy = {o.code for o in ORDERS if o.weight_kg > 3_500}  # N06..N10
    assert heavy.isdisjoint(truck_a.orders_done)


def test_m10_putuje_sam(plan):
    """M10 (9.400 kg) + bilo koji drugi stroj (>= 800 kg) > 10.000 kg."""
    for tp in plan.trucks:
        onboard = set()
        for step in tp.steps[1:-1]:
            if step.action == PICKUP:
                onboard.add(step.machine)
            else:
                onboard.discard(step.machine)
            if "M10" in onboard:
                assert onboard == {"M10"}, (tp.truck.name, step)


# ----------------------------------------------------------------- preuzimanje prije isporuke
def test_preuzimanje_prije_isporuke_istim_kamionom(plan):
    owner = {}
    for tp in plan.trucks:
        pos = {(c, a): i for i, (c, a) in enumerate(tp.actions)}
        for code in tp.orders_done:
            assert (code, PICKUP) in pos, f"{code} isporučen bez preuzimanja"
            assert pos[(code, PICKUP)] < pos[(code, DELIVERY)]
            assert code not in owner, f"{code} na dva kamiona"
            owner[code] = tp.truck.name
    assert len(owner) == plan.orders_done


def test_obavezan_povratak_u_bazu(plan):
    for tp in plan.trucks:
        assert tp.steps[0].location == "L0"
        assert tp.steps[-1].location == "L0"
        assert tp.steps[-1].load_kg == 0


# ----------------------------------------------------------------- radno vrijeme
def test_radno_vrijeme_9h_ukljucujuci_utovar(plan):
    for tp in plan.trucks:
        assert tp.total_min <= 9 * 60


def test_bez_limita_optimum_je_jedan_kamion_ali_prelazi_9h():
    """Bez vremenskog ograničenja najkraće je sve voziti kamionom B (182,2 km),
    ali to traje 9 h 42 min -> zato optimizator s limitom dijeli posao."""
    free = optimize(settings=Settings(max_hours=24))
    assert free.total_km == pytest.approx(182.2)
    assert max(t.total_min for t in free.trucks) > 9 * 60


def test_samo_voznja_u_limitu_daje_182_km():
    p = optimize(settings=Settings(handling_counts=False))
    assert validate_plan(p, ORDERS, LOCATIONS) == []
    assert p.total_km == pytest.approx(182.2)


# ----------------------------------------------------------------- neizvršivi nalozi
def test_kratko_radno_vrijeme_jasno_oznacava_neizvrsive_naloge():
    s = Settings(max_hours=3)
    p = optimize(settings=s)
    assert validate_plan(p, ORDERS, LOCATIONS) == []
    assert 0 < p.orders_done < 10
    assert len(p.unassigned) == 10 - p.orders_done
    assert all("vremena" in reason or "h" in reason for _, reason in p.unassigned)


def test_pretezak_stroj_se_odbija_s_razlogom():
    orders = ORDERS + [Order("N11", "M99", 12_000, "L1", "L2")]
    p = optimize(orders=orders)
    codes = {o.code: r for o, r in p.unassigned}
    assert "N11" in codes and "preteži" in codes["N11"]
    assert p.orders_done == 10
    assert validate_plan(p, orders, LOCATIONS) == []


# ----------------------------------------------------------------- validator hvata greške
def test_validator_hvata_prekoracenje_nosivosti():
    """Ručno složen loš plan: kamion A uzima M04 + M05 (5.500 kg > 3.500 kg)."""
    good = optimize()
    bad_a = build_truck_plan(
        TRUCKS[0],
        [("N05", PICKUP), ("N04", PICKUP), ("N04", DELIVERY), ("N05", DELIVERY)],
        BY_CODE, LOC, good.settings,
    )
    bad = replace(good, trucks=[bad_a, good.trucks[1]])
    errors = validate_plan(bad, ORDERS, LOCATIONS)
    assert any("nosivost" in e for e in errors)


def test_validator_hvata_isporuku_prije_preuzimanja():
    good = optimize()
    bad_a = build_truck_plan(TRUCKS[0], [("N03", DELIVERY), ("N03", PICKUP)],
                             BY_CODE, LOC, good.settings)
    bad = replace(good, trucks=[bad_a, good.trucks[1]])
    assert any("prije preuzimanja" in e for e in validate_plan(bad, ORDERS, LOCATIONS))


# ----------------------------------------------------------------- optimalnost
def _brute_force(truck: Truck, orders: list[Order]) -> float:
    """Isprobaj SVE redoslijede radnji (za mali broj naloga) i vrati najkraću rutu."""
    events = [(o, PICKUP) for o in orders] + [(o, DELIVERY) for o in orders]
    best = float("inf")
    for perm in itertools.permutations(events):
        onboard, load, ok = set(), 0, True
        here, km = "L0", 0.0
        for o, a in perm:
            if a == PICKUP:
                onboard.add(o.code); load += o.weight_kg; to = o.pickup
                if load > truck.capacity_kg or len(onboard) > truck.max_machines:
                    ok = False; break
            else:
                if o.code not in onboard:
                    ok = False; break
                onboard.discard(o.code); load -= o.weight_kg; to = o.delivery
            km += leg_km(LOC[here], LOC[to]); here = to
        if ok:
            best = min(best, round(km + leg_km(LOC[here], LOC["L0"]), 1))
    return best


@pytest.mark.parametrize("codes", [("N01", "N02", "N03", "N04"), ("N06", "N07", "N08", "N09")])
def test_dp_je_optimalan_kao_brute_force(codes):
    orders = [BY_CODE[c] for c in codes]
    truck = Truck("Kamion B", 10_000, 3)
    p = optimize(orders=orders, trucks=[truck], settings=Settings(max_hours=24))
    assert p.orders_done == len(orders)
    assert p.total_km == pytest.approx(_brute_force(truck, orders))
