"""Ulazni podaci zadatka (zadani primjer UP Rent)."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Truck:
    name: str
    capacity_kg: int
    max_machines: int


@dataclass(frozen=True)
class Location:
    code: str
    x: float
    y: float
    label: str = ""


@dataclass(frozen=True)
class Order:
    code: str
    machine: str
    weight_kg: int
    pickup: str
    delivery: str


@dataclass(frozen=True)
class Settings:
    max_hours: float = 9.0          # dnevno ograničenje rada vozača
    handling_min: float = 20.0      # trajanje jednog utovara ili istovara
    speed_kmh: float = 60.0         # prosječna brzina
    # True  -> u 9 h ulazi vožnja + utovar/istovar (konzervativno, zadano)
    # False -> 9 h se odnosi samo na vožnju
    handling_counts: bool = True
    base: str = "L0"


TRUCKS = [
    Truck("Kamion A", 3_500, 2),
    Truck("Kamion B", 10_000, 3),
]

MACHINES = {
    "M01": 800,
    "M02": 1_300,
    "M03": 1_800,
    "M04": 2_400,
    "M05": 3_100,
    "M06": 3_900,
    "M07": 4_800,
    "M08": 6_100,
    "M09": 7_500,
    "M10": 9_400,
}

LOCATIONS = [
    Location("L0", 0, 0, "Baza"),
    Location("L1", 3, 8),
    Location("L2", 10, 11),
    Location("L3", 17, 9),
    Location("L4", 9, -6),
    Location("L5", 26, 3),
    Location("L6", -7, 13),
    Location("L7", 20, -8),
    Location("L8", 23, 15),
    Location("L9", -8, -5),
]

_ORDERS_RAW = [
    ("N01", "M01", "L1", "L3"),
    ("N02", "M02", "L2", "L5"),
    ("N03", "M03", "L9", "L4"),
    ("N04", "M04", "L3", "L0"),
    ("N05", "M05", "L0", "L8"),
    ("N06", "M06", "L5", "L7"),
    ("N07", "M07", "L8", "L2"),
    ("N08", "M08", "L4", "L9"),
    ("N09", "M09", "L6", "L1"),
    ("N10", "M10", "L7", "L3"),
]

ORDERS = [Order(c, m, MACHINES[m], p, d) for c, m, p, d in _ORDERS_RAW]
