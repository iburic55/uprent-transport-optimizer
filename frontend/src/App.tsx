import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, BookOpen, CalendarRange, CheckCircle2, Cpu, Database, Loader2, Map as MapIcon,
  Moon, Scale, ShieldAlert, Sun, Truck, XCircle,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { InputEditor } from "./components/InputEditor";
import { InsightCard } from "./components/InsightCard";
import { KpiCards } from "./components/KpiCards";
import { RouteMap } from "./components/RouteMap";
import { Scenarios } from "./components/Scenarios";
import { SettingsPanel } from "./components/SettingsPanel";
import { TruckCard } from "./components/TruckCard";
import { Alert, Badge, Button, Card, Tabs } from "./components/ui";
import { WorkdayTimeline } from "./components/WorkdayTimeline";
import { fetchDefaults, fetchPlan } from "./lib/api";
import { kg, nalog } from "./lib/format";
import type { Problem } from "./lib/types";
import { useDebounced } from "./lib/useDebounced";

type Tab = "schedule" | "map" | "scenarios" | "input";

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch { /* privatni način */ }
  }, [dark]);
  return [dark, setDark] as const;
}

export default function App() {
  const [dark, setDark] = useTheme();
  const [tab, setTab] = useState<Tab>("schedule");
  const defaults = useQuery({ queryKey: ["defaults"], queryFn: fetchDefaults, staleTime: Infinity });
  const [problem, setProblem] = useState<Problem | null>(null);
  useEffect(() => { if (defaults.data && !problem) setProblem(defaults.data); }, [defaults.data, problem]);

  const input = useDebounced(problem, 300);
  const result = useQuery({
    queryKey: ["plan", input],
    queryFn: ({ signal }) => fetchPlan(input!, signal),
    enabled: !!input,
    placeholderData: keepPreviousData,
  });

  const data = result.data;
  const plan = data?.plan ?? null;
  const dirty = !!problem && JSON.stringify(problem) !== JSON.stringify(defaults.data);
  const busy = result.isFetching || problem !== input;
  const freeKm = data?.scenarios.find((s) => s.key === "free")?.total_km;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30">
              <Truck className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate font-semibold tracking-tight">UP Rent · Optimizacija prijevoza</div>
              <div className="hidden truncate text-xs text-slate-500 sm:block dark:text-slate-400">
                Raspored naloga na kamione uz minimalnu kilometražu
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AnimatePresence mode="wait">
              {busy ? (
                <motion.span key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Badge><Loader2 className="size-3 animate-spin" /> Računam…</Badge>
                </motion.span>
              ) : plan ? (
                <motion.span key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="hidden gap-2 sm:flex">
                  <Badge tone={plan.optimal ? "green" : "amber"}><Cpu className="size-3" />{plan.optimal ? "Dokazani optimum" : "Heuristika"}</Badge>
                  <Badge tone={plan.valid ? "green" : "red"}>
                    {plan.valid ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
                    {plan.valid ? "Ograničenja zadovoljena" : "Provjera nije prošla"}
                  </Badge>
                </motion.span>
              ) : null}
            </AnimatePresence>
            <a href="/docs" target="_blank" rel="noreferrer" title="API dokumentacija"
              className="hidden rounded-xl p-2 text-slate-500 hover:bg-slate-100 sm:block dark:hover:bg-slate-800">
              <BookOpen className="size-5" />
            </a>
            <Button size="icon" variant="ghost" aria-label={dark ? "Svijetla tema" : "Tamna tema"} onClick={() => setDark(!dark)}>
              {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1440px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="order-2 space-y-4 lg:order-none lg:sticky lg:top-22 lg:self-start">
          {problem ? (
            <SettingsPanel settings={problem.settings} dirty={dirty}
              onChange={(settings) => setProblem({ ...problem, settings })}
              onReset={() => defaults.data && setProblem(defaults.data)} />
          ) : (
            <Card className="h-80 animate-pulse" />
          )}
          <Card className="p-5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            <div className="mb-2 font-semibold text-slate-900 dark:text-slate-100">Kako radi</div>
            Egzaktno dinamičko programiranje po kamionu (stanje = status svakog naloga + lokacija)
            i optimalna podjela naloga između kamiona: najprije najviše izvršenih naloga, zatim
            najmanje km. Svaki raspored provjerava nezavisni validator.
          </Card>
        </aside>

        <div className="order-1 min-w-0 space-y-6 lg:order-none">
          {defaults.isError && (
            <Alert tone="red" icon={<XCircle className="size-5" />} title="API nije dostupan">
              Pokrenite backend: <code className="font-mono">uvicorn api.main:app</code> ({String(defaults.error)})
            </Alert>
          )}
          {result.isError && (
            <Alert tone="red" icon={<XCircle className="size-5" />} title="Izračun nije uspio">{String(result.error.message)}</Alert>
          )}
          {data && data.problems.length > 0 && (
            <Alert tone="red" icon={<ShieldAlert className="size-5" />} title="Ulazni podaci nisu ispravni – raspored nije izračunat">
              <ul className="list-disc pl-5">{data.problems.map((p) => <li key={p}>{p}</li>)}</ul>
            </Alert>
          )}

          {plan && problem ? (
            <>
              <KpiCards plan={plan} settings={problem.settings} freeKm={freeKm} />
              {data?.insight && <InsightCard insight={data.insight} />}
              {!plan.optimal && (
                <Alert tone="amber" icon={<AlertTriangle className="size-5" />} title="Heuristički raspored – nije dokazano optimalan">
                  Neki kamion ima više od 12 mogućih naloga, što je previše za egzaktni algoritam.
                  Korišteno je najjeftinije umetanje + lokalna pretraga; sva ograničenja su i dalje provjerena.
                </Alert>
              )}
              {plan.unassigned.length > 0 && (
                <Alert tone="red" icon={<AlertTriangle className="size-5" />} title={`${nalog(plan.unassigned.length)} nije moguće izvršiti`}>
                  <ul className="mt-1 space-y-1">
                    {plan.unassigned.map((u) => (
                      <li key={u.order}><b>{u.order}</b> – {u.machine} ({kg(u.weight_kg)}), {u.pickup} → {u.delivery}: {u.reason}</li>
                    ))}
                  </ul>
                </Alert>
              )}
              {!plan.valid && (
                <Alert tone="red" icon={<XCircle className="size-5" />} title="Nezavisna provjera plana NIJE prošla">
                  <ul className="list-disc pl-5">{plan.validation_errors.map((e) => <li key={e}>{e}</li>)}</ul>
                </Alert>
              )}
            </>
          ) : !defaults.isError && !data?.problems.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((i) => <Card key={i} className="h-32 animate-pulse" />)}
            </div>
          ) : null}

          <Tabs<Tab> value={tab} onChange={setTab} tabs={[
            { value: "schedule", label: "Raspored", icon: <CalendarRange className="size-4" /> },
            { value: "map", label: "Karta", icon: <MapIcon className="size-4" /> },
            { value: "scenarios", label: "Scenariji", icon: <Scale className="size-4" /> },
            { value: "input", label: "Ulazni podaci", icon: <Database className="size-4" />, count: problem?.orders.length },
          ]} />

          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }} className="space-y-6">
              {tab === "input" && problem && <InputEditor problem={problem} onChange={setProblem} />}
              {tab !== "input" && !plan && data && (
                <Card className="p-8 text-center text-sm text-slate-500">Ispravite ulazne podatke da bi se raspored izračunao.</Card>
              )}
              {tab === "schedule" && plan && problem && (
                <>
                  <WorkdayTimeline trucks={plan.trucks} settings={problem.settings} />
                  {plan.trucks.map((t, i) => <TruckCard key={t.name} t={t} index={i} />)}
                </>
              )}
              {tab === "map" && plan && problem && <RouteMap trucks={plan.trucks} locations={problem.locations} />}
              {tab === "scenarios" && data && problem && data.scenarios.length > 0 && (
                <Scenarios scenarios={data.scenarios} settings={problem.settings} />
              )}
            </motion.div>
          </AnimatePresence>

          <footer className="pt-4 pb-8 text-center text-xs text-slate-400">
            Egzaktni DP + nezavisni validator · FastAPI + React · udaljenosti euklidske, zaokružene na 0,1 km po dionici
          </footer>
        </div>
      </main>
    </div>
  );
}
