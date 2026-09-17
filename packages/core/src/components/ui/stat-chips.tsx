import { cn } from "../../lib/cn";

/**
 * The counts under the greeting: what needs you, and what did not.
 *
 * Every chip is a real count of something the system actually evaluated. A
 * chip whose number cannot be explained from data is worse than no chip, so
 * this component takes values and never invents one.
 */
export type Stat = {
  label: string;
  value: number;
  tone: "attention" | "handled" | "info";
};

const TONE: Record<Stat["tone"], string> = {
  attention: "text-[var(--wh-attention)]",
  handled: "text-[var(--wh-handled)]",
  info: "text-[var(--wh-info)]",
};

export function StatChips({ stats, className }: { stats: readonly Stat[]; className?: string }) {
  return (
    <ul className={cn("grid grid-cols-3 gap-2", className)}>
      {stats.map((stat) => (
        <li
          key={stat.label}
          className="rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 py-2.5 text-center"
        >
          <p className={cn("text-lg font-semibold leading-none", TONE[stat.tone])}>{stat.value}</p>
          <p className="mt-1 text-[0.6875rem] text-[var(--wh-foreground-subtle)]">{stat.label}</p>
        </li>
      ))}
    </ul>
  );
}
