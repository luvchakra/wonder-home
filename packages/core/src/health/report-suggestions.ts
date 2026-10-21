import type { ReportFinding } from "./report-reading";

/**
 * Next steps from a health report (story 21-012) — rules, never a model.
 *
 * Each suggestion comes from findings the report itself marks outside its own
 * range (`report-reading.ts`), carries the keys of those findings, and acts
 * only through a sheet that already exists, prefilled for the person to check
 * and save: booking an appointment, a measurement routine, a checkup. None of
 * it is medical advice, and the screen says so beside every one.
 *
 * Nothing marked outside its range: one calm line and no actions at all —
 * the absence of a button is the message (rule 4).
 */

/** What can be measured at home, as the routine sheet's own measurement types. */
export type HomeMeasure = "blood_pressure" | "weight" | "pulse" | "blood_sugar";

export const HOME_MEASURE_VITAL: Record<HomeMeasure, { vitalType: "blood_pressure" | "weight" | "pulse" | "custom"; custom: boolean }> = {
  blood_pressure: { vitalType: "blood_pressure", custom: false },
  weight: { vitalType: "weight", custom: false },
  pulse: { vitalType: "pulse", custom: false },
  blood_sugar: { vitalType: "custom", custom: true },
};

/** How often a suggested home measurement repeats: weekly, one of the routine sheet's own choices. */
export const TRACK_CADENCE_DAYS = 7;
export const RECHECK_MONTHS = [3, 6] as const;

export type ReportSuggestion =
  | { kind: "follow_up"; findingKeys: string[]; memberId: string }
  | { kind: "track"; findingKeys: string[]; memberId: string; measure: HomeMeasure; cadenceDays: number; startsOn: string }
  | { kind: "recheck"; findingKeys: string[]; memberId: string; options: { months: (typeof RECHECK_MONTHS)[number]; dueOn: string }[] }
  | { kind: "nothing_flagged"; findingKeys: [] };

/** Which home measurement a finding's name is, if any. Urine and lab-only tests are not. */
export function homeMeasureOf(name: string): HomeMeasure | null {
  const plain = name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (/\burine\b|\bhba1c\b|\ba1c\b|glycated|glycosylated/.test(plain)) return null;
  if (/blood pressure|\bsystolic\b|\bdiastolic\b|^bp$|^b p$/.test(plain)) return "blood_pressure";
  if (/^(?:body )?weight$|^wt$/.test(plain)) return "weight";
  if (/\bpulse\b|heart rate/.test(plain)) return "pulse";
  if (/glucose|blood sugar|^fbs$|^ppbs$|^rbs$/.test(plain)) return "blood_sugar";
  return null;
}

/** YYYY-MM-DD plus whole months, landing on the month's last day when the day does not exist (31 Jan + 1 month → 28/29 Feb). */
export function addMonths(dateKey: string, months: number): string {
  const [year, month, day] = dateKey.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

export function suggestFromReport(input: {
  findings: readonly ReportFinding[];
  memberId: string;
  /** The record's own document date, else the reading's test date, else null. */
  reportDate: string | null;
  /** The household's day, YYYY-MM-DD. */
  today: string;
}): ReportSuggestion[] {
  if (input.findings.length === 0) return [];
  const flagged = input.findings.filter((finding) => finding.outside !== null);
  if (flagged.length === 0) return [{ kind: "nothing_flagged", findingKeys: [] }];

  const suggestions: ReportSuggestion[] = [{ kind: "follow_up", findingKeys: flagged.map((finding) => finding.key), memberId: input.memberId }];

  const byMeasure = new Map<HomeMeasure, string[]>();
  for (const finding of flagged) {
    const measure = homeMeasureOf(finding.name);
    if (measure) byMeasure.set(measure, [...(byMeasure.get(measure) ?? []), finding.key]);
  }
  for (const [measure, findingKeys] of byMeasure) {
    suggestions.push({ kind: "track", findingKeys, memberId: input.memberId, measure, cadenceDays: TRACK_CADENCE_DAYS, startsOn: input.today });
  }

  if (input.reportDate) {
    // From the report's date; an old report is rechecked from today instead, never on a day already gone.
    const from = input.reportDate > input.today ? input.today : input.reportDate;
    const options = RECHECK_MONTHS.map((months) => {
      const due = addMonths(from, months);
      return { months, dueOn: due < input.today ? addMonths(input.today, months) : due };
    });
    suggestions.push({ kind: "recheck", findingKeys: flagged.map((finding) => finding.key), memberId: input.memberId, options });
  }

  return suggestions;
}
