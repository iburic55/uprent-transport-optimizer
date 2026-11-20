import { Clock, Gauge, RotateCcw, SlidersHorizontal, Timer } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { Settings } from "../lib/types";
import { Button, Card, CardHeader, Switch } from "./ui";

function Field({
  id,
  icon,
  label,
  value,
  unit,
  min,
  max,
  step,
  onChange,
}: {
  id: string;
  icon: ReactNode;
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  // Polje drži vlastiti tekst: dok se tipka (npr. obriše „9” pa upiše „4”), privremeno
  // prazna ili nepotpuna vrijednost ne smije vratiti staru brojku.
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText((t) => (Number(t.replace(",", ".")) === value ? t : String(value)));
  }, [value]);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          <span className="text-slate-400">{icon}</span>
          {label}
        </label>
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
          <input
            aria-label={`${label} (vrijednost)`}
            inputMode="decimal"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              const v = Number(e.target.value.replace(",", "."));
              if (e.target.value.trim() !== "" && Number.isFinite(v) && v >= min && v <= max) onChange(v);
            }}
            onBlur={() => {
              // izvan raspona -> najbliža dopuštena vrijednost; nečitljivo -> zadnja ispravna
              const v = Number(text.replace(",", "."));
              const next = text.trim() !== "" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : value;
              if (next !== value) onChange(next);
              setText(String(next));
            }}
            className="w-12 bg-transparent text-right text-sm font-semibold tabular outline-none"
          />
          <span className="text-xs text-slate-500">{unit}</span>
        </div>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

export function SettingsPanel({
  settings,
  onChange,
  onReset,
  dirty,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onReset: () => void;
  dirty: boolean;
}) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });
  return (
    <Card>
      <CardHeader icon={<SlidersHorizontal className="size-4" />} title="Postavke" subtitle="Izračun se osvježava odmah" />
      <div className="space-y-5 p-5">
        <Field id="max-hours" icon={<Clock className="size-4" />} label="Radno vrijeme vozača" unit="h"
          value={settings.max_hours} min={1} max={24} step={0.5} onChange={(v) => set("max_hours", v)} />
        <Field id="handling" icon={<Timer className="size-4" />} label="Utovar / istovar" unit="min"
          value={settings.handling_min} min={0} max={60} step={5} onChange={(v) => set("handling_min", v)} />
        <Field id="speed" icon={<Gauge className="size-4" />} label="Prosječna brzina" unit="km/h"
          value={settings.speed_kmh} min={10} max={120} step={5} onChange={(v) => set("speed_kmh", v)} />
        <div className="flex items-start justify-between gap-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
          <label htmlFor="handling-counts" className="text-sm">
            <span className="font-medium">U radno vrijeme se broji utovar/istovar</span>
            {settings.handling_counts ? (
              <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                Uključeno (zadano): u {settings.max_hours} h se broji vožnja + utovar/istovar.
              </span>
            ) : (
              <span className="mt-0.5 block text-xs text-amber-700 dark:text-amber-400">
                Isključeno: u {settings.max_hours} h se broji samo vožnja. Pazi: vozač tada
                stvarno radi dulje od {settings.max_hours} h.
              </span>
            )}
          </label>
          <Switch id="handling-counts" label="U radno vrijeme se broji utovar/istovar" checked={settings.handling_counts}
            onChange={(v) => set("handling_counts", v)} />
        </div>
        <Button className="w-full" onClick={onReset} disabled={!dirty}>
          <RotateCcw className="size-4" /> Vrati zadane podatke
        </Button>
      </div>
    </Card>
  );
}
