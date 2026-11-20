import { Boxes, MapPin, Plus, Trash2, Truck as TruckIcon, ClipboardList } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { kg } from "../lib/format";
import type { Loc, Machine, OrderIn, Problem, Truck } from "../lib/types";
import { Button, Card, CardHeader } from "./ui";

/** Brojčana ćelija s lokalnim tekstom: dopušta međustanja poput "-" ili "1," pri tipkanju. */
function NumberCell({ value, onCommit, className, label }: {
  value: number; onCommit: (v: number) => void; className: string; label: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number(text.replace(",", ".")) !== value) setText(String(value));
  }, [value]);
  return (
    <input aria-label={label} inputMode="decimal" value={text} className={className}
      onChange={(e) => {
        setText(e.target.value);
        const v = Number(e.target.value.replace(",", "."));
        if (e.target.value.trim() !== "" && Number.isFinite(v)) onCommit(v);
      }}
      onBlur={() => setText(String(value))} />
  );
}

type Col<T> = {
  key: keyof T & string;
  label: string;
  type: "text" | "number" | "select";
  options?: string[];
  width?: string;
};

function EditableTable<T extends Record<string, unknown>>({
  rows, cols, onChange, newRow, extra,
}: {
  rows: T[];
  cols: Col<T>[];
  onChange: (rows: T[]) => void;
  newRow: () => T;
  extra?: (row: T) => ReactNode;
}) {
  const update = (i: number, key: keyof T, value: string | number) =>
    onChange(rows.map((r, k) => (k === i ? { ...r, [key]: value } : r)));
  const cell = "w-full rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm outline-none transition-colors hover:border-slate-200 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:hover:border-slate-700 dark:focus:bg-slate-900";
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
              {cols.map((c) => (
                <th key={c.key} className={`px-2 pb-2 font-medium ${c.type === "number" ? "text-right" : ""}`} style={{ width: c.width }}>{c.label}</th>
              ))}
              {extra && <th className="px-2 pb-2 font-medium">Težina</th>}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="group border-t border-slate-100 dark:border-slate-800">
                {cols.map((c) => (
                  <td key={c.key} className="px-0.5 py-0.5">
                    {c.type === "select" ? (
                      <select aria-label={`${c.label} (redak ${i + 1})`} value={String(r[c.key] ?? "")}
                        onChange={(e) => update(i, c.key, e.target.value)} className={cell}>
                        {!c.options?.includes(String(r[c.key])) && <option value={String(r[c.key])}>{String(r[c.key]) || "—"}</option>}
                        {c.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : c.type === "number" ? (
                      <NumberCell label={`${c.label} (redak ${i + 1})`} value={Number(r[c.key] ?? 0)}
                        onCommit={(v) => update(i, c.key, v)} className={`${cell} text-right tabular`} />
                    ) : (
                      <input aria-label={`${c.label} (redak ${i + 1})`} value={String(r[c.key] ?? "")}
                        onChange={(e) => update(i, c.key, e.target.value)} className={cell} />
                    )}
                  </td>
                ))}
                {extra && <td className="px-2 text-slate-500 tabular">{extra(r)}</td>}
                <td className="px-1 text-right">
                  <button aria-label={`Obriši redak ${i + 1}`} onClick={() => onChange(rows.filter((_, k) => k !== i))}
                    className="rounded-lg p-1.5 text-slate-400 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 focus:opacity-100 dark:hover:bg-rose-500/10">
                    <Trash2 className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button size="sm" variant="ghost" className="mt-2" onClick={() => onChange([...rows, newRow()])}>
        <Plus className="size-3.5" /> Dodaj redak
      </Button>
    </div>
  );
}

function nextCode(prefix: string, existing: string[], width = 2) {
  let n = existing.length + 1;
  const code = () => `${prefix}${String(n).padStart(width, "0")}`;
  while (existing.includes(code())) n++;
  return code();
}

export function InputEditor({ problem, onChange }: { problem: Problem; onChange: (p: Problem) => void }) {
  const set = <K extends keyof Problem>(k: K) => (v: Problem[K]) => onChange({ ...problem, [k]: v });
  const machineCodes = problem.machines.map((m) => m.code);
  const locCodes = problem.locations.map((l) => l.code);
  const weights = Object.fromEntries(problem.machines.map((m) => [m.code, m.weight_kg]));

  return (
    <div className="grid items-start gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader icon={<TruckIcon className="size-4" />} title="Vozni park" subtitle="Svi kamioni polaze iz baze L0 i vraćaju se u nju" />
        <div className="p-5 pt-3">
          <EditableTable<Truck> rows={problem.trucks} onChange={set("trucks")}
            newRow={() => ({ name: `Kamion ${String.fromCharCode(65 + problem.trucks.length)}`, capacity_kg: 5000, max_machines: 2 })}
            cols={[
              { key: "name", label: "Vozilo", type: "text" },
              { key: "capacity_kg", label: "Nosivost (kg)", type: "number", width: "9rem" },
              { key: "max_machines", label: "Max strojeva", type: "number", width: "8rem" },
            ]} />
        </div>
      </Card>
      <Card>
        <CardHeader icon={<Boxes className="size-4" />} title="Vrste strojeva" />
        <div className="p-5 pt-3">
          <EditableTable<Machine> rows={problem.machines} onChange={set("machines")}
            newRow={() => ({ code: nextCode("M", machineCodes), weight_kg: 1000 })}
            cols={[
              { key: "code", label: "Stroj", type: "text" },
              { key: "weight_kg", label: "Težina (kg)", type: "number", width: "9rem" },
            ]} />
        </div>
      </Card>
      <Card>
        <CardHeader icon={<MapPin className="size-4" />} title="Lokacije" subtitle="Koordinate u km; udaljenost je euklidska, zaokružena na 0,1 km po dionici" />
        <div className="p-5 pt-3">
          <EditableTable<Loc> rows={problem.locations} onChange={set("locations")}
            newRow={() => ({ code: nextCode("L", locCodes, 1), x: 0, y: 0, label: "" })}
            cols={[
              { key: "code", label: "Lokacija", type: "text", width: "6rem" },
              { key: "label", label: "Naziv", type: "text" },
              { key: "x", label: "X (km)", type: "number", width: "6rem" },
              { key: "y", label: "Y (km)", type: "number", width: "6rem" },
            ]} />
        </div>
      </Card>
      <Card>
        <CardHeader icon={<ClipboardList className="size-4" />} title="Transportni nalozi" />
        <div className="p-5 pt-3">
          <EditableTable<OrderIn> rows={problem.orders} onChange={set("orders")}
            newRow={() => ({ code: nextCode("N", problem.orders.map((o) => o.code)), machine: machineCodes[0] ?? "", pickup: locCodes[1] ?? "", delivery: locCodes[2] ?? "" })}
            extra={(o) => (weights[o.machine] !== undefined ? kg(weights[o.machine]) : "—")}
            cols={[
              { key: "code", label: "Nalog", type: "text", width: "5rem" },
              { key: "machine", label: "Stroj", type: "select", options: machineCodes },
              { key: "pickup", label: "Preuzimanje", type: "select", options: locCodes },
              { key: "delivery", label: "Isporuka", type: "select", options: locCodes },
            ]} />
        </div>
      </Card>
    </div>
  );
}
