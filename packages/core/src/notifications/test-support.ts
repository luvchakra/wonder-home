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
export function memoryDatabase(seed: Record<string, Row[]>) {
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
      limit: () => builder,
      order: () => builder,
      update: (values: Row) => ((mode = "update"), (patch = values), builder),
      insert: (values: Row | Row[]) => {
        const added = (Array.isArray(values) ? values : [values]).map((row) => ({ id: `${table}-${(counter += 1)}`, status: "generated", created_at: STAMP, ...row }));
        rows().push(...added);
        const result = { data: added, error: null };
        const chain: Record<string, unknown> = { select: () => chain, single: () => Promise.resolve({ data: added[0], error: null }), then: (resolve: (value: unknown) => void) => resolve(result) };
        return chain;
      },
      maybeSingle: () => Promise.resolve({ data: matching()[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: matching()[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => void) => {
        const hit = matching();
        if (mode === "update") for (const row of hit) Object.assign(row, patch);
        resolve({ data: hit, error: null, count: hit.length });
      },
    };
    return builder;
  };
  return { client: { from } as unknown as SupabaseClient, tables };
}

