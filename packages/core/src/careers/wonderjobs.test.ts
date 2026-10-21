import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { log } from "../observability/logger";
import { careersBase, clearCareersCache, createWonderJobsClient, maskCareersKey, testCareersConnection, WONDERJOBS_BASE } from "./wonderjobs";

const KEY = "wjcs_live_0123456789abcdefWXYZ";

const job = {
  id: "job_1",
  title: "Product designer",
  location: "Pune",
  workMode: "hybrid",
  jobType: "full_time",
  salaryMin: 1200000,
  salaryMax: 1800000,
  currency: "INR",
  description: "Design calm screens.",
  skills: ["Figma"],
  company: "WonderHome",
  updatedAt: "2026-10-20T10:00:00Z",
};

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

type Call = { url: string; init: RequestInit };

function fakeFetch(...responses: (Response | Error)[]) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return next;
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

beforeEach(() => clearCareersCache());
afterEach(() => vi.restoreAllMocks());

describe("WonderJobs' address", () => {
  it("is fixed, and an override is honoured only for an https host on wonderapps.biz", () => {
    expect(careersBase(undefined)).toBe(WONDERJOBS_BASE);
    expect(careersBase("")).toBe(WONDERJOBS_BASE);
    expect(careersBase("https://jobs-staging.wonderapps.biz/")).toBe("https://jobs-staging.wonderapps.biz");
    expect(careersBase("http://jobs.wonderapps.biz")).toBeNull();
    expect(careersBase("https://wonderapps.biz.evil.com")).toBeNull();
    expect(careersBase("https://evilwonderapps.biz")).toBeNull();
    expect(careersBase("https://user:pass@jobs.wonderapps.biz")).toBeNull();
    expect(careersBase("https://jobs.wonderapps.biz:8443")).toBeNull();
    expect(careersBase("not a url")).toBeNull();
  });

  it("shows a key only as its mask", () => {
    expect(maskCareersKey("WXYZ")).toBe("wjcs_••••••••WXYZ");
    expect(maskCareersKey(null)).toBeNull();
  });
});

describe("the client", () => {
  it("sends the key as a Bearer header from the server, never caching", async () => {
    const fetch = fakeFetch(json(200, { site: { name: "WonderHome careers", retentionMonths: 12 }, jobs: [job] }));
    const result = await createWonderJobsClient({ key: KEY, fetch: fetch.fn }).listJobs();
    expect(result).toEqual({ state: "ok", data: { site: { name: "WonderHome careers", retentionMonths: 12 }, jobs: [job] } });
    expect(fetch.calls[0]!.url).toBe("https://jobs.wonderapps.biz/api/careers/v1/jobs");
    expect((fetch.calls[0]!.init.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
    expect(fetch.calls[0]!.init.cache).toBe("no-store");
  });

  it("never puts the key in a result, a message or a log line", async () => {
    const logged: string[] = [];
    vi.spyOn(log, "info").mockImplementation((message, fields) => void logged.push(`${message} ${JSON.stringify(fields)}`));
    vi.spyOn(log, "warn").mockImplementation((message, fields) => void logged.push(`${message} ${JSON.stringify(fields)}`));
    const fetch = fakeFetch(json(401, { error: "bad key" }), new Error(`connect failed for ${KEY}`), new Error(`connect failed for ${KEY}`), json(500, {}), json(500, {}));
    const client = createWonderJobsClient({ key: KEY, fetch: fetch.fn });
    const results = [await client.listJobs(), (clearCareersCache(), await client.listJobs()), (clearCareersCache(), await client.listJobs())];
    for (const result of results) expect(JSON.stringify(result)).not.toContain(KEY);
    expect(logged.join("\n")).not.toContain(KEY);
    expect(results.map((result) => result.state)).toEqual(["wrong_key", "unavailable", "unavailable"]);
  });

  it("gives up after its timeout", async () => {
    const hanging = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("timed out", "TimeoutError"))))) as unknown as typeof fetch;
    const started = Date.now();
    const result = await createWonderJobsClient({ key: KEY, fetch: hanging, timeoutMs: 30 }).getJob("job_1");
    expect(result).toEqual({ state: "unavailable" });
    // Two tries of 30 ms each, not the 8 s default.
    expect(Date.now() - started).toBeLessThan(2000);
    expect(hanging).toHaveBeenCalledTimes(2);
  });

  it("retries a GET once on a 5xx or a network error, and not again", async () => {
    const after5xx = fakeFetch(json(503, {}), json(200, { job, site: { name: "x", retentionMonths: null } }));
    expect((await createWonderJobsClient({ key: KEY, fetch: after5xx.fn }).getJob("job_1")).state).toBe("ok");
    expect(after5xx.calls).toHaveLength(2);

    const afterNetwork = fakeFetch(new TypeError("fetch failed"), json(500, {}), json(200, {}));
    expect((await createWonderJobsClient({ key: KEY, fetch: afterNetwork.fn }).getJob("job_1")).state).toBe("unavailable");
    expect(afterNetwork.calls).toHaveLength(2);
  });

  it("never retries a POST", async () => {
    const applying = fakeFetch(json(502, {}), json(200, { ok: true, id: "app_1" }));
    const input = { name: "Asha", email: "asha@example.com", resumeUrl: "https://drive.google.com/x", consent: true as const };
    expect((await createWonderJobsClient({ key: KEY, fetch: applying.fn }).apply("job_1", input)).state).toBe("unavailable");
    expect(applying.calls).toHaveLength(1);

    const offline = fakeFetch(new TypeError("fetch failed"), json(200, { ok: true, id: "app_1" }));
    expect((await createWonderJobsClient({ key: KEY, fetch: offline.fn }).status("wjst_0123456789abcdefghij", "withdraw")).state).toBe("unavailable");
    expect(offline.calls).toHaveLength(1);
  });

  it("maps 401, 404, 409 and 429 to their own answers", async () => {
    const make = (response: Response) => createWonderJobsClient({ key: KEY, fetch: fakeFetch(response).fn });
    const input = { name: "Asha", email: "asha@example.com", resumeUrl: "https://drive.google.com/x", consent: true as const };
    expect(await make(json(401, { error: "revoked" })).getJob("job_1")).toEqual({ state: "wrong_key" });
    expect(await make(json(404, { error: "closed" })).getJob("job_1")).toEqual({ state: "not_found" });
    expect(await make(json(409, { error: "You've already applied for this job." })).apply("job_1", input)).toEqual({ state: "rejected", status: 409, message: "You've already applied for this job." });
    expect(await make(json(400, { error: "Résumé link must be https." })).apply("job_1", input)).toEqual({ state: "rejected", status: 400, message: "Résumé link must be https." });
    expect(await make(json(429, { error: "slow down" }, { "retry-after": "30" })).apply("job_1", input)).toEqual({ state: "busy", retryAfterSeconds: 30 });
  });

  it("succeeds only on a 200 with WonderJobs' own answer", async () => {
    const input = { name: "Asha", email: "asha@example.com", resumeUrl: "https://drive.google.com/x", consent: true as const };
    const ok = fakeFetch(json(200, { ok: true, id: "app_9" }));
    expect(await createWonderJobsClient({ key: KEY, fetch: ok.fn }).apply("job_1", input)).toEqual({ state: "ok", data: { id: "app_9" } });
    expect(JSON.parse(String(ok.calls[0]!.init.body))).toEqual(input);
    const odd = fakeFetch(json(200, { surprising: true }));
    expect((await createWonderJobsClient({ key: KEY, fetch: odd.fn }).apply("job_1", input)).state).toBe("unavailable");
  });

  it("sends the status token in the body, never in a URL it requests", async () => {
    const token = "wjst_secret_token_0123456789";
    const fetch = fakeFetch(json(200, { application: { status: "reviewing", statusLabel: "In review", jobTitle: "Designer", company: "WonderHome", appliedAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z", canWithdraw: true } }));
    const result = await createWonderJobsClient({ key: KEY, fetch: fetch.fn }).status(token, "view");
    expect(result.state).toBe("ok");
    expect(fetch.calls[0]!.url).toBe("https://jobs.wonderapps.biz/api/careers/v1/applications/status");
    expect(fetch.calls[0]!.url).not.toContain(token);
    expect(fetch.calls[0]!.init.method).toBe("POST");
    expect(JSON.parse(String(fetch.calls[0]!.init.body))).toEqual({ token, action: "view" });
  });

  it("keeps the job list for up to a minute, and never the status", async () => {
    let now = 1_000_000;
    const listing = { site: { name: "x", retentionMonths: 6 }, jobs: [job] };
    const fetch = fakeFetch(json(200, listing), json(200, listing));
    const client = createWonderJobsClient({ key: KEY, fetch: fetch.fn, now: () => now });
    await client.listJobs();
    now += 59_000;
    await client.listJobs();
    expect(fetch.calls).toHaveLength(1);
    now += 2_000;
    await client.listJobs();
    expect(fetch.calls).toHaveLength(2);

    const status = { application: { status: "new", statusLabel: "New", jobTitle: "x", company: "", appliedAt: "a", updatedAt: "b", canWithdraw: false } };
    const statusFetch = fakeFetch(json(200, status), json(200, status));
    const statusClient = createWonderJobsClient({ key: KEY, fetch: statusFetch.fn });
    await statusClient.status("wjst_0123456789abcdefghij", "view");
    await statusClient.status("wjst_0123456789abcdefghij", "view");
    expect(statusFetch.calls).toHaveLength(2);
  });

  it("refuses an id or token that could change the path before any call", async () => {
    const fetch = fakeFetch();
    const client = createWonderJobsClient({ key: KEY, fetch: fetch.fn });
    expect(await client.getJob("../admin")).toEqual({ state: "not_found" });
    expect(await client.status("short", "view")).toEqual({ state: "not_found" });
    expect(fetch.calls).toHaveLength(0);
  });
});

describe("Test connection", () => {
  it("reports Connected with the job count, Wrong key, or Unavailable", async () => {
    expect(await testCareersConnection({ key: KEY, fetch: fakeFetch(json(200, { site: { name: "WonderHome careers", retentionMonths: 12 }, jobs: [job, { ...job, id: "job_2" }] })).fn })).toEqual({ state: "connected", jobs: 2, site: "WonderHome careers" });
    expect(await testCareersConnection({ key: KEY, fetch: fakeFetch(json(401, {})).fn })).toEqual({ state: "wrong_key" });
    expect(await testCareersConnection({ key: KEY, fetch: fakeFetch(json(500, {}), json(500, {})).fn })).toEqual({ state: "unavailable" });
  });
});
