import { log } from "../observability/logger";

/**
 * What a browser tells us the policy blocked (SEC-05). Anyone can post here, so it is bounded and
 * sampled: a body cap, a log budget per window per server instance, and only the fields that say
 * which rule was hit, with the blocked address cut to its origin and the page to its path. No
 * query string, fragment, script sample or cookie is kept (they can carry tokens or content).
 */
export const CSP_REPORT_MAX_BYTES = 8 * 1024;
const BUDGET_PER_MINUTE = 20;

let windowStart = 0;
let used = 0;
let dropped = 0;

export function resetCspReportBudget(): void {
  windowStart = 0;
  used = 0;
  dropped = 0;
}

function origin(value: unknown): string | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  if (["inline", "eval", "data", "blob", "self"].includes(value)) return value;
  try {
    return new URL(value).origin;
  } catch {
    return "invalid";
  }
}

function pathOf(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    return new URL(value).pathname.replace(/\/[0-9a-f-]{20,}(?=\/|$)/gi, "/:id").slice(0, 120);
  } catch {
    return undefined;
  }
}

function short(value: unknown): string | undefined {
  return typeof value === "string" ? value.split(/\s/)[0]!.slice(0, 40) : undefined;
}

type Raw = Record<string, unknown>;

/** Reads both report formats: legacy `report-uri` ({"csp-report": {...}}) and Reporting API (an array). */
export function summariseCspReports(body: unknown): Array<Record<string, string | undefined>> {
  const items: Raw[] = [];
  if (Array.isArray(body)) {
    for (const entry of body.slice(0, 5)) {
      const inner = (entry as Raw | null)?.body;
      if (inner && typeof inner === "object") items.push(inner as Raw);
    }
  } else if (body && typeof body === "object") {
    const inner = (body as Raw)["csp-report"];
    if (inner && typeof inner === "object") items.push(inner as Raw);
  }
  return items.map((r) => ({
    directive: short(r["effective-directive"] ?? r.effectiveDirective ?? r["violated-directive"] ?? r.violatedDirective),
    blocked: origin(r["blocked-uri"] ?? r.blockedURL),
    page: pathOf(r["document-uri"] ?? r.documentURL),
    disposition: short(r.disposition),
  }));
}

/** Logs what is worth keeping, within the budget. Returns how many were logged. */
export function recordCspReports(body: unknown, now = Date.now()): number {
  if (now - windowStart > 60_000) {
    if (dropped > 0) log.warn("csp reports over budget", { dropped });
    windowStart = now;
    used = 0;
    dropped = 0;
  }
  let logged = 0;
  for (const report of summariseCspReports(body)) {
    if (used >= BUDGET_PER_MINUTE) {
      dropped += 1;
      continue;
    }
    used += 1;
    logged += 1;
    log.warn("csp violation", { ...report, allow: ["directive", "blocked", "page", "disposition"] });
  }
  return logged;
}
