"""Ispis optimalnog rasporeda u terminalu:  python -m optimizer"""
from . import LOCATIONS, ORDERS, Settings, optimize, validate_plan


def main() -> None:
    plan = optimize(settings=Settings())
    for tp in plan.trucks:
        print(f"\n=== {tp.truck.name}: {tp.km:.1f} km, {len(tp.orders_done)} naloga, "
              f"{tp.total_min / 60:.2f} h ===")
        for s in tp.steps:
            what = f"{s.action:<12} {s.order or '':<4} {s.machine or '':<4}"
            print(f"{s.seq:>2}. {s.location:<3} {what} +{s.leg_km:>5.1f} km = {s.cum_km:>6.1f} km"
                  f" | teret {s.load_kg:>6} kg, strojeva {s.machines_on_board}")
    print(f"\nUKUPNO: {plan.total_km:.1f} km, izvršeno {plan.orders_done}/{len(ORDERS)} naloga")
    for o, r in plan.unassigned:
        print(f"NEIZVRŠIVO {o.code}: {r}")
    errors = validate_plan(plan, ORDERS, LOCATIONS)
    print("Provjera ograničenja:", "OK" if not errors else errors)


if __name__ == "__main__":
    main()
