import { describe, expect, it } from "vitest";

import {
  assessServiceRequest,
  canTransition,
  openRequestAssetIds,
  transition,
  type ServiceRequest,
} from "./services";

const NOW = new Date("2026-09-17T09:00:00.000Z");

const request = (over: Partial<ServiceRequest> = {}): ServiceRequest => ({
  id: "req-1",
  assetId: "geyser",
  subject: "Geyser not heating",
  providerName: "Sharma Appliances",
  providerContact: null,
  status: "requested",
  scheduledFor: null,
  nextAction: "Confirm a visit slot",
  nextActionBy: "provider",
  updatedAt: new Date("2026-09-16T09:00:00.000Z"),
  ...over,
});

describe("status transitions", () => {
  it("allows the ordinary path through a repair", () => {
    expect(canTransition("requested", "scheduled")).toBe(true);
    expect(canTransition("scheduled", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "completed")).toBe(true);
  });

  it("does not reopen a settled request, so the history stays readable", () => {
    expect(canTransition("completed", "in_progress")).toBe(false);
    expect(canTransition("cancelled", "scheduled")).toBe(false);

    const result = transition(request({ status: "completed" }), "in_progress", { at: NOW });
    expect(result).toEqual({ ok: false, reason: "A completed request cannot become in_progress." });
  });

  it("clears the next action when a request settles", () => {
    const result = transition(request({ status: "in_progress" }), "completed", { at: NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.nextAction).toBeNull();
    expect(result.request.nextActionBy).toBeNull();
  });

  it("carries the next action forward when one is not supplied", () => {
    const result = transition(request(), "scheduled", {
      at: NOW,
      scheduledFor: new Date("2026-09-20T05:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.nextAction).toBe("Confirm a visit slot");
    expect(result.request.scheduledFor?.toISOString()).toBe("2026-09-20T05:00:00.000Z");
  });
});

describe("what an open request needs", () => {
  it("stays quiet while things are moving", () => {
    expect(assessServiceRequest(request(), NOW).notable).toBe(false);
  });

  it("says nothing about a settled request", () => {
    expect(assessServiceRequest(request({ status: "completed" }), NOW).notable).toBe(false);
  });

  it("flags an open request with nobody's name on the next step", () => {
    const assessment = assessServiceRequest(request({ nextActionBy: null, nextAction: null }), NOW);

    expect(assessment.status).toBe("blocked");
    expect(assessment.action).toEqual({ action: "set_next_action", target: "req-1" });
  });

  it("chases the provider once they have gone quiet for long enough", () => {
    const stale = request({ updatedAt: new Date("2026-09-10T09:00:00.000Z") });
    const assessment = assessServiceRequest(stale, NOW);

    expect(assessment.action).toEqual({ action: "chase_provider", target: "req-1" });
    expect(assessment.reason).toContain("Sharma Appliances");
  });

  it("gives the household less rope than the provider, because nobody else will do it", () => {
    const ours = request({
      nextActionBy: "household",
      nextAction: "Send the model number",
      updatedAt: new Date("2026-09-14T09:00:00.000Z"),
    });

    expect(assessServiceRequest(ours, NOW).action).toEqual({ action: "do_next_action", target: "req-1" });
    // The same three days on the provider's side is still within reason.
    expect(assessServiceRequest(request({ updatedAt: new Date("2026-09-14T09:00:00.000Z") }), NOW).notable).toBe(
      false,
    );
  });

  it("notices a visit that was due and left no trace", () => {
    const missed = request({
      status: "scheduled",
      scheduledFor: new Date("2026-09-16T05:00:00.000Z"),
      updatedAt: new Date("2026-09-16T05:00:00.000Z"),
    });

    expect(assessServiceRequest(missed, NOW).action).toEqual({ action: "confirm_visit", target: "req-1" });
  });
});

describe("open requests by asset", () => {
  it("lists only the live ones, so maintenance can stay quiet about those", () => {
    const open = openRequestAssetIds([
      request(),
      request({ id: "req-2", assetId: "ac", status: "completed" }),
      request({ id: "req-3", assetId: null }),
    ]);

    expect([...open]).toEqual(["geyser"]);
  });
});
