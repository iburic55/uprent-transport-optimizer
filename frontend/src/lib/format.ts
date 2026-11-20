import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...v: ClassValue[]) => twMerge(clsx(v));

const n1 = new Intl.NumberFormat("hr-HR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const n0 = new Intl.NumberFormat("hr-HR", { maximumFractionDigits: 0 });

export const km = (v: number) => `${n1.format(v)} km`;
export const kg = (v: number) => `${n0.format(v)} kg`;
export const num = (v: number) => n0.format(v);

/** minute -> "h:mm" (isto zaokruživanje kao u Python sučelju) */
export function hhmm(min: number): string {
  const m = Math.round(min);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

/** 1 nalog, 2 naloga, 11 naloga, 21 nalog … */
export const nalog = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? "nalog" : "naloga"}`;

export const TRUCK_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#f43f5e"];
export const truckColor = (i: number) => TRUCK_COLORS[i % TRUCK_COLORS.length];
