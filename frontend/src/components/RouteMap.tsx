import { Map as MapIcon, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { hhmm, kg, km, truckColor } from "../lib/format";
import type { Loc, TruckPlan } from "../lib/types";
import { Button, Card, CardHeader } from "./ui";

type Pt = { x: number; y: number };

/** Položaj i aktivnost kamiona u trenutku t (minute od polaska). */
function stateAt(t: TruckPlan, time: number, pos: Record<string, Pt>, base: string) {
  let at: Pt = pos[base];
  let activity = "u bazi";
  for (const s of t.timeline) {
    if (time < s.start) break;
    if (s.kind === "drive") {
      const a = pos[s.from!], b = pos[s.to!];
      const f = Math.min(1, (time - s.start) / (s.end - s.start || 1));
      at = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      activity = time < s.end ? `vožnja ${s.from} → ${s.to}` : `na ${s.to}`;
    } else {
      at = pos[s.at!];
      activity = time < s.end
        ? `${s.kind === "pickup" ? "utovar" : "istovar"} ${s.machine} na ${s.at}`
        : `na ${s.at}`;
    }
  }
  const done = t.timeline.length > 0 && time >= t.timeline[t.timeline.length - 1].end;
  if (done) activity = "završio, u bazi";
  let load = 0;
  for (const st of t.steps) if (st.kind !== "start" && st.elapsed_min <= time + 1e-6) load = st.load_kg;
  return { at, activity, load };
}

export function RouteMap({ trucks, locations, base = "L0" }: { trucks: TruckPlan[]; locations: Loc[]; base?: string }) {
  const pos = useMemo(() => Object.fromEntries(locations.map((l) => [l.code, { x: l.x, y: l.y }])), [locations]);
  const end = Math.max(1, ...trucks.map((t) => t.total_min));
  const [time, setTime] = useState(end);
  const [playing, setPlaying] = useState(false);
  const raf = useRef<number | null>(null);

  // nova ruta -> prikaži završno stanje
  useEffect(() => { setTime(end); setPlaying(false); }, [end]);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setTime((t) => {
        const next = t + (dt / 14000) * end; // cijeli dan u ~14 s
        if (next >= end) { setPlaying(false); return end; }
        return next;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [playing, end]);

  // geometrija: km -> SVG (y prema gore)
  const xs = locations.map((l) => l.x), ys = locations.map((l) => l.y);
  const pad = 3;
  const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
  const S = 24; // px po km
  const W = (maxX - minX) * S, H = (maxY - minY) * S;
  const sx = (x: number) => (x - minX) * S;
  const sy = (y: number) => (maxY - y) * S;

  const legs = (t: TruckPlan) => {
    const r = t.route;
    return r.slice(1).map((c, i) => [r[i], c] as const).filter(([a, b]) => a !== b);
  };
  // pomak okomito na smjer da se rute dvaju kamiona po istoj dionici ne preklapaju
  const offset = (i: number) => (trucks.length > 1 ? (i - (trucks.length - 1) / 2) * 0.45 : 0);
  const shifted = (a: Pt, b: Pt, o: number) => {
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    return [{ x: a.x + nx * o, y: a.y + ny * o }, { x: b.x + nx * o, y: b.y + ny * o }];
  };

  const states = trucks.map((t) => stateAt(t, time, pos, base));
  const grid: number[] = [];
  for (let v = Math.ceil(minX / 5) * 5; v <= maxX; v += 5) grid.push(v);
  const gridY: number[] = [];
  for (let v = Math.ceil(minY / 5) * 5; v <= maxY; v += 5) gridY.push(v);

  return (
    <Card>
      <CardHeader
        icon={<MapIcon className="size-4" />}
        title="Karta ruta"
        subtitle="Simulirane lokacije (X/Y u km), euklidske udaljenosti"
        right={
          <div className="flex items-center gap-2">
            <Button size="icon" variant="secondary" aria-label="Ispočetka" onClick={() => { setTime(0); setPlaying(true); }}>
              <RotateCcw className="size-4" />
            </Button>
            <Button variant="primary" onClick={() => { if (time >= end) setTime(0); setPlaying((p) => !p); }}>
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
              {playing ? "Pauza" : "Pokreni vožnju"}
            </Button>
          </div>
        }
      />
      <div className="grid gap-5 p-5 lg:grid-cols-[1fr_260px]">
        <div className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/40">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Karta ruta kamiona">
            {grid.map((v) => (
              <g key={`x${v}`}>
                <line x1={sx(v)} x2={sx(v)} y1={0} y2={H} className="stroke-slate-200/70 dark:stroke-slate-800" />
                <text x={sx(v) + 3} y={H - 4} className="fill-slate-400 text-[12px]">{v}</text>
              </g>
            ))}
            {gridY.map((v) => (
              <g key={`y${v}`}>
                <line x1={0} x2={W} y1={sy(v)} y2={sy(v)} className="stroke-slate-200/70 dark:stroke-slate-800" />
                <text x={4} y={sy(v) - 4} className="fill-slate-400 text-[12px]">{v}</text>
              </g>
            ))}

            {trucks.map((t, i) => {
              const drives = t.timeline.filter((s) => s.kind === "drive");
              return legs(t).map(([a, b], k) => {
              const [p, q] = shifted(pos[a], pos[b], offset(i));
              const driven = !drives[k] || time > drives[k].start;   // prijeđena ili u tijeku
              const mx = (sx(p.x) + sx(q.x)) / 2, my = (sy(p.y) + sy(q.y)) / 2;
              const ang = (Math.atan2(sy(q.y) - sy(p.y), sx(q.x) - sx(p.x)) * 180) / Math.PI;
              return (
                <g key={`${i}-${k}`}>
                  <line x1={sx(p.x)} y1={sy(p.y)} x2={sx(q.x)} y2={sy(q.y)} stroke={truckColor(i)}
                    strokeWidth="3" strokeLinecap="round" opacity={driven ? 0.9 : 0.18}
                    strokeDasharray={driven ? undefined : "6 6"} className="transition-opacity duration-300" />
                  <path d="M-5,-4 L5,0 L-5,4 Z" fill={truckColor(i)} opacity={driven ? 1 : 0.25}
                    transform={`translate(${mx},${my}) rotate(${ang})`} />
                </g>
              );
              });
            })}

            {locations.map((l) => {
              const isBase = l.code === base;
              return (
                <g key={l.code} transform={`translate(${sx(l.x)},${sy(l.y)})`}>
                  {isBase ? (
                    <rect x="-9" y="-9" width="18" height="18" rx="5" className="fill-slate-900 dark:fill-slate-100" />
                  ) : (
                    <circle r="7" className="fill-white stroke-slate-700 dark:fill-slate-900 dark:stroke-slate-300" strokeWidth="2" />
                  )}
                  <text y="-15" textAnchor="middle" className="fill-slate-700 text-[14px] font-semibold dark:fill-slate-200">
                    {l.code}{l.label ? ` · ${l.label}` : ""}
                  </text>
                  <title>{`${l.code} (${l.x}, ${l.y})`}</title>
                </g>
              );
            })}

            {trucks.map((t, i) => t.timeline.length > 0 && (
              <g key={t.name} transform={`translate(${sx(states[i].at.x)},${sy(states[i].at.y)})`}>
                <circle r="13" fill={truckColor(i)} opacity="0.2" />
                <circle r="9" fill={truckColor(i)} className="stroke-white dark:stroke-slate-900" strokeWidth="2" />
                <text y="4" textAnchor="middle" className="fill-white text-[11px] font-bold">{t.name.slice(-1)}</text>
              </g>
            ))}
          </svg>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl bg-slate-900 p-4 text-white dark:bg-slate-800">
            <div className="text-xs text-slate-400">Vrijeme od polaska</div>
            <div className="text-3xl font-semibold tabular">{hhmm(time)} h</div>
            <input type="range" min={0} max={end} step={0.5} value={time} aria-label="Vrijeme simulacije"
              onChange={(e) => { setPlaying(false); setTime(Number(e.target.value)); }} className="mt-3 w-full" />
          </div>
          {trucks.map((t, i) => (
            <div key={t.name} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: truckColor(i) }} />{t.name}
                </span>
                <span className="text-xs text-slate-500 tabular">{km(t.km)}</span>
              </div>
              <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {t.timeline.length ? states[i].activity : "ostaje u bazi"}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-full rounded-full transition-[width] duration-150"
                    style={{ width: `${(states[i].load / t.capacity_kg) * 100}%`, backgroundColor: truckColor(i) }} />
                </div>
                <span className="text-xs text-slate-500 tabular">{kg(states[i].load)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
