import { describe, expect, it, vi } from "vitest";

import { checkApplication } from "./application";
import { consentText, descriptionBlocks, jobFacts, jobPostingJsonLd, salaryRange } from "./format";
import { careersKeyStatus, clearCareersKey, readCareersKey, saveCareersKey } from "./key-store";
import type { CareerJob } from "./wonderjobs";

const job: CareerJob = {
  id: "job_1",
  title: "Product designer",
  location: "Pune",
  workMode: "hybrid",
  jobType: "full_time",
  salaryMin: 1200000,
  salaryMax: 1800000,
  currency: "INR",
  description: "About the role:\nDesign calm screens.\n\nYou will:\n- Sketch\n- Test with families",
  skills: ["Figma", "Research"],
  company: "WonderHome",
  updatedAt: "2026-10-20T10:00:00Z",
};

describe("the consent line", () => {
  it("names the retention period WonderJobs gives, and none when it gives none", () => {
    expect(consentText("WonderHome", 12)).toBe("I agree that WonderHome stores my application to consider me for this and similar roles, and deletes it 12 months after its last update.");
    expect(consentText("WonderHome", 1)).toContain("deletes it 1 month after");
    expect(consentText("WonderHome", null)).toBe("I agree that WonderHome stores my application to consider me for this and similar roles.");
  });
});

describe("a job as it reads", () => {
  it("lists its facts, with pay only when given", () => {
    expect(jobFacts(job)).toEqual(["Pune", "Hybrid", "Full-time", salaryRange(job)]);
    expect(salaryRange({ salaryMin: null, salaryMax: null, currency: "INR" })).toBeNull();
    expect(salaryRange({ salaryMin: 90000, salaryMax: null, currency: "USD" })).toBe("From $90,000");
    expect(jobFacts({ ...job, location: "", jobType: null, salaryMin: null, salaryMax: null, workMode: "remote" })).toEqual(["Remote"]);
  });

  it("reads a description's shape and keeps every word as text", () => {
    expect(descriptionBlocks(job.description)).toEqual([
      { kind: "heading", text: "About the role" },
      { kind: "paragraph", text: "Design calm screens." },
      { kind: "heading", text: "You will" },
      { kind: "list", items: ["Sketch", "Test with families"] },
    ]);
    expect(descriptionBlocks("<script>alert(1)</script>")).toEqual([{ kind: "paragraph", text: "<script>alert(1)</script>" }]);
  });

  it("writes JobPosting JSON-LD that can't close its own script", () => {
    const text = jobPostingJsonLd({ ...job, description: "</script><script>alert(1)</script>" }, "https://home.wonderapps.biz/careers/job_1", "WonderHome");
    expect(text).not.toContain("</script>");
    const data = JSON.parse(text) as Record<string, unknown>;
    expect(data["@type"]).toBe("JobPosting");
    expect(data.employmentType).toBe("FULL_TIME");
    expect(data.description).toBe("</script><script>alert(1)</script>");
    expect((data.baseSalary as { currency: string }).currency).toBe("INR");
  });
});

describe("an application, checked before it is forwarded", () => {
  const valid = { name: "  Asha Rao ", email: "ASHA@example.com", resumeUrl: "https://drive.google.com/file/1", consent: true };

  it("trims and keeps only what was given", () => {
    expect(checkApplication(valid)).toEqual({ ok: true, input: { name: "Asha Rao", email: "asha@example.com", resumeUrl: "https://drive.google.com/file/1", consent: true } });
  });

  it("names the field that is wrong", () => {
    expect(checkApplication({ ...valid, name: "" })).toMatchObject({ ok: false, field: "name" });
    expect(checkApplication({ ...valid, email: "not-an-email" })).toMatchObject({ ok: false, field: "email" });
    expect(checkApplication({ ...valid, resumeUrl: "http://drive.google.com/x" })).toMatchObject({ ok: false, field: "resumeUrl" });
    expect(checkApplication({ ...valid, resumeUrl: "javascript:alert(1)" })).toMatchObject({ ok: false, field: "resumeUrl" });
    expect(checkApplication({ ...valid, resumeUrl: "" })).toMatchObject({ ok: false, field: "resumeUrl" });
    expect(checkApplication({ ...valid, linkedinUrl: "ftp://x.com" })).toMatchObject({ ok: false, field: "linkedinUrl" });
    expect(checkApplication({ ...valid, coverNote: "x".repeat(4001) })).toMatchObject({ ok: false, field: "coverNote" });
    expect(checkApplication({ ...valid, coverNote: "x".repeat(4000) }).ok).toBe(true);
    expect(checkApplication({ ...valid, name: "x".repeat(121) })).toMatchObject({ ok: false, field: "name" });
    expect(checkApplication({ ...valid, consent: false })).toMatchObject({ ok: false, field: "consent" });
  });
});

type Rpc = (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string } | null }>;
const adminWith = (rpc: Rpc) => ({ rpc: vi.fn(rpc) }) as unknown as Parameters<typeof readCareersKey>[0] & { rpc: ReturnType<typeof vi.fn> };

const KEY = "wjcs_live_0123456789abcdefWXYZ";

describe("the key setting", () => {
  it("reads the saved key first, and the environment only when none is saved", async () => {
    expect(await readCareersKey(adminWith(async () => ({ data: KEY, error: null })), { WONDERJOBS_CAREERS_KEY: "wjcs_env_0123456789abcdefENVV" })).toEqual({ key: KEY, source: "database" });
    expect(await readCareersKey(adminWith(async () => ({ data: null, error: null })), { WONDERJOBS_CAREERS_KEY: "wjcs_env_0123456789abcdefENVV" })).toEqual({ key: "wjcs_env_0123456789abcdefENVV", source: "environment" });
    expect(await readCareersKey(adminWith(async () => ({ data: null, error: { code: "42883" } })), {})).toBeNull();
  });

  it("shows only a mask, never the key", async () => {
    const status = await careersKeyStatus(adminWith(async () => ({ data: [{ key_last4: "WXYZ", updated_at: "2026-10-21T10:00:00Z" }], error: null })), {});
    expect(status).toEqual({ configured: true, source: "database", masked: "wjcs_••••••••WXYZ", updatedAt: "2026-10-21T10:00:00Z" });
    expect(JSON.stringify(status)).not.toContain("0123456789");
    const fromEnv = await careersKeyStatus(adminWith(async () => ({ data: [], error: null })), { WONDERJOBS_CAREERS_KEY: "wjcs_env_0123456789abcdefENVV" });
    expect(fromEnv).toEqual({ configured: true, source: "environment", masked: "wjcs_••••••••ENVV", updatedAt: null });
  });

  it("saves through the audited database function, with who did it", async () => {
    const admin = adminWith(async () => ({ data: "WXYZ", error: null }));
    expect(await saveCareersKey(admin, "profile-1", `  ${KEY} `)).toEqual({ ok: true, masked: "wjcs_••••••••WXYZ" });
    expect(admin.rpc).toHaveBeenCalledWith("careers_key_set", { p_key: KEY, p_actor: "profile-1" });
  });

  it("refuses something that isn't a career-site key without storing it", async () => {
    const admin = adminWith(async () => ({ data: null, error: null }));
    expect(await saveCareersKey(admin, "profile-1", "sk-not-a-key")).toEqual({ ok: false, reason: "invalid" });
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("clears through the audited database function, with who did it", async () => {
    const admin = adminWith(async () => ({ data: null, error: null }));
    expect(await clearCareersKey(admin, "profile-2")).toBe(true);
    expect(admin.rpc).toHaveBeenCalledWith("careers_key_clear", { p_actor: "profile-2" });
  });
});
