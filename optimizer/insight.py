"""Objašnjenje „zamke” zadatka: zašto raspored nije teoretski najkraći.

Najkraći raspored bez vremenskog ograničenja (za zadane podatke 182,2 km) može prekoračiti
dnevno radno vrijeme. Ova funkcija usporedi stvarni raspored s tim teoretskim minimumom i
vrati podatke za objašnjenje (koristi ih i Streamlit i React sučelje).
"""
from __future__ import annotations

from dataclasses import dataclass, replace

from .data import Settings
from .solver import Plan

UNLIMITED_H = 10_000.0   # praktično bez vremenskog ograničenja


def unlimited_settings(s: Settings) -> Settings:
    """Iste postavke, ali bez limita radnog vremena (teoretski minimum km)."""
    return replace(s, max_hours=UNLIMITED_H, handling_counts=False)


@dataclass(frozen=True)
class TimeLimitInsight:
    free_km: float               # teoretski minimum bez limita
    plan_km: float               # stvarni raspored
    longest_truck: str           # kamion koji bi bez limita radio najdulje
    longest_min: float           # njegovo vrijeme (prema tumačenju limita)
    limit_h: float
    handling_counts: bool
    moved: tuple[tuple[str, str], ...]   # (nalog, kamion u stvarnom rasporedu)

    @property
    def delta_km(self) -> float:
        return round(self.plan_km - self.free_km, 1)


def time_limit_insight(plan: Plan, free_plan: Plan) -> TimeLimitInsight | None:
    """Vrati objašnjenje ako je raspored zbog limita dulji od teoretskog minimuma uz isti
    broj izvršenih naloga; inače None (npr. kad limit ne utječe na rezultat)."""
    if not (free_plan.total_km < plan.total_km and free_plan.orders_done == plan.orders_done):
        return None
    s = plan.settings

    def used(t) -> float:
        return t.total_min if s.handling_counts else t.drive_min

    longest = max(free_plan.trucks, key=used)
    owner = {c: tp.truck.name for tp in plan.trucks for c in tp.orders_done}
    moved = tuple(sorted((c, owner[c]) for tp in free_plan.trucks for c in tp.orders_done
                         if c in owner and owner[c] != tp.truck.name))
    return TimeLimitInsight(free_plan.total_km, plan.total_km, longest.truck.name,
                            used(longest), s.max_hours, s.handling_counts, moved)
