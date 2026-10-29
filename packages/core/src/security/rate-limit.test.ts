import { beforeEach, describe, expect, it } from "vitest";

import { setLogSink } from "../observability/logger";
import { RATE_LIMITS, RATE_LIMIT_SCOPES, hitRateLimit, hitRateLimitFair, noteRejection } from "./rate-limit";

type Call = { p_bucket: string; p_subject: string };
function fakeAdmin(answer: (call: Call) => boolean | Error) {
  const calls: Call[] = [];
  return {
    calls,
    rpc: async (_name: string, args: Call) => {
      calls.push(args);
      const r = answer(args);
      return r instanceof Error ? { data: null, error: Object.assign(r, { code: "XX000" }) } : { data: r, error: null };
    },
  } as never;
}

describe("rate limit observability and fairness (SEC-06)", () => {
  const lines: Record<string, unknown>[] = [];
  beforeEach(() => {
    lines.length = 0;
    setLogSink((r) => lines.push(r));
  });

  it("scopes every bucket", () => {
    expect(Object.keys(RATE_LIMIT_SCOPES).sort()).toEqual(Object.keys(RATE_LIMITS).sort());
  });

  it("logs a rejection with the limiter and scope, a digest instead of the subject, and summarises the flood", () => {
    const secret = "member-0123456789abcdef-0123";
    const admin = fakeAdmin(() => false);
    return (async () => {
      for (let i = 0; i < 30; i++) await hitRateLimit(admin, "homesend.link", secret);
      expect(JSON.stringify(lines)).not.toContain(secret.slice(0, 8));
      const first = lines.filter((l) => l.message === "rate limit reached");
      expect(first).toHaveLength(1);
      expect(first[0]).toMatchObject({ event: "rate_limit_rejected", limiter: "homesend.link", scope: "member" });
      noteRejection("homesend.link", secret, Date.now() + 61_000);
      expect(lines.find((l) => l.message === "rate limit summary")).toMatchObject({ rejected: 30, distinctSubjects: 1 });
    })();
  });

  it("raises an error-level event when the counter is unreachable, and still lets the request through", async () => {
    const admin = fakeAdmin(() => new Error("db down"));
    expect(await hitRateLimit(admin, "ai.model", "h1")).toBe(true);
    expect(lines.find((l) => l.message === "rate limit unavailable; allowing")).toMatchObject({ level: "error", event: "rate_limit_unavailable", limiter: "ai.model" });
  });

  it("counts a household's shared allowance across its members, and refuses one member before touching it", async () => {
    const counts = new Map<string, number>();
    const admin = fakeAdmin(({ p_bucket, p_subject }) => {
      const key = `${p_bucket}:${p_subject}`;
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return n <= RATE_LIMITS[p_bucket as keyof typeof RATE_LIMITS].max;
    });
    const max = RATE_LIMITS["homesend.intake.household"].max;
    let refused = 0;
    // Ten members each well under their own limit, together over the household's.
    for (let i = 0; i < max + 20; i++) {
      if (!(await hitRateLimitFair(admin, "homesend.intake", { memberId: `m${i % 10}`, householdId: "h1" }))) refused += 1;
    }
    expect(refused).toBe(20);
    expect(await hitRateLimitFair(admin, "homesend.intake", { memberId: "m0", householdId: "h2" })).toBe(true);
    // A member over their own limit is refused without spending the household's allowance.
    const before = counts.get("homesend.intake.household:h3") ?? 0;
    for (let i = 0; i < RATE_LIMITS["homesend.intake"].max + 5; i++) await hitRateLimitFair(admin, "homesend.intake", { memberId: "solo", householdId: "h3" });
    expect((counts.get("homesend.intake.household:h3") ?? 0) - before).toBe(RATE_LIMITS["homesend.intake"].max);
  });
});
