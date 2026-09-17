import { cn } from "../../lib/cn";

/**
 * A percentage as a ring, with the number in the middle.
 *
 * Used for "how well WonderHome understands your household", which is a count
 * of confirmed beliefs over live ones — explainable arithmetic, not a model's
 * opinion of itself. The number is real text, so it reads without the ring.
 */
export function ProgressRing({
  value,
  label,
  size = 104,
  stroke = 9,
  className,
}: {
  /** 0–100. */
  value: number;
  label: string;
  size?: number;
  stroke?: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-label={label}
      className={cn("relative inline-grid place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--wh-primary-soft)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--wh-primary)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset var(--wh-duration-slow) var(--wh-ease)" }}
        />
      </svg>
      <span className="absolute text-xl font-bold tracking-tight tabular-nums">{clamped}%</span>
    </div>
  );
}
