import { describe, expect, it } from "vitest";

import {
  effectiveLiveEngine,
  gateLiveEngine,
  liveEngineHint,
  resolveInitialEngine,
} from "./live-engine";

const ENGINES = {
  wonderhome: { name: "WonderHome", detail: "WonderHome listens and answers." },
  gemini_live: { name: "Gemini Live", detail: "Google's real-time voice." },
};
const HINT_OPTS = {
  engines: ENGINES,
  geminiHears: "Google hears what you say.",
  geminiUnavailable: "Gemini Live is not available: {reason}",
};

describe("effectiveLiveEngine", () => {
  it("takes the member's own choice when they have one", () => {
    expect(effectiveLiveEngine("gemini_live", "wonderhome")).toBe("gemini_live");
    expect(effectiveLiveEngine("wonderhome", "gemini_live")).toBe("wonderhome");
  });

  it("follows the household default when the member has not chosen", () => {
    expect(effectiveLiveEngine(null, "gemini_live")).toBe("gemini_live");
    expect(effectiveLiveEngine(undefined, "wonderhome")).toBe("wonderhome");
  });
});

describe("gateLiveEngine", () => {
  it("keeps Gemini Live only when it may run", () => {
    expect(gateLiveEngine("gemini_live", true)).toBe("gemini_live");
    expect(gateLiveEngine("gemini_live", false)).toBe("wonderhome");
  });

  it("leaves WonderHome alone either way", () => {
    expect(gateLiveEngine("wonderhome", true)).toBe("wonderhome");
    expect(gateLiveEngine("wonderhome", false)).toBe("wonderhome");
  });
});

describe("resolveInitialEngine", () => {
  it("lets the server's own saved choice win, ignoring a stale local cache", () => {
    // The owner's case, once fixed: the server holds gemini_live, so that is
    // what shows — a leftover localStorage value cannot override it.
    expect(
      resolveInitialEngine({ server: "gemini_live", explicit: true, stored: "wonderhome", geminiAvailable: true }),
    ).toEqual({ engine: "gemini_live", migrate: null });
  });

  it("adopts and migrates a browser choice when the server has none yet", () => {
    // The one-time upgrade: a member who picked Gemini Live in the composer
    // before it was server-side keeps it, and it is pushed up to the server.
    expect(
      resolveInitialEngine({ server: "wonderhome", explicit: false, stored: "gemini_live", geminiAvailable: true }),
    ).toEqual({ engine: "gemini_live", migrate: "gemini_live" });
  });

  it("still migrates intent but shows the fallback when Gemini cannot run", () => {
    expect(
      resolveInitialEngine({ server: "wonderhome", explicit: false, stored: "gemini_live", geminiAvailable: false }),
    ).toEqual({ engine: "wonderhome", migrate: "gemini_live" });
  });

  it("uses the server value when there is no local choice or it is junk", () => {
    expect(
      resolveInitialEngine({ server: "wonderhome", explicit: false, stored: null, geminiAvailable: true }),
    ).toEqual({ engine: "wonderhome", migrate: null });
    expect(
      resolveInitialEngine({ server: "gemini_live", explicit: false, stored: "nonsense", geminiAvailable: true }),
    ).toEqual({ engine: "gemini_live", migrate: null });
  });
});

describe("liveEngineHint", () => {
  it("describes the SELECTED option, not whatever is available (the screenshot bug)", () => {
    // WonderHome selected while Gemini is available must still describe
    // WonderHome — the exact mismatch the owner caught.
    expect(liveEngineHint("wonderhome", { ...HINT_OPTS, geminiAvailable: true })).toBe(ENGINES.wonderhome.detail);
  });

  it("describes Gemini Live, plus that Google hears it, when Gemini is selected and available", () => {
    expect(liveEngineHint("gemini_live", { ...HINT_OPTS, geminiAvailable: true })).toBe(
      `${ENGINES.gemini_live.detail} ${HINT_OPTS.geminiHears}`,
    );
  });

  it("explains why Gemini is unavailable when it is the selected but blocked option", () => {
    expect(
      liveEngineHint("gemini_live", { ...HINT_OPTS, geminiAvailable: false, geminiReason: "out of credits" }),
    ).toBe(`${ENGINES.gemini_live.detail} Gemini Live is not available: out of credits`);
  });
});
