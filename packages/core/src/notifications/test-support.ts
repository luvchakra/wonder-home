/** An in-memory stand-in for the tables the notification passes read and write, for tests only. */
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;

/** A column or a JSON path ("metadata->>to") of a row. */
function valueOf(row: Row, column: string): unknown {
  const [name, path] = column.split("->>");
  return path ? (row[name!] as Row | null)?.[path] : row[name!];
}

const STAMP = "2026-10-20T06:00:00.000Z";

// A small in-memory database: the tables the sweep reads and the notifications it writes.
// `missing` names tables that aren't there yet (a migration not applied): every read of them fails.
/**
 * `checks`: a table's CHECK constraints as predicates over a row after an
 * update; one that fails refuses the whole update with 23514, as Postgres
 * does, and changes nothing.
 */
export function memoryDatabase(seed: Record<string, Row[]>, missing: readonly string[] = [], checks: Record<string, (row: Row) => boolean> = {}) {
  const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(seed).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]));
  let counter = 0;
  const from = (table: string) => {
    const filters: ((row: Row) => boolean)[] = [];
    let mode: "select" | "update" = "select";
    let patch: Row = {};
    const rows = () => (tables[table] ??= []);
    const matching = () => rows().filter((row) => filters.every((test) => test(row)));
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (column: string, value: unknown) => (filters.push((row) => valueOf(row, column) === value), builder),
      is: (column: string, value: unknown) => (filters.push((row) => (valueOf(row, column) ?? null) === value), builder),
      neq: (column: string, value: unknown) => (filters.push((row) => valueOf(row, column) !== value), builder),
      in: (column: string, values: unknown[]) => (filters.push((row) => values.includes(valueOf(row, column))), builder),
      gte: (column: string, value: string) => (filters.push((row) => String(row[column] ?? "") >= value), builder),
      lte: (column: string, value: string) => (filters.push((row) => String(row[column] ?? "") <= value), builder),
      lt: (column: string, value: string) => (filters.push((row) => String(row[column] ?? "") < value), builder),
      limit: () => builder,
      order: () => builder,
      update: (values: Row) => ((mode = "update"), (patch = values), builder),
      insert: (values: Row | Row[]) => {
        const added = (Array.isArray(values) ? values : [values]).map((row) => ({ id: `${table}-${(counter += 1)}`, status: "generated", created_at: STAMP, ...row }));
        rows().push(...added);
        const result = { data: added, error: null };
        const chain: Record<string, unknown> = {
          select: () => chain,
          single: () => Promise.resolve({ data: added[0], error: null }),
          maybeSingle: () => Promise.resolve({ data: added[0] ?? null, error: null }),
          then: (resolve: (value: unknown) => void) => resolve(result),
        };
        return chain;
      },
      upsert: (values: Row | Row[], options: { onConflict?: string } = {}) => {
        const keys = (options.onConflict ?? "id").split(",").map((key) => key.trim());
        const written = (Array.isArray(values) ? values : [values]).map((value) => {
          const existing = rows().find((row) => keys.every((key) => row[key] === value[key]));
          if (existing) return Object.assign(existing, value);
          const added = { id: `${table}-${(counter += 1)}`, created_at: STAMP, ...value };
          rows().push(added);
          return added;
        });
        const result = { data: written, error: null };
        const chain: Record<string, unknown> = {
          select: () => chain,
          single: () => Promise.resolve({ data: written[0], error: null }),
          maybeSingle: () => Promise.resolve({ data: written[0] ?? null, error: null }),
          then: (resolve: (value: unknown) => void) => resolve(result),
        };
        return chain;
      },
      // Reads hand back copies, as a real database does: a later write never changes what was read.
      maybeSingle: () => Promise.resolve({ data: matching()[0] ? { ...matching()[0] } : null, error: null }),
      single: () => Promise.resolve({ data: matching()[0] ? { ...matching()[0] } : null, error: null }),
      then: (resolve: (value: unknown) => void) => {
        if (missing.includes(table)) return resolve({ data: null, error: { code: "42P01", message: "missing" } });
        const hit = matching();
        if (mode === "update") {
          const check = checks[table];
          if (check && hit.some((row) => !check({ ...row, ...patch }))) return resolve({ data: null, error: { code: "23514", message: "check violation" } });
          for (const row of hit) Object.assign(row, patch);
        }
        resolve({ data: hit, error: null, count: hit.length });
      },
    };
    return builder;
  };
  return { client: { from } as unknown as SupabaseClient, tables };
}

