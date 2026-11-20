import { ArrowDownToLine, ArrowUpFromLine, ChevronDown, ChevronRight, Flag, Home } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
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
function LoadChart({ t, color, H = 150 }: { t: TruckPlan; color: string; H?: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const P = { l: 44, r: 12, t: 14, b: 22 };
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

/**
 * Kartica kamiona. `compact`: za prikaz dviju kartica jedna uz drugu – bez oznaka u zaglavlju
 * (te brojke su u usporedbi kamiona), niži graf, a tablica radnji otvara se na klik.
 */
export function TruckCard({ t, index, compact = false }: { t: TruckPlan; index: number; compact?: boolean }) {
  const color = truckColor(index);
  const [open, setOpen] = useState(!compact);
  useEffect(() => setOpen(!compact), [compact]);
  return (
    <Card className="overflow-hidden">
      <div className={cn("flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800",
        compact ? "px-4 py-3" : "px-5 py-4")}>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm"
            style={{ backgroundColor: color }}>{t.name.slice(-1)}</div>
          <div>
            <h3 className="font-semibold tracking-tight">{t.name}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {compact
                ? <>{km(t.km)} · {nalog(t.orders_done.length)} · {hhmm(t.total_min)} h</>
                : <>nosivost {kg(t.capacity_kg)} · max {t.max_machines} stroja</>}
            </p>
          </div>
        </div>
        {!compact && <div className="flex flex-wrap gap-2">
          <Badge tone="indigo">{km(t.km)}</Badge>
          <Badge>{nalog(t.orders_done.length)}</Badge>
          <Badge>vožnja {hhmm(t.drive_min)} + radnje {hhmm(t.handling_min)} = {hhmm(t.total_min)} h</Badge>
          <Badge tone={t.peak_load_kg / t.capacity_kg > 0.95 ? "amber" : "slate"}>vrh tereta {kg(t.peak_load_kg)}</Badge>
        </div>}
      </div>

      {t.orders_done.length === 0 ? (
        <p className="p-5 text-sm text-slate-500">Kamion nije potreban – ostaje u bazi.</p>
      ) : (
        <div className={cn(compact ? "space-y-4 p-4" : "space-y-5 p-5")}>
          {!compact && <div className="flex flex-wrap items-center gap-1">
            {t.route.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3.5 text-slate-300 dark:text-slate-600" />}
                <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold",
                  c === "L0" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-slate-100 dark:bg-slate-800")}>
                  {c}
                </span>
              </span>
            ))}
          </div>}

          <div>
            <div className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">Teret nakon svake radnje</div>
            <LoadChart t={t} color={color} H={compact ? 120 : 150} />
          </div>

          {compact && (
            <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/50">
              <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
              {open ? "Sakrij radnje" : `Prikaži radnje (${t.steps.length})`}
            </button>
          )}

          {open && <div className={cn("overflow-x-auto", compact ? "-mx-4" : "-mx-5")}>
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50/60 text-left text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/30 dark:text-slate-400">
                  {(compact
                    ? ["#", "Lok.", "Radnja", "Nalog", "Ukupno", "Teret", "Str.", "Vrijeme"]
                    : ["#", "Lokacija", "Radnja", "Nalog", "Stroj", "Dionica", "Ukupno", "Teret nakon radnje", "Strojeva", "Vrijeme"]
                  ).map((h) => (
                    <th key={h} className={cn("py-2 font-medium", compact ? "px-2 first:pl-4 last:pr-4" : "px-3 first:pl-5 last:pr-5")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {t.steps.map((s) => {
                  const k = KIND[s.kind];
                  const td = compact ? "px-2 py-1.5" : "px-3 py-2";
                  return (
                    <tr key={s.seq} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30">
                      <td className={cn(td, compact ? "pl-4" : "pl-5", "text-slate-400 tabular")}>{s.seq}</td>
                      <td className={cn(td, "font-medium")}>{s.location}</td>
                      <td className={td} title={compact ? `${k.label}${s.machine ? ` ${s.machine} (${kg(s.weight_kg ?? 0)})` : ""}` : undefined}>
                        <span className={cn("inline-flex items-center gap-1.5 font-medium", k.cls)}>
                          {k.icon}{compact ? (s.kind === "pickup" ? "Utovar" : s.kind === "delivery" ? "Istovar" : k.label) : k.label}
                        </span>
                      </td>
                      <td className={td}>{s.order ?? ""}</td>
                      {!compact && <td className={td}>{s.machine ? <>{s.machine} <span className="text-slate-400">({kg(s.weight_kg ?? 0)})</span></> : ""}</td>}
                      {!compact && <td className={cn(td, "text-right tabular")}>{km(s.leg_km)}</td>}
                      <td className={cn(td, "text-right tabular")}>{km(s.cum_km)}</td>
                      <td className={td}>
                        {compact ? <span className="tabular">{kg(s.load_kg)}</span> : (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                              <div className="h-full rounded-full" style={{ width: `${(s.load_kg / t.capacity_kg) * 100}%`, backgroundColor: color }} />
                            </div>
                            <span className="tabular">{kg(s.load_kg)}</span>
                          </div>
                        )}
                      </td>
                      <td className={cn(td, "text-center tabular")}>{s.machines_on_board} / {t.max_machines}</td>
                      <td className={cn(td, compact ? "pr-4" : "pr-5", "tabular")}>{hhmm(s.elapsed_min)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>}
        </div>
      )}
    </Card>
  );
}
