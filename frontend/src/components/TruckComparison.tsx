import { Columns2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn, hhmm, kg, km, truckColor } from "../lib/format";
import type { Settings, TruckPlan } from "../lib/types";
import { Card, CardHeader } from "./ui";

/** Vodoravna traka: udio od 0 do 1 (preko 1 se boji crveno). */
function Bar({ value, color, mark }: { value: number; color: string; mark?: number }) {
  const over = value > 1 + 1e-9;
  return (
    <div className="relative mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
      <div className="h-full rounded-full" style={{ width: `${Math.min(1, value) * 100}%`, backgroundColor: over ? "#f43f5e" : color }} />
      {mark !== undefined && (
        <div className="absolute top-0 bottom-0 border-l-2 border-rose-500" style={{ left: `${mark * 100}%` }} />
      )}
    </div>
  );
}

type Row = { label: string; hint?: string; cell: (t: TruckPlan, i: number) => ReactNode };

/** Kamioni jedan uz drugoga: isti redak = ista mjera, pa se razlike vide odmah. */
export function TruckComparison({ trucks, settings }: { trucks: TruckPlan[]; settings: Settings }) {
  const limit = settings.max_hours * 60;
  const maxKm = Math.max(1, ...trucks.map((t) => t.km));
  const rows: Row[] = [
    {
      label: "Kilometri",
      cell: (t, i) => (
        <>
          <span className="text-base font-semibold tabular sm:text-lg">{km(t.km)}</span>
          <Bar value={t.km / maxKm} color={truckColor(i)} />
        </>
      ),
    },
    {
      label: "Nalozi",
      cell: (t) => (
        <div className="flex flex-wrap gap-1">
          {t.orders_done.length === 0
            ? <span className="text-sm text-slate-400">ostaje u bazi</span>
            : t.orders_done.map((o) => (
              <span key={o} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-semibold tabular dark:bg-slate-800">{o}</span>
            ))}
        </div>
      ),
    },
    {
      label: "Radno vrijeme",
      hint: settings.handling_counts ? `od ${settings.max_hours} h` : `samo vožnja, od ${settings.max_hours} h`,
      cell: (t, i) => (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-base font-semibold tabular sm:text-lg">{hhmm(t.limit_used_min)} h</span>
            <span className="text-xs text-slate-500 tabular dark:text-slate-400">{Math.round(t.utilization * 100)} %</span>
          </div>
          <Bar value={t.limit_used_min / limit} color={truckColor(i)} />
          <div className="mt-1 text-xs text-slate-500 tabular dark:text-slate-400">
            vožnja {hhmm(t.drive_min)} + radnje {hhmm(t.handling_min)}
          </div>
        </>
      ),
    },
    {
      label: "Vrh tereta",
      hint: "od nosivosti",
      cell: (t, i) => (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <span className="font-semibold whitespace-nowrap tabular">{kg(t.peak_load_kg)}</span>
            <span className="text-xs whitespace-nowrap text-slate-500 tabular dark:text-slate-400">/ {kg(t.capacity_kg)}</span>
          </div>
          <Bar value={t.peak_load_kg / t.capacity_kg} color={truckColor(i)} />
        </>
      ),
    },
    {
      label: "Ruta",
      cell: (t) => (
        <div className="text-xs leading-relaxed font-medium text-slate-600 dark:text-slate-300">
          {t.route.join(" → ")}
        </div>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader icon={<Columns2 className="size-4" />} title="Usporedba kamiona"
        subtitle="Ista mjera u istom retku; trake pokazuju udio od najdulje rute, limita i nosivosti" />
      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-24 sm:w-40" />
            {trucks.map((t) => <col key={t.name} />)}
          </colgroup>
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800">
              <th />
              {trucks.map((t, i) => (
                <th key={t.name} className="px-3 py-3 text-left sm:px-4">
                  <div className="flex items-center gap-2">
                    <span className="hidden size-7 shrink-0 items-center sm:flex justify-center rounded-lg text-xs font-bold text-white"
                      style={{ backgroundColor: truckColor(i) }}>{t.name.slice(-1)}</span>
                    <div>
                      <div className="font-semibold">{t.name}</div>
                      <div className="text-xs font-normal text-slate-500 dark:text-slate-400">
                        {kg(t.capacity_kg)} · max {t.max_machines} stroja
                      </div>
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r) => (
              <tr key={r.label} className="align-top">
                <th scope="row" className="py-3 pr-2 pl-4 text-left font-medium sm:px-5 text-slate-600 dark:text-slate-300">
                  {r.label}
                  {r.hint && <div className="text-xs font-normal text-slate-400">{r.hint}</div>}
                </th>
                {trucks.map((t, i) => (
                  <td key={t.name} className={cn("px-3 py-3 sm:px-4", i < trucks.length - 1 && "border-r border-slate-100 dark:border-slate-800")}>
                    {r.cell(t, i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
