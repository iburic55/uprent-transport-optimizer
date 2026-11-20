import { CheckCircle2, Package, Route } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { hhmm, km, nalog, truckColor } from "../lib/format";
import type { Plan, Settings } from "../lib/types";
import { Card, Progress } from "./ui";

function Kpi({ label, value, hint, icon, accent, children }: {
  label: string; value: ReactNode; hint?: ReactNode; icon: ReactNode; accent?: string; children?: ReactNode;
}) {
  return (
    <Card className="relative overflow-hidden p-5">
      {accent && <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: accent }} />}
      <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
        <span className="font-medium">{label}</span>
        <span className="text-slate-400">{icon}</span>
      </div>
      <motion.div
        key={String(value)}
        initial={{ opacity: 0.4, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-2 text-3xl font-semibold tracking-tight tabular"
      >
        {value}
      </motion.div>
      {hint && <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{hint}</div>}
      {children}
    </Card>
  );
}

export function KpiCards({ plan, settings, freeKm }: { plan: Plan; settings: Settings; freeKm?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi label="Ukupna kilometraža" value={km(plan.total_km)} icon={<Route className="size-4" />}
        hint={freeKm !== undefined && freeKm < plan.total_km
          ? <>teoretski minimum {km(freeKm)}</>
          : plan.optimal ? "dokazani optimum" : "heuristički raspored"} />
      <Kpi label="Izvršeni nalozi" icon={plan.orders_done === plan.orders_total
          ? <CheckCircle2 className="size-4 text-emerald-500" /> : <Package className="size-4" />}
        value={<>{plan.orders_done}<span className="text-slate-400"> / {plan.orders_total}</span></>}
        hint={plan.unassigned.length ? `${nalog(plan.unassigned.length)} neizvršivo` : "svi nalozi raspoređeni"} />
      {plan.trucks.slice(0, 2).map((t, i) => (
        <Kpi key={t.name} label={t.name} value={km(t.km)} accent={truckColor(i)}
          icon={<span className="size-2.5 rounded-full" style={{ backgroundColor: truckColor(i) }} />}
          hint={<>{nalog(t.orders_done.length)} · {hhmm(t.total_min)} h rada</>}>
          <div className="mt-3 flex items-center gap-2">
            <Progress value={t.utilization} color={t.utilization > 1 ? "#f43f5e" : truckColor(i)} />
            <span className="shrink-0 text-xs text-slate-500 tabular dark:text-slate-400">
              {Math.round(t.utilization * 100)} % od {settings.max_hours} h
            </span>
          </div>
        </Kpi>
      ))}
    </div>
  );
}
