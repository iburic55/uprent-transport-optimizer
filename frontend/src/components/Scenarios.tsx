import { Scale } from "lucide-react";
import { motion } from "motion/react";
import { cn, hhmm, km, nalog, truckColor } from "../lib/format";
import type { Scenario, Settings } from "../lib/types";
import { Badge, Card, CardHeader } from "./ui";

export function Scenarios({ scenarios, settings }: { scenarios: Scenario[]; settings: Settings }) {
  const maxKm = Math.max(...scenarios.map((s) => s.total_km), 1);
  const limit = settings.max_hours * 60;
  const active = settings.handling_counts ? "strict" : "drive";
  return (
    <Card>
      <CardHeader icon={<Scale className="size-4" />} title="Usporedba scenarija"
        subtitle="Kako tumačenje dnevnog limita mijenja optimalni raspored (isti ulazni podaci)" />
      <div className="grid gap-4 p-5 lg:grid-cols-3">
        {scenarios.map((s) => {
          // prekoračenje prema tumačenju limita koje vrijedi za taj scenarij
          const counts = s.key === "strict" || (s.key === "free" && settings.handling_counts);
          const used = (t: Scenario["trucks"][number]) => (counts ? t.total_min : t.drive_min);
          const over = s.trucks.some((t) => used(t) > limit + 1e-6);
          return (
            <div key={s.key} className={cn("rounded-2xl border p-4",
              s.key === active ? "border-indigo-300 ring-2 ring-indigo-500/20 dark:border-indigo-500/50" : "border-slate-200 dark:border-slate-800")}>
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-medium">{s.label}</div>
                {s.key === active && <Badge tone="indigo">aktivno</Badge>}
                {over && <Badge tone="red" className="whitespace-nowrap">krši {settings.max_hours} h</Badge>}
              </div>
              <div className="mt-3 text-3xl font-semibold tracking-tight tabular">{km(s.total_km)}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">{nalog(s.orders_done)}</div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <motion.div className="h-full rounded-full bg-indigo-500" initial={{ width: 0 }}
                  animate={{ width: `${(s.total_km / maxKm) * 100}%` }} />
              </div>
              <div className="mt-4 space-y-2">
                {s.trucks.map((t, i) => (
                  <div key={t.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ backgroundColor: truckColor(i) }} />{t.name}
                    </span>
                    <span className="text-slate-500 tabular dark:text-slate-400">
                      {km(t.km)} · <span className={cn(used(t) > limit + 1e-6 && "font-semibold text-rose-600 dark:text-rose-400")}>{hhmm(t.total_min)} h</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
