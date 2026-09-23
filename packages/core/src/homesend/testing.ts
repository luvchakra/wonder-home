import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A small in-memory stand-in for the Supabase client, covering exactly the
 * calls HomeSend's repository and pipeline make — so the whole pipeline runs
 * in a unit test with a stand-in model, speech service and web, and the
 * test reads back exactly what would have been written. Not a general fake:
 * anything it does not support throws, so a new call surfaces here instead
 * of silently passing.
 */

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

export type FakeSupabase = {
  client: SupabaseClient;
  tables: Record<string, Row[]>;
  uploads: { bucket: string; path: string; bytes: number; contentType?: string }[];
};

export function fakeSupabase(seed: Record<string, Row[]> = {}): FakeSupabase {
  const tables: Record<string, Row[]> = { home_send_items: [], ...seed };
  const uploads: FakeSupabase["uploads"] = [];

  function query(table: string) {
    const rows = (tables[table] ??= []);
    const filters: Filter[] = [];
    let mode: "select" | "insert" | "update" | "upsert" = "select";
    let payload: Row | Row[] | null = null;
    let conflict: { columns: string[]; ignoreDuplicates: boolean } | null = null;
    let order: { column: string; ascending: boolean } | null = null;
    let limit: number | null = null;

    const run = (): Row[] => {
      if (mode === "upsert" && payload && conflict) {
        const value = payload as Row;
        const clash = rows.find((row) => conflict!.columns.every((column) => row[column] === value[column]));
        if (clash) {
          if (conflict.ignoreDuplicates) return [];
          Object.assign(clash, value);
          return [clash];
        }
        mode = "insert";
      }
      if (mode === "insert" && payload) {
        const inserted = (Array.isArray(payload) ? payload : [payload]).map((value: Row) => ({ id: crypto.randomUUID(), created_at: new Date(Date.now() + rows.length).toISOString(), status: "received", ...value }));
        rows.push(...inserted);
        return inserted;
      }
      let matched = rows.filter((row) => filters.every((filter) => filter(row)));
      if (mode === "update" && payload) {
        for (const row of matched) Object.assign(row, payload);
      }
      if (order) {
        const { column, ascending } = order;
        matched = [...matched].sort((a, b) => (String(a[column]) < String(b[column]) ? -1 : 1) * (ascending ? 1 : -1));
      }
      return limit === null ? matched : matched.slice(0, limit);
    };

    const builder = {
      select() {
        return builder;
      },
      insert(value: Row | Row[]) {
        mode = "insert";
        payload = value;
        return builder;
      },
      update(value: Row) {
        mode = "update";
        payload = value;
        return builder;
      },
      upsert(value: Row, options: { onConflict: string; ignoreDuplicates?: boolean }) {
        mode = "upsert";
        payload = value;
        conflict = { columns: options.onConflict.split(",").map((column) => column.trim()), ignoreDuplicates: options.ignoreDuplicates ?? false };
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return builder;
      },
      in(column: string, values: unknown[]) {
        filters.push((row) => values.includes(row[column]));
        return builder;
      },
      order(column: string, options?: { ascending?: boolean }) {
        order = { column, ascending: options?.ascending ?? true };
        return builder;
      },
      limit(count: number) {
        limit = count;
        return builder;
      },
      async single() {
        const result = run();
        return result[0] ? { data: result[0], error: null } : { data: null, error: { code: "PGRST116" } };
      },
      async maybeSingle() {
        return { data: run()[0] ?? null, error: null };
      },
      then<T>(resolve: (value: { data: Row[]; error: null }) => T) {
        return Promise.resolve({ data: run(), error: null }).then(resolve);
      },
    };
    return builder;
  }

  const client = {
    from: (table: string) => query(table),
    storage: {
      from: (bucket: string) => ({
        async upload(path: string, body: Uint8Array | Blob, options?: { contentType?: string }) {
          uploads.push({ bucket, path, bytes: body instanceof Uint8Array ? body.length : (body as Blob).size, contentType: options?.contentType });
          return { data: { path }, error: null };
        },
      }),
    },
  } as unknown as SupabaseClient;

  return { client, tables, uploads };
}
