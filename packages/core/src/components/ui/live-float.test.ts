import { describe, expect, it } from "vitest";

import { FALLBACK_PALETTE, drawLiveFrame, floatSupport, liveFrame, readFloatEnvironment, readPalette, wrapLines, type Painter } from "./live-float";

describe("whether a browser can float HomeTalk (04-020)", () => {
  it("uses the standard picture-in-picture API where the document allows it", () => {
    expect(floatSupport({ canvasCapture: true, pictureInPictureEnabled: true, requestPictureInPicture: true, webkitPresentationMode: false })).toBe("standard");
  });

  it("falls back to Safari's presentation mode, the only way on an iPhone", () => {
    expect(floatSupport({ canvasCapture: true, pictureInPictureEnabled: false, requestPictureInPicture: false, webkitPresentationMode: true })).toBe("webkit");
  });

  it("prefers the standard API where both exist", () => {
    expect(floatSupport({ canvasCapture: true, pictureInPictureEnabled: true, requestPictureInPicture: true, webkitPresentationMode: true })).toBe("standard");
  });

  it("is null without a canvas stream, since there is no video to float", () => {
    expect(floatSupport({ canvasCapture: false, pictureInPictureEnabled: true, requestPictureInPicture: true, webkitPresentationMode: true })).toBeNull();
  });

  it("is null where picture-in-picture is off, so the button never shows", () => {
    expect(floatSupport({ canvasCapture: true, pictureInPictureEnabled: false, requestPictureInPicture: true, webkitPresentationMode: false })).toBeNull();
    expect(floatSupport({ canvasCapture: true, pictureInPictureEnabled: false, requestPictureInPicture: false, webkitPresentationMode: false })).toBeNull();
  });

  it("reads the real browser's answers from its prototypes", () => {
    const chrome = {
      document: { pictureInPictureEnabled: true },
      HTMLCanvasElement: { prototype: { captureStream() {} } },
      HTMLVideoElement: { prototype: { requestPictureInPicture() {} } },
    };
    expect(readFloatEnvironment(chrome)).toEqual({ canvasCapture: true, pictureInPictureEnabled: true, requestPictureInPicture: true, webkitPresentationMode: false });
    const iphone = {
      document: {},
      HTMLCanvasElement: { prototype: { captureStream() {} } },
      HTMLVideoElement: { prototype: { webkitSetPresentationMode() {} } },
    };
    expect(floatSupport(readFloatEnvironment(iphone))).toBe("webkit");
    expect(floatSupport(readFloatEnvironment({}))).toBeNull();
  });
});

const WORDS = { listening: "Listening…", thinking: "Thinking…", speaking: "Speaking…", paused: "Paused", you: "You" };

describe("the frame's words", () => {
  it("says what HomeTalk is doing in the composer's own words", () => {
    expect(liveFrame({ state: "listening", paused: false }, { heard: null, said: null }, WORDS).status).toBe("Listening…");
    expect(liveFrame({ state: "thinking", paused: false }, { heard: null, said: null }, WORDS).status).toBe("Thinking…");
    expect(liveFrame({ state: "speaking", paused: false }, { heard: null, said: null }, WORDS).status).toBe("Speaking…");
  });

  it("paused outranks every state and stops the pulse", () => {
    const frame = liveFrame({ state: "speaking", paused: true }, { heard: "Add milk", said: "Milk is on the list." }, WORDS);
    expect(frame.status).toBe("Paused");
    expect(frame.busy).toBe(false);
    expect(frame.heard).toBe("Add milk");
    expect(frame.said).toBe("Milk is on the list.");
  });
});

describe("wrapping words to the window", () => {
  // Every character is 10 wide, so a width of 100 holds ten characters.
  const measure = (text: string) => text.length * 10;

  it("keeps short text on one line", () => {
    expect(wrapLines(measure, "Add milk", 100, 2)).toEqual({ lines: ["Add milk"], cut: false });
  });

  it("wraps at word boundaries", () => {
    expect(wrapLines(measure, "Add almond milk to the list", 100, 3)).toEqual({ lines: ["Add almond", "milk to", "the list"], cut: false });
  });

  it("ends the last line with an ellipsis only when more would not fit", () => {
    const { lines, cut } = wrapLines(measure, "Add almond milk to the list please", 100, 2);
    expect(cut).toBe(true);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.endsWith("…")).toBe(true);
    expect(measure(lines[1]!)).toBeLessThanOrEqual(100);
  });

  it("never loses a word longer than the line", () => {
    expect(wrapLines(measure, "Mahabaleshwar tomorrow", 100, 2)).toEqual({ lines: ["Mahabaleshwar", "tomorrow"], cut: false });
  });

  it("collapses runs of whitespace", () => {
    expect(wrapLines(measure, "  Add   milk\n\nnow ", 200, 1)).toEqual({ lines: ["Add milk now"], cut: false });
  });
});

describe("the picture's colours", () => {
  it("come from the theme's tokens, with the brand sheet's values where a token is missing", () => {
    const palette = readPalette((token) => (token === "--wh-primary" ? " oklch(0.58 0.216 277) " : token === "--wh-background" ? "" : null));
    expect(palette.primary).toBe("oklch(0.58 0.216 277)");
    expect(palette.page).toBe(FALLBACK_PALETTE.page);
    expect(palette.ink).toBe(FALLBACK_PALETTE.ink);
  });
});

/** A context that records what was drawn and written. */
function fakePainter(): Painter & { texts: string[]; fonts: string[] } {
  const texts: string[] = [];
  const fonts: string[] = [];
  const painter: Painter & { texts: string[]; fonts: string[] } = {
    texts,
    fonts,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    font: "",
    textBaseline: "alphabetic",
    fillRect() {},
    beginPath() {},
    roundRect() {},
    arc() {},
    moveTo() {},
    lineTo() {},
    fill() {},
    stroke() {},
    fillText(text) {
      texts.push(text);
      fonts.push(painter.font);
    },
    measureText(text) {
      return { width: text.length * 11 };
    },
    createRadialGradient() {
      return { addColorStop() {} } as unknown as CanvasGradient;
    },
  };
  return painter;
}

describe("painting a frame", () => {
  it("writes the status, the brand line, and both sides of the exchange", () => {
    const ctx = fakePainter();
    drawLiveFrame(ctx, { status: "Speaking…", heard: "What's for dinner?", said: "Rajma rice at 8 pm.", busy: true, you: "You" }, FALLBACK_PALETTE, 0.25);
    expect(ctx.texts).toEqual(["Speaking…", "HomeTalk · WonderHome", "YOU", "What's for dinner?", "HOMETALK", "Rajma rice at 8 pm."]);
  });

  it("leaves the exchange out before anyone has spoken", () => {
    const ctx = fakePainter();
    drawLiveFrame(ctx, { status: "Listening…", heard: null, said: null, busy: true, you: "You" }, FALLBACK_PALETTE, 0);
    expect(ctx.texts).toEqual(["Listening…", "HomeTalk · WonderHome"]);
  });

  it("shrinks a long reply before cutting it", () => {
    const ctx = fakePainter();
    const said = "Tomorrow Asmi has swimming at four, Manan has a dentist appointment at half past five, and the electricity bill is due.";
    drawLiveFrame(ctx, { status: "Speaking…", heard: "What's on tomorrow?", said, busy: true, you: "You" }, FALLBACK_PALETTE, 0);
    const replyFonts = ctx.fonts.slice(ctx.texts.indexOf("HOMETALK") + 1);
    expect(replyFonts.every((font) => font.includes("18px"))).toBe(true);
    expect(ctx.texts.join(" ")).toContain("Tomorrow Asmi has swimming");
  });
});
