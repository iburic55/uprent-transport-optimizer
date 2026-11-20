import { ArrowDownToLine, ArrowUpFromLine, ChevronRight, Flag, Home } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cn, hhmm, kg, km, nalog, truckColor } from "../lib/format";
import type { StepKind, TruckPlan } from "../lib/types";
import { useWidth } from "../lib/useWidth";
import { Badge, Card } from "./ui";

const KIND: Record<StepKind, { label: string; icon: ReactNode; cls: string }> = {
  start: { label: "Polazak", icon: <Flag className="size-3.5" />, cls: "text-slate-500" },
  pickup: { label: "Preuzimanje", icon: <ArrowUpFromLine className="size-3.5" />, cls: "text-emerald-600 dark:text-emerald-400" },
  delivery: { label: "Isporuka", icon: <ArrowDownToLine className="size-3.5" />, cls: "text-sky-600 dark:text-sky-400" },
  return: { label: "Povratak", icon: <Home className="size-3.5" />, cls: "text-slate-500" },
};

/** Teret nakon svake radnje (stepenasti graf) s crtom nosivosti. */
function LoadChart({ t, color }: { t: TruckPlan; color: string }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const H = 150, P = { l: 44, r: 12, t: 14, b: 22 };
  const n = t.steps.length - 1;
  const x = (i: number) => P.l + (n ? (i / n) * (W - P.l - P.r) : 0);
  const y = (v: number) => P.t + (1 - v / t.capacity_kg) * (H - P.t - P.b);
  let d = `M${x(0)},${y(0)}`;
  t.steps.forEach((s, i) => { if (i) d += ` H${x(i)} V${y(s.load_kg)}`; });
  const area = `${d} H${x(n)} V${y(0)} Z`;
  const gid = `g-${t.name.replace(/\W/g, "")}`;
  return (
    <div ref={ref}>
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label={`Teret kamiona ${t.name} po koracima`}>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={P.l} x2={W - P.r} y1={y(f * t.capacity_kg)} y2={y(f * t.capacity_kg)}
            className={f === 1 ? "stroke-rose-400" : "stroke-slate-200 dark:stroke-slate-700"}
            strokeDasharray={f === 1 ? "4 3" : undefined} />
          <text x={P.l - 6} y={y(f * t.capacity_kg) + 3} textAnchor="end" className="fill-slate-400 text-[11px]">
            {f === 1 ? "max" : `${Math.round((f * t.capacity_kg) / 1000)} t`}
          </text>
        </g>
      ))}
      <motion.path d={area} fill={`url(#${gid})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
      <motion.path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: "easeOut" }} />
      {t.steps.map((s, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(s.load_kg)} r="3" fill={color} className="stroke-white dark:stroke-slate-900" strokeWidth="1.5">
            <title>{`${i}. ${s.location} – ${KIND[s.kind].label}${s.machine ? " " + s.machine : ""}: ${kg(s.load_kg)}`}</title>
          </circle>
          <text x={x(i)} y={H - 6} textAnchor="middle" className="fill-slate-400 text-[10px]">{s.location}</text>
        </g>
      ))}
    </svg>
    </div>
  );
}

export function TruckCard({ t, index }: { t: TruckPlan; index: number }) {
  const color = truckColor(index);
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm"
            style={{ backgroundColor: color }}>{t.name.slice(-1)}</div>
          <div>
            <h3 className="font-semibold tracking-tight">{t.name}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              nosivost {kg(t.capacity_kg)} · max {t.max_machines} stroja
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="indigo">{km(t.km)}</Badge>
          <Badge>{nalog(t.orders_done.length)}</Badge>
          <Badge>vožnja {hhmm(t.drive_min)} + radnje {hhmm(t.handling_min)} = {hhmm(t.total_min)} h</Badge>
          <Badge tone={t.peak_load_kg / t.capacity_kg > 0.95 ? "amber" : "slate"}>vrh tereta {kg(t.peak_load_kg)}</Badge>
        </div>
      </div>

      {t.orders_done.length === 0 ? (
        <p className="p-5 text-sm text-slate-500">Kamion nije potreban – ostaje u bazi.</p>
      ) : (
        <div className="space-y-5 p-5">
          <div className="flex flex-wrap items-center gap-1">
            {t.route.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3.5 text-slate-300 dark:text-slate-600" />}
                <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold",
                  c === "L0" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-slate-100 dark:bg-slate-800")}>
                  {c}
                </span>
              </span>
            ))}
          </div>

          <div>
            <div className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">Teret nakon svake radnje</div>
            <LoadChart t={t} color={color} />
          </div>

          <div className="-mx-5 overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50/60 text-left text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/30 dark:text-slate-400">
                  {["#", "Lokacija", "Radnja", "Nalog", "Stroj", "Dionica", "Ukupno", "Teret nakon radnje", "Strojeva", "Vrijeme"].map((h) => (
                    <th key={h} className="px-3 py-2 font-medium first:pl-5 last:pr-5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {t.steps.map((s) => {
                  const k = KIND[s.kind];
                  return (
                    <tr key={s.seq} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30">
                      <td className="px-3 py-2 pl-5 text-slate-400 tabular">{s.seq}</td>
                      <td className="px-3 py-2 font-medium">{s.location}</td>
                      <td className="px-3 py-2"><span className={cn("inline-flex items-center gap-1.5 font-medium", k.cls)}>{k.icon}{k.label}</span></td>
                      <td className="px-3 py-2">{s.order ?? ""}</td>
                      <td className="px-3 py-2">{s.machine ? <>{s.machine} <span className="text-slate-400">({kg(s.weight_kg ?? 0)})</span></> : ""}</td>
                      <td className="px-3 py-2 text-right tabular">{km(s.leg_km)}</td>
                      <td className="px-3 py-2 text-right tabular">{km(s.cum_km)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div className="h-full rounded-full" style={{ width: `${(s.load_kg / t.capacity_kg) * 100}%`, backgroundColor: color }} />
                          </div>
                          <span className="tabular">{kg(s.load_kg)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center tabular">{s.machines_on_board} / {t.max_machines}</td>
                      <td className="px-3 py-2 pr-5 tabular">{hhmm(s.elapsed_min)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}
