import { AlertTriangle, CircleCheck, Sparkles } from "lucide-react";

import { MetricGrid, type Metric } from "./metric-card";

/**
 * The counts under a greeting: what needs you, and what did not.
 *
 * Kept as a thin wrapper over MetricGrid so the screens that already use it
 * keep working; new screens use MetricGrid directly.
 */
export type Stat = {
  label: string;
  value: number;
  tone: "attention" | "handled" | "info";
};

const PRESENTATION: Record<Stat["tone"], Pick<Metric, "icon" | "tone">> = {
  attention: { icon: AlertTriangle, tone: "attention" },
  handled: { icon: CircleCheck, tone: "handled" },
  info: { icon: Sparkles, tone: "ai" },
};

export function StatChips({ stats, className }: { stats: readonly Stat[]; className?: string }) {
  return (
    <MetricGrid
      className={className}
      metrics={stats.map((stat) => ({ label: stat.label, value: stat.value, ...PRESENTATION[stat.tone] }))}
    />
  );
}
