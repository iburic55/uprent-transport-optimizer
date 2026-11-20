"""UP Rent – optimizacija prijevoza radnih strojeva (Streamlit web aplikacija).

Pokretanje:  streamlit run app.py
"""
from __future__ import annotations

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from optimizer import LOCATIONS, MACHINES, ORDERS, TRUCKS, Location, Order, Settings, Truck, check_inputs, optimize, validate_plan
from optimizer.solver import DELIVERY, PICKUP, RETURN, START

st.set_page_config(page_title="UP Rent – optimizacija prijevoza", page_icon="🚚", layout="wide")

TRUCK_COLORS = ["#1f77b4", "#d62728", "#2ca02c", "#9467bd"]


def nalog(n: int) -> str:
    return f"{n} nalog" if n % 10 == 1 and n % 100 != 11 else f"{n} naloga"


def route_text(steps) -> str:
    """Redoslijed lokacija bez ponavljanja iste lokacije za redom."""
    seq = [s.location for s in steps]
    return " → ".join(c for i, c in enumerate(seq) if i == 0 or c != seq[i - 1])


def hhmm(minutes: float) -> str:
    m = int(round(minutes))
    return f"{m // 60}:{m % 60:02d}"


# ------------------------------------------------------------------ stanje (uređivi podaci)
def default_frames():
    return {
        "trucks": pd.DataFrame([{"Vozilo": t.name, "Nosivost (kg)": t.capacity_kg,
                                 "Max strojeva": t.max_machines} for t in TRUCKS]),
        "machines": pd.DataFrame([{"Stroj": k, "Težina (kg)": v} for k, v in MACHINES.items()]),
        "locations": pd.DataFrame([{"Lokacija": l.code, "Naziv": l.label, "X (km)": l.x,
                                    "Y (km)": l.y} for l in LOCATIONS]),
        "orders": pd.DataFrame([{"Nalog": o.code, "Stroj": o.machine, "Preuzimanje": o.pickup,
                                 "Isporuka": o.delivery} for o in ORDERS]),
    }


if "data" not in st.session_state:
    st.session_state.data = default_frames()

# ------------------------------------------------------------------ bočna traka
with st.sidebar:
    st.header("Postavke")
    max_hours = st.number_input("Maksimalno radno vrijeme vozača (h/dan)", 1.0, 24.0, 9.0, 0.5)
    handling = st.number_input("Utovar ili istovar (min po radnji)", 0.0, 120.0, 20.0, 5.0)
    speed = st.number_input("Prosječna brzina (km/h)", 10.0, 120.0, 60.0, 5.0)
    handling_counts = st.toggle(
        "Utovar/istovar ulazi u dnevni limit", value=True,
        help="Uključeno (zadano, konzervativno): vožnja + utovar/istovar ≤ limit. "
             "Isključeno: limit se odnosi samo na vrijeme vožnje.")
    st.divider()
    if st.button("↺ Vrati zadane podatke", width="stretch"):
        st.session_state.data = default_frames()
        st.rerun()
    st.caption("Algoritam: egzaktno dinamičko programiranje po kamionu + optimalna dodjela "
               "naloga. Rezultat je dokazano optimalan za zadane podatke.")

settings = Settings(max_hours=max_hours, handling_min=handling, speed_kmh=speed,
                    handling_counts=handling_counts)

st.title("🚚 UP Rent – optimizacija prijevoza radnih strojeva")
st.caption("Raspoređuje transportne naloge na kamione, određuje redoslijed preuzimanja i "
           "isporuka te minimizira ukupnu kilometražu uz poštivanje nosivosti, broja strojeva "
           "i radnog vremena. Oba kamiona polaze iz baze (L0) i vraćaju se u nju.")

tab_in, tab_out, tab_map, tab_cmp = st.tabs(
    ["📋 Ulazni podaci", "✅ Raspored", "🗺️ Karta", "⚖️ Usporedba scenarija"])

# ------------------------------------------------------------------ ulazni podaci
with tab_in:
    d = st.session_state.data
    st.info("Podaci se mogu mijenjati izravno u tablicama; raspored se odmah ponovno izračunava.")
    c1, c2 = st.columns(2)
    with c1:
        st.subheader("1. Vozni park")
        d["trucks"] = st.data_editor(d["trucks"], hide_index=True, width="stretch",
                                     num_rows="dynamic", key="ed_trucks")
        st.subheader("2. Vrste strojeva")
        d["machines"] = st.data_editor(d["machines"], hide_index=True, width="stretch",
                                       num_rows="dynamic", key="ed_machines")
    with c2:
        st.subheader("3. Lokacije")
        d["locations"] = st.data_editor(d["locations"], hide_index=True,
                                        width="stretch", num_rows="dynamic",
                                        key="ed_locations")
        st.subheader("4. Transportni nalozi")
        loc_codes = list(d["locations"]["Lokacija"].dropna())
        d["orders"] = st.data_editor(
            d["orders"], hide_index=True, width="stretch", num_rows="dynamic",
            key="ed_orders",
            column_config={
                "Stroj": st.column_config.SelectboxColumn(
                    options=list(d["machines"]["Stroj"].dropna())),
                "Preuzimanje": st.column_config.SelectboxColumn(options=loc_codes),
                "Isporuka": st.column_config.SelectboxColumn(options=loc_codes),
            })
        weights = dict(zip(d["machines"]["Stroj"], d["machines"]["Težina (kg)"]))
        preview = d["orders"].copy()
        preview["Težina (kg)"] = preview["Stroj"].map(weights)
        st.caption("Nalozi s težinom stroja")
        st.dataframe(preview, hide_index=True, width="stretch")


# ------------------------------------------------------------------ pretvorba u model
def build_model():
    d = st.session_state.data
    problems: list[str] = []
    try:
        trucks = [Truck(str(r["Vozilo"]), int(r["Nosivost (kg)"]), int(r["Max strojeva"]))
                  for _, r in d["trucks"].dropna().iterrows()]
        machines = [str(m) for m in d["machines"].dropna()["Stroj"]]
        for m in sorted({m for m in machines if machines.count(m) > 1}):
            problems.append(f"Oznaka stroja „{m}” pojavljuje se više puta.")
        weights = {str(r["Stroj"]): int(r["Težina (kg)"])
                   for _, r in d["machines"].dropna().iterrows()}
        locations = [Location(str(r["Lokacija"]), float(r["X (km)"]), float(r["Y (km)"]),
                              "" if pd.isna(r["Naziv"]) else str(r["Naziv"])) for _, r in
                     d["locations"].dropna(subset=["Lokacija", "X (km)", "Y (km)"]).iterrows()]
    except (TypeError, ValueError) as e:
        return [], [], [], [f"Neispravna vrijednost u ulaznim tablicama: {e}"]
    orders = []
    for _, r in d["orders"].dropna(subset=["Nalog"]).iterrows():
        m = str(r["Stroj"])
        if m not in weights:
            problems.append(f"Nalog {r['Nalog']}: nepoznat stroj „{m}”.")
            continue
        orders.append(Order(str(r["Nalog"]), m, weights[m], str(r["Preuzimanje"]),
                            str(r["Isporuka"])))
    problems += check_inputs(trucks, locations, orders, settings.base)
    return trucks, locations, orders, problems


@st.cache_data(show_spinner="Računam optimalni raspored…")
def run(trucks, locations, orders, s):
    return optimize(orders=list(orders), trucks=list(trucks), locations=list(locations),
                    settings=s)


trucks, locations, orders, problems = build_model()
plan = None
if problems:
    for p in problems:
        st.error(p)
else:
    try:
        plan = run(tuple(trucks), tuple(locations), tuple(orders), settings)
    except ValueError as e:
        st.error(str(e))

# ------------------------------------------------------------------ rezultat
with tab_out:
    if plan is None:
        st.warning("Raspored nije izračunat – ispravite ulazne podatke.")
    else:
        errors = validate_plan(plan, orders, locations)
        m = st.columns(2 + len(plan.trucks))
        m[0].metric("Ukupna kilometraža", f"{plan.total_km:.1f} km")
        m[1].metric("Izvršeni nalozi", f"{plan.orders_done} / {len(orders)}")
        for i, tp in enumerate(plan.trucks):
            m[2 + i].metric(tp.truck.name, f"{tp.km:.1f} km",
                            f"{nalog(len(tp.orders_done))} · {hhmm(tp.total_min)} h",
                            delta_color="off", delta_arrow="off")

        if errors:
            st.error("Nezavisna provjera plana NIJE prošla:\n\n- " + "\n- ".join(errors))
        else:
            st.success("Nezavisna provjera: sva ograničenja su zadovoljena (nosivost, broj "
                       "strojeva, preuzimanje prije isporuke istim kamionom, povratak u bazu, "
                       "radno vrijeme).")

        if plan.unassigned:
            st.error(f"⚠️ {nalog(len(plan.unassigned))} NIJE moguće izvršiti:")
            for o, r in plan.unassigned:
                st.markdown(f"- **{o.code}** – {o.machine} ({o.weight_kg:,} kg), {o.pickup} → {o.delivery}: {r}")

        for i, tp in enumerate(plan.trucks):
            limit_used = tp.total_min if settings.handling_counts else tp.drive_min
            st.subheader(f"{tp.truck.name}  ·  {tp.km:.1f} km  ·  "
                         f"{nalog(len(tp.orders_done))}")
            st.caption(f"Nosivost {tp.truck.capacity_kg:,} kg, max {tp.truck.max_machines} stroja · "
                       f"vožnja {hhmm(tp.drive_min)} h + utovar/istovar {hhmm(tp.handling_min)} h "
                       f"= {hhmm(tp.total_min)} h · iskorištenost limita "
                       f"{limit_used / (settings.max_hours * 60):.0%}")
            if not tp.actions:
                st.info("Kamion nije potreban – ostaje u bazi.")
                continue
            st.markdown("**Redoslijed:** " + route_text(tp.steps))
            rows = []
            for s in tp.steps:
                icon = {PICKUP: "⬆️", DELIVERY: "⬇️", START: "🏁", RETURN: "🏠"}[s.action]
                rows.append({
                    "#": s.seq, "Lokacija": s.location, "Radnja": f"{icon} {s.action}",
                    "Nalog": s.order or "", "Stroj": s.machine or "",
                    "Dionica (km)": s.leg_km, "Ukupno (km)": s.cum_km,
                    "Teret nakon radnje (kg)": s.load_kg,
                    "Strojeva na kamionu": s.machines_on_board,
                    "Vrijeme od polaska": hhmm(s.elapsed_min),
                })
            st.dataframe(
                pd.DataFrame(rows), hide_index=True, width="stretch",
                column_config={
                    "Teret nakon radnje (kg)": st.column_config.ProgressColumn(
                        min_value=0, max_value=tp.truck.capacity_kg, format="%d kg"),
                    "Dionica (km)": st.column_config.NumberColumn(format="%.1f"),
                    "Ukupno (km)": st.column_config.NumberColumn(format="%.1f"),
                })

# ------------------------------------------------------------------ karta
with tab_map:
    if plan is not None:
        loc = {l.code: l for l in locations}
        fig = go.Figure()
        for i, tp in enumerate(plan.trucks):
            if not tp.actions:
                continue
            color = TRUCK_COLORS[i % len(TRUCK_COLORS)]
            xs = [loc[s.location].x for s in tp.steps]
            ys = [loc[s.location].y for s in tp.steps]
            fig.add_trace(go.Scatter(x=xs, y=ys, mode="lines+markers", name=tp.truck.name,
                                     line=dict(color=color, width=3), marker=dict(size=6)))
            for a, b in zip(tp.steps, tp.steps[1:]):
                if a.location == b.location:
                    continue
                fig.add_annotation(x=loc[b.location].x, y=loc[b.location].y,
                                   ax=loc[a.location].x, ay=loc[a.location].y,
                                   xref="x", yref="y", axref="x", ayref="y",
                                   showarrow=True, arrowhead=3, arrowsize=1.4,
                                   arrowwidth=2, arrowcolor=color, opacity=0.8, text="")
        fig.add_trace(go.Scatter(
            x=[l.x for l in locations], y=[l.y for l in locations], mode="markers+text",
            text=[f"{l.code} {l.label}".strip() for l in locations], textposition="top center",
            marker=dict(size=[18 if l.code == settings.base else 12 for l in locations],
                        color=["black" if l.code == settings.base else "white"
                               for l in locations],
                        line=dict(color="black", width=2)),
            name="Lokacije", hoverinfo="text"))
        fig.update_layout(height=650, xaxis_title="X (km)", yaxis_title="Y (km)",
                          yaxis=dict(scaleanchor="x", scaleratio=1),
                          legend=dict(orientation="h", y=1.05))
        st.plotly_chart(fig, width="stretch")
        st.caption("Strelice prikazuju smjer vožnje; ravne linije jer su udaljenosti euklidske.")

# ------------------------------------------------------------------ usporedba
with tab_cmp:
    if plan is not None:
        st.markdown(
            "Kako tumačenje ograničenja mijenja optimalni raspored (isti ulazni podaci):")
        scenarios = [
            ("Vožnja + utovar/istovar ≤ limit (zadano)", Settings(
                max_hours=max_hours, handling_min=handling, speed_kmh=speed, handling_counts=True)),
            ("Samo vožnja ≤ limit", Settings(
                max_hours=max_hours, handling_min=handling, speed_kmh=speed, handling_counts=False)),
            ("Bez vremenskog ograničenja (teoretski minimum km)", Settings(
                max_hours=24, handling_min=handling, speed_kmh=speed, handling_counts=False)),
        ]
        rows, results = [], []
        for name, sc in scenarios:
            p = run(tuple(trucks), tuple(locations), tuple(orders), sc)
            results.append(p)
            row = {"Scenarij": name, "Ukupno km": p.total_km,
                   "Izvršeno naloga": p.orders_done}
            for tp in p.trucks:
                row[tp.truck.name] = (f"{tp.km:.1f} km, {nalog(len(tp.orders_done))}, "
                                      f"{hhmm(tp.total_min)} h")
            rows.append(row)
        st.dataframe(pd.DataFrame(rows), hide_index=True, width="stretch")
        strict, free = results[0], results[2]
        if free.total_km < strict.total_km and free.orders_done == strict.orders_done:
            longest = max(free.trucks, key=lambda t: t.total_min)
            st.info(
                f"Teoretski minimum je {free.total_km:.1f} km, ali tada {longest.truck.name} "
                f"radi {hhmm(longest.total_min)} h (vožnja + utovar/istovar). Uz ograničenje od "
                f"{max_hours:g} h rada optimizator dio naloga prebacuje na drugi kamion: "
                f"{strict.total_km:.1f} km (+{strict.total_km - free.total_km:.1f} km), "
                f"a svi vozači završavaju unutar radnog vremena.")
