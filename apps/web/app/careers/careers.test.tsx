import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The careers pages and actions with WonderJobs mocked: never a call to
 * production from a unit test.
 */

const state = vi.hoisted(() => ({
  connection: { state: "needs_setup" } as Record<string, unknown>,
  staff: null as null | { profileId: string; role: string },
  allowed: true,
  ip: "203.0.113.9" as string | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers(state.ip ? { "x-forwarded-for": state.ip } : {}) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@wonderhome/core/db/admin", () => ({ createAdminClient: () => ({ rpc: vi.fn() }) }));
vi.mock("@wonderhome/core/security/rate-limit", () => ({ hitRateLimit: vi.fn(async () => state.allowed) }));
vi.mock("../_lib/careers", () => ({
  CAREERS_APP_NAME: "WonderHome",
  careersConnection: vi.fn(async () => state.connection),
  careersStaff: vi.fn(async () => state.staff),
}));

const { applyAction, withdrawAction } = await import("./actions");
const CareersPage = (await import("./page")).default;
const CareerJobPage = (await import("./[id]/page")).default;
const StatusPage = (await import("./status/page")).default;
const statusModule = await import("./status/page");

const job = {
  id: "job_1",
  title: "Product designer",
  location: "Pune",
  workMode: "hybrid" as const,
  jobType: "full_time",
  salaryMin: 1200000,
  salaryMax: 1800000,
  currency: "INR",
  description: "Design calm screens.\n\n<b>not html</b>",
  skills: ["Figma"],
  company: "WonderHome",
  updatedAt: "2026-10-20T10:00:00Z",
};

function client(overrides: Record<string, unknown> = {}) {
  return {
    listJobs: vi.fn(async () => ({ state: "ok", data: { site: { name: "WonderHome careers", retentionMonths: 12 }, jobs: [job] } })),
    getJob: vi.fn(async () => ({ state: "ok", data: { site: { name: "WonderHome careers", retentionMonths: 12 }, job } })),
    apply: vi.fn(async () => ({ state: "ok", data: { id: "app_1" } })),
    status: vi.fn(async () => ({ state: "ok", data: { status: "reviewing", statusLabel: "In review", jobTitle: "Product designer", company: "WonderHome", appliedAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z", canWithdraw: true } })),
    ...overrides,
  };
}

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

const applying = { jobId: "job_1", name: "Asha Rao", email: "asha@example.com", resumeUrl: "https://drive.google.com/file/1", consent: "on" };

const html = async (element: Promise<React.ReactElement> | React.ReactElement) => renderToStaticMarkup(await element);

beforeEach(() => {
  state.connection = { state: "needs_setup" };
  state.staff = null;
  state.allowed = true;
  state.ip = "203.0.113.9";
});

describe("applying", () => {
  it("checks the details on the server before anything is forwarded", async () => {
    const wonderjobs = client();
    state.connection = { state: "ready", client: wonderjobs };
    expect(await applyAction({ status: "idle" }, form({ ...applying, resumeUrl: "http://insecure.example.com" }))).toMatchObject({ status: "error", field: "resumeUrl" });
    expect(await applyAction({ status: "idle" }, form({ ...applying, consent: "" }))).toMatchObject({ status: "error", field: "consent" });
    expect(wonderjobs.apply).not.toHaveBeenCalled();
  });

  it("pretends success for a filled honeypot and never calls WonderJobs", async () => {
    const wonderjobs = client();
    state.connection = { state: "ready", client: wonderjobs };
    expect(await applyAction({ status: "idle" }, form({ ...applying, website: "https://spam.example" }))).toEqual({ status: "sent" });
    expect(wonderjobs.apply).not.toHaveBeenCalled();
  });

  it("is limited per address", async () => {
    const wonderjobs = client();
    state.connection = { state: "ready", client: wonderjobs };
    state.allowed = false;
    expect(await applyAction({ status: "idle" }, form(applying))).toMatchObject({ status: "error", message: expect.stringContaining("Too many applications") });
    expect(wonderjobs.apply).not.toHaveBeenCalled();
  });

  it("says sent only after WonderJobs' 200, and passes a 400 or 409 message on as it is", async () => {
    state.connection = { state: "ready", client: client() };
    expect(await applyAction({ status: "idle" }, form(applying))).toEqual({ status: "sent" });
    state.connection = { state: "ready", client: client({ apply: vi.fn(async () => ({ state: "rejected", status: 409, message: "You've already applied for this job." })) }) };
    expect(await applyAction({ status: "idle" }, form(applying))).toEqual({ status: "error", message: "You've already applied for this job." });
    state.connection = { state: "ready", client: client({ apply: vi.fn(async () => ({ state: "not_found" })) }) };
    expect(await applyAction({ status: "idle" }, form(applying))).toEqual({ status: "closed" });
    state.connection = { state: "ready", client: client({ apply: vi.fn(async () => ({ state: "unavailable" })) }) };
    expect(await applyAction({ status: "idle" }, form(applying))).toMatchObject({ status: "error", message: expect.stringContaining("try again") });
    state.connection = { state: "needs_setup" };
    expect((await applyAction({ status: "idle" }, form(applying))).status).toBe("error");
  });

  it("forwards only the checked fields", async () => {
    const wonderjobs = client();
    state.connection = { state: "ready", client: wonderjobs };
    await applyAction({ status: "idle" }, form({ ...applying, name: "  Asha Rao  ", extra: "ignored" }));
    expect(wonderjobs.apply).toHaveBeenCalledWith("job_1", { name: "Asha Rao", email: "asha@example.com", resumeUrl: "https://drive.google.com/file/1", consent: true });
  });
});

describe("the job list", () => {
  it("lists WonderJobs' jobs with their facts and skills, linking to each", async () => {
    state.connection = { state: "ready", client: client() };
    const page = await html(CareersPage());
    expect(page).toContain("Product designer");
    expect(page).toContain('href="/careers/job_1"');
    expect(page).toContain("Hybrid");
    expect(page).toContain("Figma");
  });

  it("says there are none, never a placeholder or a sample", async () => {
    state.connection = { state: "ready", client: client({ listJobs: vi.fn(async () => ({ state: "ok", data: { site: { name: "x", retentionMonths: null }, jobs: [] } })) }) };
    const page = await html(CareersPage());
    expect(page).toContain("No open positions right now");
    expect(page).not.toMatch(/sample|lorem|example job/i);
  });

  it("isn't set up without a key, with the reason for admins only", async () => {
    const visitor = await html(CareersPage());
    expect(visitor).toContain("Careers isn&#x27;t set up yet");
    expect(visitor).not.toContain("Admins only");
    state.staff = { profileId: "p1", role: "owner" };
    expect(await html(CareersPage())).toContain("Admins only");
  });

  it("is unavailable when WonderJobs can't be reached, with a way to try again", async () => {
    state.connection = { state: "ready", client: client({ listJobs: vi.fn(async () => ({ state: "unavailable" })) }) };
    const page = await html(CareersPage());
    expect(page).toContain("Careers is unavailable right now");
    expect(page).toContain("Try again");
  });
});

describe("a job's page", () => {
  it("shows the description as text, the form, and the retention period WonderJobs gives", async () => {
    state.connection = { state: "ready", client: client() };
    const page = await html(CareerJobPage({ params: Promise.resolve({ id: "job_1" }) }));
    expect(page).toContain("&lt;b&gt;not html&lt;/b&gt;");
    expect(page).not.toContain("<b>not html</b>");
    expect(page).toContain("deletes it 12 months after its last update");
    expect(page).toContain('name="website"');
    expect(page).toContain('"@type":"JobPosting"');
  });

  it("leaves the period out when WonderJobs gives none", async () => {
    state.connection = { state: "ready", client: client({ getJob: vi.fn(async () => ({ state: "ok", data: { site: { name: "x", retentionMonths: null }, job } })) }) };
    const page = await html(CareerJobPage({ params: Promise.resolve({ id: "job_1" }) }));
    expect(page).toContain("considers me for this and similar roles".replace("considers", "consider"));
    expect(page).not.toContain("deletes it");
  });

  it("says a closed position is no longer open, with the way back", async () => {
    state.connection = { state: "ready", client: client({ getJob: vi.fn(async () => ({ state: "not_found" })) }) };
    const page = await html(CareerJobPage({ params: Promise.resolve({ id: "job_9" }) }));
    expect(page).toContain("This position is no longer open");
    expect(page).toContain('href="/careers"');
  });
});

describe("an applicant's status", () => {
  it("is never indexed and never sent on as a referrer", () => {
    expect(statusModule.metadata).toMatchObject({ robots: { index: false, follow: false }, referrer: "no-referrer" });
  });

  it("sends the token to WonderJobs in a body, and shows the status with Withdraw", async () => {
    const wonderjobs = client();
    state.connection = { state: "ready", client: wonderjobs };
    const page = await html(StatusPage({ searchParams: Promise.resolve({ t: "wjst_secret_token_0123456789" }) }));
    expect(wonderjobs.status).toHaveBeenCalledWith("wjst_secret_token_0123456789", "view");
    expect(page).toContain("In review");
    expect(page).toContain("Withdraw my application");
  });

  it("can't find a missing or unknown token", async () => {
    expect(await html(StatusPage({ searchParams: Promise.resolve({}) }))).toContain("We couldn’t find that application. Use the link in your email.");
    state.connection = { state: "ready", client: client({ status: vi.fn(async () => ({ state: "not_found" })) }) };
    expect(await html(StatusPage({ searchParams: Promise.resolve({ t: "wjst_unknown_token_0123456789" }) }))).toContain("We couldn’t find that application");
  });

  it("withdraws through this app's server, with the token from the form", async () => {
    const wonderjobs = client({ status: vi.fn(async () => ({ state: "ok", data: { status: "withdrawn", statusLabel: "Withdrawn", jobTitle: "x", company: "", appliedAt: "a", updatedAt: "b", canWithdraw: false } })) });
    state.connection = { state: "ready", client: wonderjobs };
    expect(await withdrawAction({ status: "idle" }, form({ token: "wjst_secret_token_0123456789" }))).toMatchObject({ status: "done" });
    expect(wonderjobs.status).toHaveBeenCalledWith("wjst_secret_token_0123456789", "withdraw");
  });
});
