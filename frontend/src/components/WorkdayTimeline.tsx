import { CalendarClock } from "lucide-react";
import { hhmm, km, truckColor } from "../lib/format";
import type { Segment, Settings, TruckPlan } from "../lib/types";
import { Card, CardHeader } from "./ui";

const KIND_STYLE: Record<Segment["kind"], string> = {
  drive: "",
  pickup: "bg-emerald-500",
  delivery: "bg-sky-500",
};

function label(s: Segment) {
  if (s.kind === "drive") return `Vožnja ${s.from} → ${s.to}`;
  return `${s.kind === "pickup" ? "Utovar" : "Istovar"} ${s.machine} (${s.order}) na ${s.at}`;
}

/** Radni dan svih kamiona na zajedničkoj vremenskoj osi, s crtom dnevnog limita. */
export function WorkdayTimeline({ trucks, settings }: { trucks: TruckPlan[]; settings: Settings }) {
  const limit = settings.max_hours * 60;
  const longest = Math.max(0, ...trucks.map((t) => t.total_min));
  const span = Math.max(60, Math.max(limit, longest) * 1.08);   // malo prostora iza limita
  const hours = Math.floor(span / 60);
  const pct = (m: number) => `${(m / span) * 100}%`;

  return (
    <Card>
      <CardHeader
        icon={<CalendarClock className="size-4" />}
        title="Radni dan"
        subtitle={settings.handling_counts
          ? "Vožnja i svaki utovar/istovar ulaze u dnevni limit"
          : "Limit se odnosi samo na vožnju (utovar/istovar prikazan, ali se ne broji)"}
        right={
          <div className="hidden items-center gap-3 text-xs text-slate-500 sm:flex dark:text-slate-400">
            <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-slate-400" />Vožnja</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-emerald-500" />Utovar</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-sky-500" />Istovar</span>
          </div>
        }
      />
      <div className="p-5 pt-8">
        <div className="relative">
          {/* mreža sati i crta limita preko svih redaka */}
          <div className="pointer-events-none absolute top-0 right-0 bottom-0 left-24 sm:left-36">
            {Array.from({ length: hours + 1 }, (_, h) => (
              <div key={h} className="absolute top-0 bottom-0 border-l border-slate-100 dark:border-slate-800" style={{ left: pct(h * 60) }}>
                <span className={`absolute -top-5 -translate-x-1/2 text-[11px] whitespace-nowrap text-slate-400 tabular ${h % 2 ? "max-sm:hidden" : ""}`}>{h} h</span>
              </div>
            ))}
            <div className="absolute top-0 bottom-0 z-10 border-l-2 border-dashed border-rose-500" style={{ left: pct(limit) }}>
              <span className="absolute -bottom-6 -translate-x-1/2 rounded bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap text-white">
                limit {settings.max_hours} h
              </span>
            </div>
          </div>
          <div className="relative space-y-3 pb-6">
          {trucks.map((t, i) => (
            <div key={t.name} className="flex items-center gap-0">
              <div className="w-24 shrink-0 pr-2 whitespace-nowrap sm:w-36 sm:pr-3">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <span className="size-2 rounded-full" style={{ backgroundColor: truckColor(i) }} />
                  {t.name}
                </div>
                <div className="text-xs text-slate-500 tabular dark:text-slate-400">{hhmm(t.total_min)} h<span className="max-sm:hidden"> · {km(t.km)}</span></div>
              </div>
              <div className="relative h-9 flex-1 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                {t.timeline.length === 0 && (
                  <span className="absolute inset-0 flex items-center px-3 text-xs text-slate-400">ostaje u bazi</span>
                )}
                {t.timeline.map((s, k) => (
                  <div
                    key={k}
                    className={`group absolute top-1.5 bottom-1.5 rounded-[5px] ring-1 ring-white/60 transition-[filter] hover:brightness-110 dark:ring-slate-900/60 ${KIND_STYLE[s.kind]}`}
                    style={{
                      left: pct(s.start),
                      width: `max(2px, ${pct(s.end - s.start)})`,
                      backgroundColor: s.kind === "drive" ? truckColor(i) : undefined,
                      opacity: s.kind === "drive" ? 0.85 : 1,
                    }}
                  >
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lg group-hover:block dark:bg-slate-700">
                      <div className="font-medium">{label(s)}</div>
                      <div className="text-slate-300 tabular">{hhmm(s.start)} – {hhmm(s.end)} h</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
