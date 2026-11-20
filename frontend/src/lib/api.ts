import type { OptimizeResponse, Problem } from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (Array.isArray(body?.detail))
        detail = body.detail
          .map((d: { loc?: unknown[]; msg?: string }) => `${(d.loc ?? []).slice(1).join(".")}: ${d.msg}`)
          .join("; ");
    } catch {
      /* odgovor nije JSON */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const fetchDefaults = () => request<Problem>("/api/defaults");

export const fetchPlan = (problem: Problem, signal?: AbortSignal) =>
  request<OptimizeResponse>("/api/optimize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(problem),
    signal,
  });
