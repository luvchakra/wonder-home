import { z } from "zod";

import { log } from "../observability/logger";

/**
 * WonderHome's careers pages are powered by WonderJobs (the owner, 2026-10-21):
 * jobs, stored applications, every email to the applicant and the hiring team,
 * reminders, decisions and deletion all live there. WonderHome only shows what
 * WonderJobs returns and forwards what an applicant submits. It keeps no
 * applicant data of its own.
 *
 * This module is the one way in. It is called only by the server
 * (`apps/web/app/_lib/careers.ts`, which is `server-only`), with the
 * career-site key that only the server holds; nothing a browser runs imports
 * it (`npm run check:bundle` fails if its endpoint path reaches a client chunk).
 *
 * - The host is fixed: https://jobs.wonderapps.biz. An override is honoured
 *   only for an https host on wonderapps.biz (a staging WonderJobs, tests).
 * - Every call has an 8 s timeout. A GET is retried once on a network error or
 *   a 5xx; a POST never is (an application must not be sent twice).
 * - 429 is "busy, try again shortly", with WonderJobs' `retry-after`.
 * - Responses are never cached by fetch. The job list alone is kept in memory
 *   for up to 60 s; a job's status, and anything about an applicant, never.
 * - Nothing logged ever holds a key, an email, a name or a token: the
 *   endpoint, the job id, the status code and the time taken.
 */

export const WONDERJOBS_BASE = "https://jobs.wonderapps.biz";
export const WONDERJOBS_TIMEOUT_MS = 8_000;
export const JOB_LIST_CACHE_MS = 60_000;

/** A career-site key from WonderJobs → Hiring → Jobs → Career sites. */
export const CAREERS_KEY_PATTERN = /^wjcs_[A-Za-z0-9_-]{16,200}$/;

const WORK_MODES = ["remote", "hybrid", "onsite"] as const;

const JobSchema = z.object({
  id: z.string().min(1).max(120),
  title: z.string().max(300),
  location: z.string().max(300).catch(""),
  workMode: z.enum(WORK_MODES).catch("onsite"),
  jobType: z.string().max(60).nullish(),
  salaryMin: z.number().finite().nonnegative().nullish(),
  salaryMax: z.number().finite().nonnegative().nullish(),
  currency: z.string().max(8).nullish(),
  description: z.string().max(60_000).catch(""),
  skills: z.array(z.string().max(120)).max(100).catch([]),
  company: z.string().max(300).catch(""),
  updatedAt: z.string().max(60).catch(""),
});

const SiteSchema = z.object({
  name: z.string().max(300).catch(""),
  retentionMonths: z.number().int().positive().max(600).nullish(),
});

const ListSchema = z.object({ site: SiteSchema.nullish(), jobs: z.array(JobSchema).max(500) });
const JobResponseSchema = z.object({ job: JobSchema, site: SiteSchema.nullish() });
const AppliedSchema = z.object({ ok: z.literal(true), id: z.string().max(120) });

export const APPLICATION_STATUSES = ["new", "reviewing", "interview", "offer", "hired", "rejected", "withdrawn"] as const;

const StatusSchema = z.object({
  application: z.object({
    status: z.enum(APPLICATION_STATUSES),
    statusLabel: z.string().max(120),
    jobTitle: z.string().max(300),
    company: z.string().max(300).catch(""),
    appliedAt: z.string().max(60),
    updatedAt: z.string().max(60),
    canWithdraw: z.boolean(),
  }),
});

export type CareerJob = z.infer<typeof JobSchema>;
export type CareerSite = { name: string; retentionMonths: number | null };
export type ApplicationStatus = z.infer<typeof StatusSchema>["application"];

export type ApplicationInput = {
  name: string;
  email: string;
  phone?: string;
  location?: string;
  linkedinUrl?: string;
  resumeUrl: string;
  coverNote?: string;
  consent: true;
};

/**
 * Every answer in closed words. `rejected` carries WonderJobs' own message for
 * a person (a 400 or a 409), shown as it is; nothing else is ever shown raw.
 */
export type CareersResult<T> =
  | { state: "ok"; data: T }
  | { state: "not_found" }
  | { state: "rejected"; status: 400 | 409; message: string }
  | { state: "wrong_key" }
  | { state: "busy"; retryAfterSeconds: number | null }
  | { state: "unavailable" };

/** The words for a non-`ok` result a person may read. The key is never in any of them. */
export const CAREERS_MESSAGES = {
  wrong_key: "Careers can't reach WonderJobs right now.",
  busy: "WonderJobs is busy. Please try again shortly.",
  unavailable: "Careers is unavailable right now. Please try again later.",
  not_found: "This position is no longer open.",
} as const;

/**
 * WonderJobs' address: the fixed host, or an override that is an https host on
 * wonderapps.biz. Anything else is refused (null), so a mistyped or hostile
 * setting can never send the key somewhere else.
 */
export function careersBase(override?: string | null): string | null {
  const raw = (override ?? "").trim();
  if (!raw) return WONDERJOBS_BASE;
  try {
    const url = new URL(raw);
    const onWonderApps = url.hostname === "wonderapps.biz" || url.hostname.endsWith(".wonderapps.biz");
    if (url.protocol !== "https:" || !onWonderApps || url.username || url.password || (url.port && url.port !== "443")) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** "wjcs_••••••••abcd": all a screen ever shows of a key. */
export function maskCareersKey(last4: string | null | undefined): string | null {
  return last4 ? `wjcs_••••••••${last4}` : null;
}

export function lastFour(key: string): string {
  return key.slice(-4);
}

type Fetch = typeof fetch;

export type WonderJobsOptions = {
  key: string;
  base?: string;
  fetch?: Fetch;
  timeoutMs?: number;
  now?: () => number;
};

type Cached = { at: number; value: { site: CareerSite; jobs: CareerJob[] } };
// Per server, per key: a new or rotated key never reads another key's list.
const jobListCache = new Map<string, Cached>();

/** For tests and for a key change: forget the cached job lists. */
export function clearCareersCache(): void {
  jobListCache.clear();
}

function siteOf(raw: z.infer<typeof SiteSchema> | null | undefined): CareerSite {
  return { name: raw?.name ?? "", retentionMonths: raw?.retentionMonths ?? null };
}

function retryAfter(header: string | null, now: number): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(Math.ceil(seconds), 3600);
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, Math.min(Math.ceil((at - now) / 1000), 3600)) : null;
}

/** "/jobs/{id}/applications" → "jobs/:id/applications": what a log line may name. */
function endpointName(path: string): string {
  return path.replace(/^\//, "").replace(/^jobs\/[^/]+/, "jobs/:id");
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,120}$/;

export function createWonderJobsClient(options: WonderJobsOptions) {
  const base = options.base ?? WONDERJOBS_BASE;
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? WONDERJOBS_TIMEOUT_MS;
  const now = options.now ?? Date.now;

  async function call<T>(path: string, schema: z.ZodType<T>, init: { method: "GET" | "POST"; body?: unknown; jobId?: string }): Promise<CareersResult<T>> {
    const attempts = init.method === "GET" ? 2 : 1;
    const endpoint = endpointName(path);
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const started = now();
      let status = 0;
      try {
        const response = await doFetch(`${base}/api/careers/v1${path}`, {
          method: init.method,
          headers: {
            authorization: `Bearer ${options.key}`,
            accept: "application/json",
            ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
          },
          body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(timeoutMs),
        });
        status = response.status;
        log.info("wonderjobs call", { endpoint, jobId: init.jobId, status, ms: now() - started });
        const json: unknown = await response.json().catch(() => null);
        if (response.ok) {
          const parsed = schema.safeParse(json);
          return parsed.success ? { state: "ok", data: parsed.data } : { state: "unavailable" };
        }
        if (status === 404) return { state: "not_found" };
        if (status === 400 || status === 409) {
          const message = typeof (json as { error?: unknown } | null)?.error === "string" ? String((json as { error: string }).error).slice(0, 500) : "Check the details and try again.";
          return { state: "rejected", status, message };
        }
        if (status === 401) return { state: "wrong_key" };
        if (status === 429) return { state: "busy", retryAfterSeconds: retryAfter(response.headers.get("retry-after"), now()) };
        if (status < 500) return { state: "unavailable" };
        // A 5xx: a GET tries once more.
      } catch (thrown) {
        log.warn("wonderjobs unreachable", { endpoint, jobId: init.jobId, reason: thrown instanceof Error ? thrown.name : "unknown", ms: now() - started });
      }
    }
    return { state: "unavailable" };
  }

  return {
    /** The open jobs linked to this site, kept for up to 60 s per server. */
    async listJobs(): Promise<CareersResult<{ site: CareerSite; jobs: CareerJob[] }>> {
      const cacheKey = `${base} ${options.key}`;
      const cached = jobListCache.get(cacheKey);
      if (cached && now() - cached.at < JOB_LIST_CACHE_MS) return { state: "ok", data: cached.value };
      const result = await call("/jobs", ListSchema, { method: "GET" });
      if (result.state !== "ok") return result;
      const value = { site: siteOf(result.data.site), jobs: result.data.jobs };
      jobListCache.set(cacheKey, { at: now(), value });
      return { state: "ok", data: value };
    },

    async getJob(id: string): Promise<CareersResult<{ site: CareerSite; job: CareerJob }>> {
      if (!SAFE_ID.test(id)) return { state: "not_found" };
      const result = await call(`/jobs/${encodeURIComponent(id)}`, JobResponseSchema, { method: "GET", jobId: id });
      return result.state === "ok" ? { state: "ok", data: { site: siteOf(result.data.site), job: result.data.job } } : result;
    },

    /** Success only on a 200 from WonderJobs; never retried. */
    async apply(jobId: string, input: ApplicationInput): Promise<CareersResult<{ id: string }>> {
      if (!SAFE_ID.test(jobId)) return { state: "not_found" };
      const result = await call(`/jobs/${encodeURIComponent(jobId)}/applications`, AppliedSchema, { method: "POST", body: input, jobId });
      return result.state === "ok" ? { state: "ok", data: { id: result.data.id } } : result;
    },

    /** The token travels in the body, never in a URL this server requests. */
    async status(token: string, action: "view" | "withdraw"): Promise<CareersResult<ApplicationStatus>> {
      if (!/^[A-Za-z0-9_.~-]{16,400}$/.test(token)) return { state: "not_found" };
      const result = await call("/applications/status", StatusSchema, { method: "POST", body: { token, action } });
      return result.state === "ok" ? { state: "ok", data: result.data.application } : result;
    },
  };
}

export type WonderJobsClient = ReturnType<typeof createWonderJobsClient>;

/**
 * "Test connection": Connected with the job count, Wrong key, or Unavailable.
 * A direct read, never the cached list, so a new key is really tried.
 */
export async function testCareersConnection(options: WonderJobsOptions): Promise<{ state: "connected"; jobs: number; site: string } | { state: "wrong_key" } | { state: "unavailable" }> {
  clearCareersCache();
  const result = await createWonderJobsClient(options).listJobs();
  if (result.state === "ok") return { state: "connected", jobs: result.data.jobs.length, site: result.data.site.name };
  if (result.state === "wrong_key") return { state: "wrong_key" };
  return { state: "unavailable" };
}
