import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { AUDIT_EVENTS, type AuditEventType } from "../api/audit";
import {
  NOT_YET_BUILT,
  SENSITIVE_ACTIONS,
  describeAuditEvent,
} from "./sensitive-actions";

/**
 * The audit trail's coverage (story 15-006).
 *
 * This is the test that makes the trail worth reading. It opens the file each
 * declared action says records it and checks the event is actually written
 * there — because an audit enum that names events nobody emits produces a
 * trail with holes, and an administrator reading a trail with holes concludes
 * that nothing happened.
 *
 * It fails loudly rather than skipping. A declared action with no emitter is
 * a broken promise to whoever reads the trail later.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

function sourceOf(path: string): string {
  return readFileSync(resolve(REPO_ROOT, path), "utf8");
}

describe("every sensitive action is actually recorded", () => {
  for (const action of SENSITIVE_ACTIONS) {
    it(`${action.event} is written in ${action.recordedIn}`, () => {
      const source = sourceOf(action.recordedIn);
      expect(source, `${action.recordedIn} no longer records ${action.event}`).toContain(action.event);
    });
  }
});

describe("the catalogue and the enum agree", () => {
  it("accounts for every event the audit enum names", () => {
    const covered = new Set<AuditEventType>([
      ...SENSITIVE_ACTIONS.map((action) => action.event),
      ...NOT_YET_BUILT.map((entry) => entry.event),
    ]);

    const unaccounted = AUDIT_EVENTS.filter((event) => !covered.has(event));

    // Adding an event to the enum without saying where it is recorded — or
    // why it is not yet — fails here rather than becoming a silent gap.
    expect(unaccounted).toEqual([]);
  });

  it("names nothing twice", () => {
    const events = SENSITIVE_ACTIONS.map((action) => action.event);
    expect(new Set(events).size).toBe(events.length);
  });

  it("every declared event is a real audit event", () => {
    for (const action of SENSITIVE_ACTIONS) {
      expect(AUDIT_EVENTS).toContain(action.event);
    }
  });

  it("gives a reason for every action, not a restatement of its name", () => {
    for (const action of SENSITIVE_ACTIONS) {
      expect(action.because.length, action.event).toBeGreaterThan(20);
      expect(action.because.toLowerCase()).not.toContain(action.event);
    }
  });

  it("ties every not-yet-built event to the story that will build it", () => {
    for (const entry of NOT_YET_BUILT) {
      expect(entry.story.length, entry.event).toBeGreaterThan(0);
    }
  });
});

describe("what the household reads", () => {
  it("describes every event in the enum without falling back", () => {
    for (const event of AUDIT_EVENTS) {
      const described = describeAuditEvent(event);
      // The fallback turns dots into spaces; a described event never matches it.
      expect(described.title, event).not.toBe(event.replace(/[._]/g, " "));
      expect(described.title.length, event).toBeGreaterThan(0);
    }
  });

  it("still shows an event nobody has phrased yet", () => {
    // A trail that hides what it cannot phrase is a trail with a hole in it.
    expect(describeAuditEvent("something.new").title).toBe("something new");
  });

  it("names a data-use change on sight, because it is what may leave the house", () => {
    const described = describeAuditEvent("policy.updated", { category: "privacy", version: 2 });
    expect(described.title).toBe("What the assistant may share changed");
    expect(described.detail).toBe("Version 2.");
  });

  it("does not call an ordinary rule change a privacy change", () => {
    const described = describeAuditEvent("policy.updated", { category: "spending", version: 1 });
    expect(described.title).toBe("A household rule changed");
    expect(described.detail).toContain("spending");
  });

  it("says what a responsibility change means for autonomy", () => {
    const described = describeAuditEvent("responsibility.updated", {
      outcomeKey: "laundry.ready",
      aiMode: "execute",
    });
    expect(described.detail).toContain("laundry.ready");
    expect(described.detail).toContain("execute");
  });

  it("copes with metadata that has been redacted away", () => {
    // Redaction runs before the row is written, so a describer that assumed
    // its metadata was present would throw on exactly the rows that matter.
    for (const event of AUDIT_EVENTS) {
      expect(() => describeAuditEvent(event, {})).not.toThrow();
      expect(() => describeAuditEvent(event, { role: "[redacted]", provider: null })).not.toThrow();
    }
  });
});
