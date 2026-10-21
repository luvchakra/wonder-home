"use client";

import { useId, useState } from "react";

/**
 * Monthly spend as lines (the owner, 2026-10-20: "show line graph for each
 * type, show data points on x and y axis"): the household's total first, then
 * one small chart per bill, all on the same months so they read side by side.
 *
 * Each chart is one series, so its title names it and there is no legend. The
 * y axis is money from zero with three ticks; the x axis is the months. Every
 * month on record is a dot; a month with nothing on record breaks the line
 * rather than drawing a guess through it (rule 9). Touch the chart and slide
 * a finger along it (or hover, or focus a dot) and a guide line follows to the
 * nearest month on record, labelled with its month and exact amount (the
 * owner, 2026-10-21: "make the line charts touch enabled, showing numbers as
 * per touch"); the newest is labelled otherwise. The same numbers are in the
 * table below the charts.
 */
export type SpendSeries = {
  key: string;
  name: string;
  /** One per month in `months`, null where nothing is on record. */
  values: (number | null)[];
  /** The same values, written as money. */
  texts: (string | null)[];
  /** Up to three gridlines from zero, with their money words. */
  ticks: { value: number; text: string }[];
};

const W = 320;
const H = 150;
const M = { top: 14, right: 14, bottom: 24, left: 52 };

function Chart({ series, months, monthWords }: { series: SpendSeries; months: string[]; monthWords: string[] }) {
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();
  const top = Math.max(1, ...series.ticks.map((tick) => tick.value));
  const x = (index: number) => M.left + (months.length === 1 ? (W - M.left - M.right) / 2 : (index * (W - M.left - M.right)) / (months.length - 1));
  const y = (value: number) => H - M.bottom - (value / top) * (H - M.top - M.bottom);

  // Runs of consecutive months on record: each is its own line, so a gap stays a gap.
  const runs: number[][] = [];
  series.values.forEach((value, index) => {
    if (value === null) return;
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1] === index - 1) last.push(index);
    else runs.push([index]);
  });
  const newest = series.values.reduce<number | null>((found, value, index) => (value === null ? found : index), null);
  const shown = active ?? newest;

  // The month on record nearest the finger, in the chart's own coordinates.
  const pick = (event: React.PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const at = ((event.clientX - box.left) / box.width) * W;
    let best: number | null = null;
    series.values.forEach((value, index) => {
      if (value === null) return;
      if (best === null || Math.abs(x(index) - at) < Math.abs(x(best) - at)) best = index;
    });
    if (best !== null) setActive(best);
  };
  const label = shown !== null && series.values[shown] !== null ? `${monthWords[shown]} · ${series.texts[shown]}` : null;

  return (
    <figure className="min-w-0 space-y-1">
      <figcaption id={titleId} className="text-sm font-medium break-words">
        {series.name}
      </figcaption>
      {/* `data-swipe="own"`: sliding along a chart reads it, never moves to another screen. */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full touch-pan-y overflow-visible select-none"
        role="group"
        aria-labelledby={titleId}
        data-swipe="own"
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") setActive(null);
        }}
      >
        {series.ticks.map((tick) => (
          <g key={tick.value}>
            <line x1={M.left} x2={W - M.right} y1={y(tick.value)} y2={y(tick.value)} stroke="var(--wh-border)" strokeWidth={1} strokeDasharray={tick.value === 0 ? undefined : "2 3"} />
            <text x={M.left - 6} y={y(tick.value)} dy="0.32em" textAnchor="end" fontSize="10" fill="var(--wh-foreground-subtle)" className="tabular-nums">
              {tick.text}
            </text>
          </g>
        ))}
        {monthWords.map((word, index) => (
          <text key={months[index]} x={x(index)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--wh-foreground-subtle)">
            {word}
          </text>
        ))}
        {active !== null && series.values[active] !== null ? (
          <line x1={x(active)} x2={x(active)} y1={M.top} y2={H - M.bottom} stroke="var(--wh-foreground-subtle)" strokeWidth={1} strokeDasharray="3 3" pointerEvents="none" />
        ) : null}
        {/* The whole plot answers a touch: press, slide, and the label follows the finger. */}
        <rect
          x={M.left - 10}
          y={0}
          width={W - M.left - M.right + 20}
          height={H - M.bottom}
          fill="transparent"
          onPointerDown={(event) => {
            if (event.pointerType !== "mouse") event.currentTarget.setPointerCapture(event.pointerId);
            pick(event);
          }}
          onPointerMove={(event) => {
            if (event.pointerType === "mouse" || event.buttons > 0 || event.currentTarget.hasPointerCapture(event.pointerId)) pick(event);
          }}
          aria-hidden="true"
        />
        {runs.map((run) => (
          <polyline
            key={run[0]}
            points={run.map((index) => `${x(index)},${y(series.values[index]!)}`).join(" ")}
            fill="none"
            stroke="var(--wh-tone-money)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            pointerEvents="none"
          />
        ))}
        {series.values.map((value, index) =>
          value === null ? null : (
            <g key={months[index]}>
              <circle cx={x(index)} cy={y(value)} r={index === shown ? 5 : 4} fill="var(--wh-tone-money)" stroke="var(--wh-surface)" strokeWidth={2} pointerEvents="none" />
              {/* A hit target bigger than the dot, for a finger as much as a pointer. */}
              <circle
                cx={x(index)}
                cy={y(value)}
                r={14}
                fill="transparent"
                tabIndex={0}
                role="img"
                aria-label={`${monthWords[index]}: ${series.texts[index]}`}
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onClick={() => setActive(index)}
                className="cursor-pointer focus-visible:outline-none"
              />
            </g>
          ),
        )}
        {shown !== null && series.values[shown] !== null ? (
          <text
            x={Math.min(W - M.right, Math.max(M.left, x(shown)))}
            y={Math.max(10, y(series.values[shown]!) - 10)}
            textAnchor={x(shown) > W - M.right - 45 ? "end" : x(shown) < M.left + 45 ? "start" : "middle"}
            fontSize="11"
            fontWeight="600"
            fill="var(--wh-foreground)"
            stroke="var(--wh-surface)"
            strokeWidth={3}
            paintOrder="stroke"
            pointerEvents="none"
            className="tabular-nums"
          >
            {active !== null ? label : series.texts[shown]}
          </text>
        ) : null}
      </svg>
    </figure>
  );
}

export function SpendLines({ months, monthWords, series, tableLabel, monthHeading }: { months: string[]; monthWords: string[]; series: SpendSeries[]; tableLabel: string; monthHeading: string }) {
  const [total, ...bills] = series;
  return (
    <div className="space-y-4">
      {total ? <Chart series={total} months={months} monthWords={monthWords} /> : null}
      {bills.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {bills.map((entry) => (
            <Chart key={entry.key} series={entry} months={months} monthWords={monthWords} />
          ))}
        </div>
      ) : null}
      <details className="text-sm">
        <summary className="cursor-pointer py-2 font-medium text-[var(--wh-primary)]">{tableLabel}</summary>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs tabular-nums">
            <thead>
              <tr className="text-[var(--wh-foreground-subtle)]">
                <th scope="col" className="py-1 pe-3 font-medium">{monthHeading}</th>
                {series.map((entry) => (
                  <th key={entry.key} scope="col" className="py-1 pe-3 font-medium">
                    {entry.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map((month, index) => (
                <tr key={month} className="border-t border-[var(--wh-border)]">
                  <th scope="row" className="py-1 pe-3 font-medium">{monthWords[index]}</th>
                  {series.map((entry) => (
                    <td key={entry.key} className="py-1 pe-3">
                      {entry.texts[index] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
