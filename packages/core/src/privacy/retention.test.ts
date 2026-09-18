import { describe, expect, it } from "vitest";

import {
  DELETION_GRACE_DAYS,
  RETENTION,
  actsAt,
  describeDays,
  isExpired,
  retentionSchedule,
} from "./retention";

/**
 * The retention schedule (story 15-007).
 *
 * A retention policy shown on a screen but not applied by the code is worse
 * than no policy, because it is a promise. These tests hold the numbers to the
 * shape the Privacy Centre claims for them.
 */

const NOW = new Date("2026-09-19T12:00:00.000Z");

describe("the schedule", () => {
  it("gives every class a reason, not just a number", () => {
    for (const [key, rule] of Object.entries(RETENTION)) {
      expect(rule.label.length, key).toBeGreaterThan(5);
      expect(rule.because.length, key).toBeGreaterThan(20);
    }
  });

  it("keeps what the household wrote until they remove it", () => {
    expect(RETENTION.household_content.days).toBeNull();
  });

  it("expires what the system inferred", () => {
    // The longer a guess is kept the more it looks like a fact.
    expect(RETENTION.memory.days).not.toBeNull();
    expect(RETENTION.conversation.days).not.toBeNull();
  });

  it("keeps the audit trail longer than the things it protects against", () => {
    const audit = RETENTION.audit.days ?? 0;
    expect(audit).toBeGreaterThan(RETENTION.conversation.days ?? 0);
    expect(audit).toBeGreaterThan(RETENTION.memory.days ?? 0);
  });

  it("reads with what you own first, then soonest to expire", () => {
    const order = retentionSchedule();
    expect(order[0]!.rule.days).toBeNull();

    const days = order.slice(1).map((entry) => entry.rule.days ?? 0);
    expect([...days].sort((a, b) => a - b)).toEqual(days);
  });
});

describe("whether a thing is past its keeping", () => {
  it("never expires what the household owns", () => {
    const ancient = new Date("2000-01-01T00:00:00.000Z");
    expect(isExpired("household_content", ancient, NOW)).toBe(false);
  });

  it("expires a conversation older than its window", () => {
    const old = new Date(NOW.getTime() - 91 * 86_400_000);
    const recent = new Date(NOW.getTime() - 89 * 86_400_000);
    expect(isExpired("conversation", old, NOW)).toBe(true);
    expect(isExpired("conversation", recent, NOW)).toBe(false);
  });
});

describe("the deletion grace window", () => {
  it("matches the retention class the Privacy Centre shows", () => {
    expect(DELETION_GRACE_DAYS).toBe(RETENTION.deleted_member.days);
  });

  it("acts that many days after the ask", () => {
    expect(actsAt(NOW).getTime() - NOW.getTime()).toBe(DELETION_GRACE_DAYS * 86_400_000);
  });
});

describe("how long things are phrased", () => {
  it("speaks in the units a person would", () => {
    expect(describeDays(null)).toBe("Until you remove it");
    expect(describeDays(90)).toBe("3 months");
    expect(describeDays(365)).toBe("A year");
    expect(describeDays(730)).toBe("2 years");
    expect(describeDays(45)).toBe("45 days");
  });
});

describe("the schedule is applied, not just published", () => {
  it("purges every class that claims a finite window", async () => {
    // A class shown on the Privacy Centre with a number, and no rows behind it
    // to delete, is a promise the code does not keep.
    const { PURGE_TARGETS } = await import("./purge");
    const finite = (Object.keys(RETENTION) as (keyof typeof RETENTION)[]).filter(
      (key) => RETENTION[key].days !== null,
    );

    // `deleted_member` is the grace window, applied when a deletion request
    // matures rather than by the sweep, so it is the one exemption.
    const swept = finite.filter((key) => key !== "deleted_member");

    for (const key of swept) {
      expect(PURGE_TARGETS[key], `${key} has nothing to purge`).toBeDefined();
      expect(PURGE_TARGETS[key]!.length, key).toBeGreaterThan(0);
    }
  });

  it("never purges what the household wrote", async () => {
    const { PURGE_TARGETS } = await import("./purge");
    expect(PURGE_TARGETS.household_content).toBeUndefined();
  });
});
