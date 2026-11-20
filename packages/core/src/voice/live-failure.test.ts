import { describe, expect, it } from "vitest";

import { liveFailureKind, VoiceRouteError } from "./live-failure";

describe("liveFailureKind", () => {
  it("names a refused microphone as denied, however the browser words it", () => {
    expect(liveFailureKind(Object.assign(new Error("Permission denied"), { name: "NotAllowedError" }))).toBe("denied");
    expect(liveFailureKind(new Error("not-allowed"))).toBe("denied");
    expect(liveFailureKind(Object.assign(new Error("x"), { name: "SecurityError" }))).toBe("denied");
  });

  it("names a browser that cannot listen as unsupported", () => {
    expect(liveFailureKind(new Error("This browser cannot record audio."))).toBe("unsupported");
    expect(liveFailureKind(Object.assign(new Error("Requested device not found"), { name: "NotFoundError" }))).toBe("unsupported");
  });

  it("sends a refusal from the voice route (400/402/403) to the home's voice setup", () => {
    expect(liveFailureKind(new VoiceRouteError("Google refused the recognition settings.", 400))).toBe("setup");
    expect(liveFailureKind(new VoiceRouteError("Allowance used.", 403))).toBe("setup");
    expect(liveFailureKind(new VoiceRouteError("Plan.", 402))).toBe("setup");
  });

  it("treats anything else as a plain failure", () => {
    expect(liveFailureKind(new VoiceRouteError("Server error", 500))).toBe("failed");
    expect(liveFailureKind(new Error("network"))).toBe("failed");
    expect(liveFailureKind(undefined)).toBe("failed");
  });
});
