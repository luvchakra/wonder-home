import { describe, expect, it, vi } from "vitest";

import { addPortalScrapeUrl } from "./scrape-url-repository";

function fakeSupabase() {
  const insert = vi.fn(async (_row: Record<string, unknown>) => ({ error: null }));
  const from = vi.fn(() => ({ insert }));
  return { client: { from } as never, insert, from };
}

const PORTAL = "https://www.looplearning.com/login";

describe("addPortalScrapeUrl", () => {
  it("rejects an off-site page before any write (SSRF)", async () => {
    const f = fakeSupabase();
    await expect(
      addPortalScrapeUrl(f.client, {
        householdId: "h",
        integrationId: "i",
        portalUrl: PORTAL,
        url: "https://evil.example.com/x",
        kind: "homework",
        createdBy: "m",
      }),
    ).rejects.toThrow(/different site/i);
    expect(f.from).not.toHaveBeenCalled();
  });

  it("rejects a non-https page before any write", async () => {
    const f = fakeSupabase();
    await expect(
      addPortalScrapeUrl(f.client, { householdId: "h", integrationId: "i", portalUrl: PORTAL, url: "http://www.looplearning.com/x", kind: "generic", createdBy: "m" }),
    ).rejects.toThrow(/https/i);
    expect(f.from).not.toHaveBeenCalled();
  });

  it("stores a same-site https page", async () => {
    const f = fakeSupabase();
    await addPortalScrapeUrl(f.client, {
      householdId: "h",
      integrationId: "i",
      portalUrl: PORTAL,
      url: "https://app.looplearning.com/task/list?range=1d",
      kind: "homework",
      createdBy: "m",
    });
    expect(f.insert).toHaveBeenCalledOnce();
    const row = f.insert.mock.calls[0]![0];
    expect(row.url).toBe("https://app.looplearning.com/task/list?range=1d");
    expect(row.kind).toBe("homework");
  });
});
