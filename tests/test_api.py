"""Testovi REST API-ja (isti poslovni rezultati kao i optimizator)."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)


@pytest.fixture(scope="module")
def defaults():
    r = client.get("/api/defaults")
    assert r.status_code == 200
    return r.json()


def test_zadani_podaci_daju_optimum_i_objasnjenje_zamke(defaults):
    body = client.post("/api/optimize", json=defaults).json()
    plan = body["plan"]
    assert body["problems"] == []
    assert plan["total_km"] == pytest.approx(200.1)
    assert plan["orders_done"] == 10 and plan["valid"] and plan["optimal"]
    ins = body["insight"]
    assert ins["free_km"] == pytest.approx(182.2) and ins["delta_km"] == pytest.approx(17.9)
    assert ins["moved"] == [{"order": "N03", "truck": "Kamion A"}]
    assert [s["total_km"] for s in body["scenarios"]] == [200.1, 182.2, 182.2]


def test_vremenska_crta_odgovara_trajanju_i_teret_nosivosti(defaults):
    plan = client.post("/api/optimize", json=defaults).json()["plan"]
    for t in plan["trucks"]:
        if t["timeline"]:
            assert t["timeline"][-1]["end"] == pytest.approx(t["total_min"], abs=0.01)
        assert all(0 <= s["load_kg"] <= t["capacity_kg"] for s in t["steps"])
        assert t["route"][0] == t["route"][-1] == "L0"


def test_neispravan_ulaz_vraca_poruke_a_ne_gresku(defaults):
    bad = {**defaults, "orders": defaults["orders"] + [
        {"code": "N01", "machine": "M01", "pickup": "L1", "delivery": "L2"},
        {"code": "N20", "machine": "MX", "pickup": "L1", "delivery": "L2"}]}
    body = client.post("/api/optimize", json=bad).json()
    assert body["plan"] is None
    text = " ".join(body["problems"])
    assert "„N01” pojavljuje se više puta" in text and "nepoznat stroj „MX”" in text


def test_kratak_limit_jasno_vraca_neizvrsive_naloge(defaults):
    req = {**defaults, "settings": {**defaults["settings"], "max_hours": 4}}
    body = client.post("/api/optimize", json=req).json()
    assert [u["order"] for u in body["plan"]["unassigned"]] == ["N06", "N08", "N10"]
    assert body["insight"] is None


def test_neispravne_postavke_odbija_validacija(defaults):
    req = {**defaults, "settings": {**defaults["settings"], "speed_kmh": 0}}
    assert client.post("/api/optimize", json=req).status_code == 422
