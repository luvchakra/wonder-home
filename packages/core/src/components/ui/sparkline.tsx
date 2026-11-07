import { cn } from "../../lib/cn";

/**
 * A small trend line beside a figure: one series, no axes, the last day marked.
 *
 * Server-rendered SVG (no chart library reaches the browser). The figure next
 * to it carries the meaning (rule 3: state speaks in words); the line only
 * shows its shape, so it is hidden from assistive tech unless given a label
 * that says the same in words. Colour is the primary token; a flat or empty
 * series draws a flat line rather than inventing a slope (rule 9).
 */
export function Sparkline({
  values,
  label,
  width = 96,
  height = 28,
  className,
}: {
  values: readonly number[];
  /** Said in words: "7 days, from 0 to 3". Leave out when the figure beside it says it. */
  label?: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  const pad = 3;
  const n = values.length;
  const max = Math.max(0, ...values);
  const x = (i: number) => (n <= 1 ? width / 2 : pad + (i * (width - 2 * pad)) / (n - 1));
  const y = (v: number) => (max === 0 ? height - pad : height - pad - (v / max) * (height - 2 * pad));
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const lastValue = values[n - 1];
  const last = lastValue === undefined ? null : { cx: x(n - 1), cy: y(lastValue) };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn("shrink-0 overflow-visible", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <line x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} stroke="var(--wh-border)" strokeWidth={1} />
      {n > 1 ? (
        <polyline points={points} fill="none" stroke="var(--wh-primary)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      ) : null}
      {last ? <circle cx={last.cx} cy={last.cy} r={2.25} fill="var(--wh-primary)" /> : null}
    </svg>
  );
}
