import type { LoginHints, PortalAdapter, PortalBrowser, PortalCredentials } from "./adapter";
import { itemHash } from "./dedupe";
import { ensureSession, type ConnectionState, type ReconnectReason, type SessionStore } from "./ensure-session";

/**
 * One fetch of a connected portal (story 08-033) — the brain the worker runs on
 * a schedule and on demand. It ties together everything the engine provides,
 * behind ports so it is testable with no browser, no network and no live
 * credentials: the real Playwright browser, HomeBrain extraction, HomeSend
 * filing and the Supabase cursor store are injected at the edges.
 *
 * The shape, and the invariants it keeps (CLAUDE.md):
 *  1. `ensureSession` first — reuse a session or auto re-login; a real auth
 *     failure ends the run as `reconnect_needed`, nothing is read or filed.
 *  2. For each page the household asked to read: render, extract structured
 *     items, drop the ones already seen (idempotent cursor), and file only the
 *     fresh ones. Everything filed is untrusted and goes through HomeSend to
 *     wait for confirmation — this never writes a domain row itself.
 *  3. A page that fails to read or extract is recorded and skipped; it never
 *     fails the other pages or the whole run.
 *  4. Read-only: it navigates and reads, never submits, sends or pays.
 */

export type ScrapeTarget = { url: string; kind: string; childMemberId: string | null };

/** A structured item pulled from a page (by HomeBrain for the generic path, or a provider adapter). */
export type RawPortalItem = {
  title: string;
  /** The item's own kind (homework / exam / notice / message …). */
  kind: string;
  subject?: string | null;
  childMemberId?: string | null;
  /** The day it is about (YYYY-MM-DD), when known. */
  dueOn?: string | null;
  detail?: string | null;
  sourceUrl: string;
};

/** Turns a rendered page into structured items. The real one validates through HomeBrain. */
export interface PortalExtractor {
  extract(input: { text: string; target: ScrapeTarget }): Promise<RawPortalItem[]>;
}

/** Files fresh items into HomeSend (always awaiting confirmation). */
export interface PortalFiler {
  file(input: { connectionId: string; items: RawPortalItem[] }): Promise<void>;
}

/** The idempotency cursor for one connection (backed by portal_fetch_cursors). */
export interface PortalCursorStore {
  loadSeen(scrapeUrl: string): Promise<Set<string>>;
  recordSeen(scrapeUrl: string, hashes: readonly string[]): Promise<void>;
}

export type FetchConnectionDeps = {
  connectionId: string;
  portalUrl: string;
  browser: PortalBrowser;
  adapter: PortalAdapter;
  store: SessionStore;
  credentials: () => Promise<PortalCredentials>;
  /** The enabled pages to read, in order. */
  targets: readonly ScrapeTarget[];
  extractor: PortalExtractor;
  filer: PortalFiler;
  cursors: PortalCursorStore;
  hints?: LoginHints;
  onState?: (state: ConnectionState, reason?: ReconnectReason) => void | Promise<void>;
};

export type TargetOutcome = {
  url: string;
  /** Where the navigation actually landed (a cold deep link into an SPA may redirect). */
  finalUrl: string;
  /** How many characters of rendered text were read (metadata only — never the text itself). */
  chars: number;
  /** Items the extractor returned. */
  read: number;
  /** Of those, how many were new and filed. */
  fresh: number;
  error?: string;
};

export type FetchConnectionResult =
  | { ok: false; state: "reconnect_needed"; reason: ReconnectReason }
  | { ok: true; state: "connected"; reAuthenticated: boolean; filed: number; targets: TargetOutcome[] };

export async function fetchConnection(deps: FetchConnectionDeps): Promise<FetchConnectionResult> {
  const session = await ensureSession({
    browser: deps.browser,
    adapter: deps.adapter,
    store: deps.store,
    credentials: deps.credentials,
    portalUrl: deps.portalUrl,
    hints: deps.hints,
    onState: deps.onState,
  });
  if (!session.ok) return { ok: false, state: "reconnect_needed", reason: session.reason };

  const { page } = session;
  const targets: TargetOutcome[] = [];
  let filed = 0;

  for (const target of deps.targets) {
    let finalUrl = target.url;
    let chars = 0;
    try {
      await page.goto(target.url);
      finalUrl = page.currentUrl();
      const text = await page.textContent();
      chars = text.trim().length;
      const items = await deps.extractor.extract({ text, target });

      const seen = await deps.cursors.loadSeen(target.url);
      const batch = new Set<string>();
      const fresh: RawPortalItem[] = [];
      const hashes: string[] = [];
      for (const item of items) {
        const hash = itemHash({
          connectionId: deps.connectionId,
          sourceUrl: target.url,
          kind: item.kind,
          title: item.title,
          occurredOn: item.dueOn ?? null,
        });
        if (seen.has(hash) || batch.has(hash)) continue;
        batch.add(hash);
        fresh.push(item);
        hashes.push(hash);
      }

      if (fresh.length > 0) {
        // File first, then remember — a failed file is retried next run, never silently dropped.
        await deps.filer.file({ connectionId: deps.connectionId, items: fresh });
        await deps.cursors.recordSeen(target.url, hashes);
        filed += fresh.length;
      }
      targets.push({ url: target.url, finalUrl, chars, read: items.length, fresh: fresh.length });
    } catch (thrown) {
      targets.push({ url: target.url, finalUrl, chars, read: 0, fresh: 0, error: thrown instanceof Error ? thrown.message : "failed" });
    }
  }

  return { ok: true, state: "connected", reAuthenticated: session.reAuthenticated, filed, targets };
}
