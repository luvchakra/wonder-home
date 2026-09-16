/**
 * Single source of truth for which Supabase project WonderHome talks to.
 *
 * WonderHome is pinned to exactly one database. Every Supabase client in this
 * repo resolves its configuration through this module, and every helper here
 * throws rather than falling back, so a stray `.env` value or a copy-pasted
 * key from another project fails loudly instead of quietly reading or writing
 * the wrong data.
 */

/** The only Supabase project WonderHome is allowed to use. */
export const WONDERHOME_PROJECT_REF = "stehegovxlssxdepiruk";

/** The only Supabase API origin WonderHome is allowed to use. */
export const WONDERHOME_SUPABASE_URL = `https://${WONDERHOME_PROJECT_REF}.supabase.co`;

/** The only Postgres host WonderHome is allowed to use for direct connections. */
export const WONDERHOME_DB_HOST = `db.${WONDERHOME_PROJECT_REF}.supabase.co`;

/** Thrown when configuration points somewhere other than the pinned project. */
export class WrongSupabaseProjectError extends Error {
  readonly expectedRef = WONDERHOME_PROJECT_REF;
  readonly actualRef: string | null;

  constructor(source: string, actualRef: string | null, detail: string) {
    super(
      `${source} does not belong to the WonderHome Supabase project. ` +
        `Expected project ref "${WONDERHOME_PROJECT_REF}", got ${
          actualRef === null ? "no recognisable ref" : `"${actualRef}"`
        }. ${detail}`,
    );
    this.name = "WrongSupabaseProjectError";
    this.actualRef = actualRef;
  }
}

/** Thrown when a required Supabase environment variable is absent or blank. */
export class MissingSupabaseConfigError extends Error {
  constructor(name: string, hint: string) {
    super(`Environment variable ${name} is not set. ${hint}`);
    this.name = "MissingSupabaseConfigError";
  }
}

/**
 * Extracts the project ref from a Supabase API URL, e.g.
 * `https://abcdefghijklmnopqrst.supabase.co` -> `abcdefghijklmnopqrst`.
 * Returns `null` for anything that is not a recognisable Supabase host.
 */
export function projectRefFromUrl(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }

  // Matches both `<ref>.supabase.co` (API) and `db.<ref>.supabase.co` (Postgres),
  // plus the `.supabase.in` / `.supabase.red` staging domains.
  const match = /^(?:db\.)?([a-z]{20})\.supabase\.(?:co|in|red)$/.exec(host);
  return match ? match[1] : null;
}

/**
 * Extracts the project ref from a legacy JWT-style key (`anon` / `service_role`),
 * which carries the ref in its payload. The newer `sb_publishable_…` and
 * `sb_secret_…` formats are opaque and carry no ref, so they return `null`.
 */
export function projectRefFromKey(key: string): string | null {
  const segments = key.split(".");
  if (segments.length !== 3) return null;

  try {
    // `atob` rather than `Buffer` so this module also works in the browser
    // bundle, where Node globals are not available.
    const base64 = segments[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    const ref: unknown = JSON.parse(payload)?.ref;
    return typeof ref === "string" ? ref : null;
  } catch {
    return null;
  }
}

/**
 * Returns `url` unchanged if it points at the WonderHome project, and throws
 * otherwise.
 */
export function assertWonderHomeUrl(url: string, source: string): string {
  const ref = projectRefFromUrl(url);
  if (ref !== WONDERHOME_PROJECT_REF) {
    throw new WrongSupabaseProjectError(
      source,
      ref,
      `WonderHome may only connect to ${WONDERHOME_SUPABASE_URL}.`,
    );
  }
  return url;
}

/**
 * Returns `key` unchanged if it could belong to the WonderHome project, and
 * throws otherwise. Opaque `sb_publishable_…` / `sb_secret_…` keys cannot be
 * checked against a ref, so they are accepted on shape alone.
 */
export function assertWonderHomeKey(key: string, source: string): string {
  const ref = projectRefFromKey(key);
  if (ref !== null && ref !== WONDERHOME_PROJECT_REF) {
    throw new WrongSupabaseProjectError(
      source,
      ref,
      "This looks like a key issued for a different Supabase project.",
    );
  }
  return key;
}

function readRequired(name: string, hint: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new MissingSupabaseConfigError(name, hint);
  }
  return value.trim();
}

/** The validated Supabase API URL. Safe to expose to the browser. */
export function getSupabaseUrl(): string {
  const url = readRequired(
    "NEXT_PUBLIC_SUPABASE_URL",
    `It must be set to ${WONDERHOME_SUPABASE_URL} — see .env.example.`,
  );
  return assertWonderHomeUrl(url, "NEXT_PUBLIC_SUPABASE_URL");
}

/** The validated publishable (anon) key. Safe to expose to the browser. */
export function getPublishableKey(): string {
  const key = readRequired(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "Copy it from the WonderHome project's API settings — see .env.example.",
  );
  return assertWonderHomeKey(key, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
}

/**
 * The validated secret (service_role) key. Never import this from client
 * components — it bypasses Row Level Security.
 */
export function getSecretKey(): string {
  const key = readRequired(
    "SUPABASE_SECRET_KEY",
    "Copy it from the WonderHome project's API settings — see .env.example.",
  );
  return assertWonderHomeKey(key, "SUPABASE_SECRET_KEY");
}
