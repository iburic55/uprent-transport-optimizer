import { ArrowRight, Lightbulb } from "lucide-react";
import { motion } from "motion/react";
import { hhmm, km } from "../lib/format";
import type { Insight } from "../lib/types";
import { Card } from "./ui";

function Bar({ label, value, max, text, tone }: { label: string; value: number; max: number; text: string; tone: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-600 dark:text-slate-400">
        <span>{label}</span>
        <span className="font-semibold tabular text-slate-900 dark:text-slate-100">{text}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/70 dark:bg-slate-800">
        <motion.div className={`h-full rounded-full ${tone}`} initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, (value / max) * 100)}%` }} transition={{ duration: 0.7, ease: "easeOut" }} />
      </div>
    </div>
  );
}

/** „Zamka” zadatka: zašto raspored nije teoretski najkraći. */
export function InsightCard({ insight }: { insight: Insight }) {
  const limitMin = insight.limit_h * 60;
  const maxMin = Math.max(limitMin, insight.longest_min) * 1.05;
  const maxKm = insight.plan_km * 1.05;
  return (
    <Card className="overflow-hidden border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white dark:border-amber-500/30 dark:from-amber-500/10 dark:via-slate-900/60 dark:to-slate-900/60">
      <div className="grid gap-6 p-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
            <Lightbulb className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold tracking-tight">Zašto ne {km(insight.free_km)}?</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Najkraći raspored bez vremenskog ograničenja ima <b>{km(insight.free_km)}</b>, ali tada{" "}
              {insight.longest_truck} radi <b className="text-rose-600 dark:text-rose-400">{hhmm(insight.longest_min)} h</b>{" "}
              ({insight.handling_counts ? "vožnja + utovar/istovar" : "vožnja"}), a dopušteno je {insight.limit_h} h.
              Optimizator zato premješta naloge i plaća <b>+{km(insight.delta_km)}</b> da svi vozači završe na vrijeme.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {insight.moved.map((m) => (
                <span key={m.order} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-medium shadow-sm ring-1 ring-amber-200 dark:bg-slate-900 dark:ring-amber-500/30">
                  {m.order} <ArrowRight className="size-3 text-slate-400" /> {m.truck}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-3 self-center">
          <Bar label="Radno vrijeme bez limita" value={insight.longest_min} max={maxMin}
            text={`${hhmm(insight.longest_min)} / ${hhmm(limitMin)} h`} tone="bg-rose-500" />
          <Bar label="Teoretski minimum" value={insight.free_km} max={maxKm} text={km(insight.free_km)} tone="bg-slate-400" />
          <Bar label="Odabrani raspored (unutar limita)" value={insight.plan_km} max={maxKm} text={km(insight.plan_km)} tone="bg-emerald-500" />
        </div>
      </div>
    </Card>
  );
}
