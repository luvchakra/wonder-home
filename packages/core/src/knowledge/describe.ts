import type { SupabaseClient } from "@supabase/supabase-js";

import { formatDate, isoDateIn, money } from "../context/format";
import type { ContextViewer, HouseholdContextItem } from "../context/types";
import { REGISTRY_READ, type DescribeWords, type RegistrySpec, type RegistryTable, type Row } from "./registry";

/**
 * The household record index's generic describer (Phase 1). A table the
 * registry marks `registry` is read here, through the session it is given,
 * and every row becomes one HomeBrain fact in the registry's own words. No
 * hand-written builder is needed for a table to be known.
 */

/** Rows per registered table, as read for one household. */
export type RegistryRows = Partial<Record<RegistryTable, readonly Row[]>>;

const DAY_MS = 86_400_000;

/**
 * Reads every registered table this viewer may read, each bounded, each
 * isolated: one that fails is named and the rest still arrive.
 */
export async function readRegistryRows(
  supabase: SupabaseClient,
  householdId: string,
  options: { now: Date; viewer?: ContextViewer; tables?: readonly RegistryTable[] },
): Promise<{ rows: RegistryRows; failed: RegistryTable[] }> {
  const specs = REGISTRY_READ.filter((spec) => (!options.tables || options.tables.includes(spec.table)) && (!spec.permission || !options.viewer || options.viewer.permissions.includes(spec.permission)));
  const rows: RegistryRows = {};
  const failed: RegistryTable[] = [];
  await Promise.all(
    specs.map(async (spec) => {
      try {
        let query = supabase.from(spec.table).select(spec.select).eq("household_id", householdId);
        if (spec.activeOnly) query = query.eq("active", true);
        if (spec.since) query = query.gte(spec.since.column, new Date(options.now.getTime() - spec.since.days * DAY_MS).toISOString());
        const { data, error } = await query.order(spec.order.column, { ascending: spec.order.ascending, nullsFirst: false }).limit(spec.limit);
        if (error) throw error;
        rows[spec.table] = (data ?? []) as unknown as Row[];
      } catch {
        failed.push(spec.table);
      }
    }),
  );
  return { rows, failed };
}

/** The words a describer uses, for one household. */
export function describeWords(timezone: string, names: ReadonlyMap<string, string>): DescribeWords {
  const asDate = (value: unknown): Date | null => {
    if (typeof value !== "string" || !value.trim()) return null;
    const at = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
    return Number.isNaN(at.getTime()) ? null : at;
  };
  const dateOnly = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const clock = (value: unknown): string | null => {
    if (typeof value !== "string" || !/^\d{2}:\d{2}/.test(value)) return null;
    const [hour, minute] = value.slice(0, 5).split(":").map(Number) as [number, number];
    return `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, "0")}${hour < 12 ? "am" : "pm"}`;
  };
  return {
    name: (memberId) => (typeof memberId === "string" ? (names.get(memberId) ?? null) : null),
    date: (value) => {
      const at = asDate(value);
      return at ? formatDate(at, dateOnly(value) ? "UTC" : timezone) : null;
    },
    clock,
    moment: (value) => {
      const at = asDate(value);
      if (!at) return null;
      if (dateOnly(value)) return formatDate(at, "UTC");
      const local = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: timezone }).format(at);
      return `${formatDate(at, timezone)}, ${clock(local)}`;
    },
    money: (minor, currency) => (typeof minor === "number" && Number.isFinite(minor) && typeof currency === "string" && currency ? money(minor, currency) : typeof minor === "string" && Number.isFinite(Number(minor)) && typeof currency === "string" ? money(Number(minor), currency) : null),
    day: (value) => {
      if (dateOnly(value)) return value as string;
      const at = asDate(value);
      return at ? isoDateIn(at, timezone) : null;
    },
  };
}

/** One registered row as a HomeBrain fact, or null when the describer has nothing to say. */
export function describeRow(
  spec: RegistrySpec & { table: RegistryTable },
  row: Row,
  context: { householdId: string; words: DescribeWords; today: string; nowIso: string },
): HouseholdContextItem | null {
  const described = spec.describe(row, context.words);
  if (!described) return null;
  const entityId = typeof row.id === "string" ? row.id : [row.member_id, row.household_id, spec.table].filter((part) => typeof part === "string").join(":") || spec.table;
  const date = described.date ?? null;
  const current = described.current ?? !(date && date < context.today);
  const subjects = spec.subjects(row).filter((id): id is string => typeof id === "string" && id.length > 0);
  const healthScope = spec.healthScope?.(row);
  return {
    id: `${spec.noun.replace(/\s+/g, "_")}:${entityId}`,
    householdId: context.householdId,
    domain: spec.domain,
    entityType: spec.noun.replace(/\s+/g, "_"),
    entityId,
    subjectMemberIds: [...new Set(subjects)],
    summary: described.summary,
    need: spec.need,
    attributes: { title: described.title, ...(date ? { date } : {}), ...(described.attributes ?? {}) },
    source: { type: spec.table, sourceId: typeof row.id === "string" ? row.id : null, capturedAt: null },
    evidence: [],
    confidence: 1,
    confirmed: true,
    privacyClass: spec.privacy,
    ...(spec.privacy === "health" ? { healthScope: healthScope ?? "private" } : {}),
    validFrom: null,
    validUntil: date,
    freshnessAt: context.nowIso,
    freshness: current ? "current" : "historical",
    tier: current ? 2 : 3,
    aliases: [...new Set([described.title, ...(described.aliases ?? [])].filter((alias): alias is string => typeof alias === "string" && alias.trim().length > 0))],
    relatedEntityIds: [],
    authority: 3,
  };
}

/** Every registered row as facts. */
export function registryItems(
  rows: RegistryRows | undefined,
  options: { householdId: string; timezone: string; now: Date; names: ReadonlyMap<string, string> },
): HouseholdContextItem[] {
  if (!rows) return [];
  const words = describeWords(options.timezone, options.names);
  const context = { householdId: options.householdId, words, today: isoDateIn(options.now, options.timezone), nowIso: options.now.toISOString() };
  const items: HouseholdContextItem[] = [];
  for (const spec of REGISTRY_READ) {
    for (const row of rows[spec.table] ?? []) {
      const item = describeRow(spec, row, context);
      if (item) items.push(item);
    }
  }
  return items;
}
