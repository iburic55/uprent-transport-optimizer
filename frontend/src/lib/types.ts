// Tipovi odgovaraju modelima u api/main.py

export type Truck = { name: string; capacity_kg: number; max_machines: number };
export type Machine = { code: string; weight_kg: number };
export type Loc = { code: string; x: number; y: number; label: string };
export type OrderIn = { code: string; machine: string; pickup: string; delivery: string };
export type Settings = {
  max_hours: number;
  handling_min: number;
  speed_kmh: number;
  handling_counts: boolean;
};
export type Problem = {
  trucks: Truck[];
  machines: Machine[];
  locations: Loc[];
  orders: OrderIn[];
  settings: Settings;
};

export type StepKind = "start" | "pickup" | "delivery" | "return";
export type Step = {
  seq: number;
  location: string;
  kind: StepKind;
  action: string;
  order: string | null;
  machine: string | null;
  weight_kg: number | null;
  leg_km: number;
  cum_km: number;
  load_kg: number;
  machines_on_board: number;
  elapsed_min: number;
};
export type Segment = {
  kind: "drive" | "pickup" | "delivery";
  start: number;
  end: number;
  from?: string;
  to?: string;
  at?: string;
  order?: string;
  machine?: string;
};
export type TruckPlan = {
  name: string;
  capacity_kg: number;
  max_machines: number;
  km: number;
  drive_min: number;
  handling_min: number;
  total_min: number;
  limit_used_min: number;
  utilization: number;
  orders_done: string[];
  route: string[];
  peak_load_kg: number;
  steps: Step[];
  timeline: Segment[];
};
export type Unassigned = {
  order: string;
  machine: string;
  weight_kg: number;
  pickup: string;
  delivery: string;
  reason: string;
};
export type Plan = {
  total_km: number;
  orders_done: number;
  orders_total: number;
  optimal: boolean;
  valid: boolean;
  validation_errors: string[];
  trucks: TruckPlan[];
  unassigned: Unassigned[];
};
export type Scenario = {
  key: "strict" | "drive" | "free";
  label: string;
  total_km: number;
  orders_done: number;
  optimal: boolean;
  trucks: { name: string; km: number; orders: number; total_min: number; drive_min: number }[];
};
export type Insight = {
  free_km: number;
  plan_km: number;
  delta_km: number;
  longest_truck: string;
  longest_min: number;
  limit_h: number;
  handling_counts: boolean;
  moved: { order: string; truck: string }[];
};
export type OptimizeResponse = {
  problems: string[];
  plan: Plan | null;
  scenarios: Scenario[];
  insight: Insight | null;
};
