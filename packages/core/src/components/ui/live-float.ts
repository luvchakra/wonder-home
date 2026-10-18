/**
 * HomeTalk floats over other apps (story 04-020).
 *
 * The owner, 2026-10-18: while talking to HomeTalk, a person should be able
 * to use the other apps on their phone, with WonderHome showing as a small
 * picture-in-picture window and the voice conversation carrying on.
 *
 * A web app cannot draw its own floating window, but a phone's browser will
 * float a *video*. So HomeTalk paints its live state onto a canvas — the
 * orb, what it is doing, the last thing heard and the last thing said —
 * turns that canvas into a video stream, and asks the browser to float it.
 * The conversation itself never moves: the same engines keep listening and
 * speaking from the page underneath, and the picture is only a view of them.
 *
 * Everything here is pure — can this browser float at all, the frame's
 * words, the wrapping, the painting against a context — so it is tested
 * without a browser. `live-talk.tsx` owns the elements, the tap and the
 * window's lifetime.
 */

/** What the browser offers, read once from `window` (`readFloatEnvironment`) or faked in a test. */
export type FloatEnvironment = {
  /** `HTMLCanvasElement.prototype.captureStream` — without it there is no video to float. */
  canvasCapture: boolean;
  /** `document.pictureInPictureEnabled` — the standard API is on and allowed here. */
  pictureInPictureEnabled: boolean;
  /** `HTMLVideoElement.prototype.requestPictureInPicture` — Chrome, Edge, Safari on a Mac. */
  requestPictureInPicture: boolean;
  /** `HTMLVideoElement.prototype.webkitSetPresentationMode` — Safari's own way, the only one on an iPhone. */
  webkitPresentationMode: boolean;
};

export type FloatMode = "standard" | "webkit";

/**
 * Which way this browser can float the conversation, or null when it cannot
 * (Firefox on a phone, a desktop browser with the feature switched off). Null
 * means the Float button is never shown — never a button that does nothing
 * (rule 10).
 */
export function floatSupport(env: FloatEnvironment): FloatMode | null {
  if (!env.canvasCapture) return null;
  if (env.pictureInPictureEnabled && env.requestPictureInPicture) return "standard";
  if (env.webkitPresentationMode) return "webkit";
  return null;
}

/**
 * Whether HomeTalk should keep its floating video ready so that leaving the
 * app floats it (story 04-022): only while a conversation is live and
 * listening, and only where this browser can float at all. A paused
 * conversation is not followed into another app.
 */
export function shouldArmFloat(input: { floatable: boolean; active: boolean; paused: boolean }): boolean {
  return input.floatable && input.active && !input.paused;
}

type VideoPrototype = { requestPictureInPicture?: unknown; webkitSetPresentationMode?: unknown };

/** The real browser's answers, for `floatSupport`. */
export function readFloatEnvironment(w: {
  document?: { pictureInPictureEnabled?: boolean };
  HTMLCanvasElement?: { prototype?: { captureStream?: unknown } };
  HTMLVideoElement?: { prototype?: VideoPrototype };
}): FloatEnvironment {
  const video = w.HTMLVideoElement?.prototype;
  return {
    canvasCapture: typeof w.HTMLCanvasElement?.prototype?.captureStream === "function",
    pictureInPictureEnabled: Boolean(w.document?.pictureInPictureEnabled),
    requestPictureInPicture: typeof video?.requestPictureInPicture === "function",
    webkitPresentationMode: typeof video?.webkitSetPresentationMode === "function",
  };
}

/** The picture's size. 4:3 gives the words room; a phone's floating window keeps the ratio. */
export const FRAME_WIDTH = 480;
export const FRAME_HEIGHT = 360;
/** Frames a second for the stream and the repaint timer: enough for a pulse, cheap for a phone. */
export const FRAME_RATE = 8;

/** The words the picture needs, in the viewer's language. */
export type FloatWords = {
  connecting: string;
  listening: string;
  thinking: string;
  speaking: string;
  paused: string;
  /** The label over what the person said. */
  you: string;
};

export type LiveFrame = {
  /** What HomeTalk is doing, as the composer says it. */
  status: string;
  /** The last thing the person said, or null before anyone has spoken. */
  heard: string | null;
  /** The last thing HomeTalk said back, or null while it is still thinking. */
  said: string | null;
  /** The ring pulses only while the conversation is actually going. */
  busy: boolean;
  you: string;
};

/** The frame's words from the live view and the last exchange — the same words the composer shows. */
export function liveFrame(
  view: { state: "idle" | "connecting" | "listening" | "thinking" | "speaking" | "denied" | "unsupported"; paused: boolean },
  exchange: { heard: string | null; said: string | null },
  words: FloatWords,
): LiveFrame {
  const status = view.paused
    ? words.paused
    : view.state === "connecting"
      ? words.connecting
      : view.state === "thinking"
        ? words.thinking
        : view.state === "speaking"
          ? words.speaking
          : words.listening;
  return { status, heard: exchange.heard, said: exchange.said, busy: !view.paused, you: words.you };
}

/**
 * The picture's colours, read from the theme's own tokens so the window is
 * the app's cream and indigo and follows dark mode. The fallbacks are the
 * brand sheet's values, for a context that cannot read a token at all.
 */
export type FloatPalette = {
  page: string;
  surface: string;
  ink: string;
  muted: string;
  primary: string;
  /** The orb's second colour, the kit's violet. */
  orbEdge: string;
  onPrimary: string;
};

export const FALLBACK_PALETTE: FloatPalette = {
  page: "#FAF7F2",
  surface: "#FFFFFF",
  ink: "#1F2937",
  muted: "#6B7280",
  primary: "#6366F1",
  orbEdge: "#7C3AED",
  onPrimary: "#FFFFFF",
};

const TOKENS: Record<keyof FloatPalette, string> = {
  page: "--wh-background",
  surface: "--wh-surface",
  ink: "--wh-foreground",
  muted: "--wh-foreground-muted",
  primary: "--wh-primary",
  orbEdge: "--wh-tone-school",
  onPrimary: "--wh-primary-foreground",
};

export function readPalette(read: (token: string) => string | null | undefined): FloatPalette {
  const palette = { ...FALLBACK_PALETTE };
  for (const key of Object.keys(TOKENS) as (keyof FloatPalette)[]) {
    const value = read(TOKENS[key])?.trim();
    if (value) palette[key] = value;
  }
  return palette;
}

/** The part of a 2D context the painter uses — the real one, or a fake in a test. */
export type Painter = {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  globalAlpha: number;
  font: string;
  textBaseline: CanvasTextBaseline;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  roundRect(x: number, y: number, w: number, h: number, radii: number): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  fill(): void;
  stroke(): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradient;
};

/**
 * Words wrapped to a width, at most `maxLines` lines. Everything that fits
 * is shown; only when more lines would be needed does the last one end in
 * an ellipsis — and the painter tries a smaller size first (rule 15: the
 * layout bends before the content is cut).
 */
export function wrapLines(measure: (text: string) => number, text: string, maxWidth: number, maxLines: number): { lines: string[]; cut: boolean } {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= maxWidth || !line) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  const shown = lines.slice(0, maxLines);
  const cut = words.join(" ") !== shown.join(" ");
  if (cut && shown.length > 0) {
    let last = shown[shown.length - 1]!;
    while (last && measure(`${last}…`) > maxWidth) last = last.slice(0, -1).trimEnd();
    shown[shown.length - 1] = `${last}…`;
  }
  return { lines: shown, cut };
}

const FONT = '"Sora", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** A block of text at the largest of the sizes where it fits, cut only at the smallest. */
function paragraph(ctx: Painter, text: string, x: number, y: number, maxWidth: number, maxLines: number, sizes: readonly number[], weight: string): number {
  let chosen: { size: number; lines: string[] } | null = null;
  for (const size of sizes) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    const wrapped = wrapLines((piece) => ctx.measureText(piece).width, text, maxWidth, maxLines);
    chosen = { size, lines: wrapped.lines };
    if (!wrapped.cut) break;
  }
  if (!chosen) return y;
  ctx.font = `${weight} ${chosen.size}px ${FONT}`;
  const leading = Math.round(chosen.size * 1.3);
  chosen.lines.forEach((line, index) => ctx.fillText(line, x, y + index * leading));
  return y + chosen.lines.length * leading;
}

/**
 * One frame of the floating window: the cream page, a white card, the orb
 * with its pulsing ring, the status in the brand's blue, then what was
 * heard and what was said. `phase` runs 0 → 1 over one pulse; with the
 * conversation paused the ring stands still.
 */
export function drawLiveFrame(ctx: Painter, frame: LiveFrame, palette: FloatPalette, phase: number): void {
  const w = FRAME_WIDTH;
  const h = FRAME_HEIGHT;
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.page;
  ctx.fillRect(0, 0, w, h);

  // The card.
  ctx.fillStyle = palette.surface;
  ctx.beginPath();
  ctx.roundRect(14, 14, w - 28, h - 28, 28);
  ctx.fill();

  // The orb and its ring.
  const cx = 60;
  const cy = 64;
  const pulse = frame.busy ? 0.5 - 0.5 * Math.cos(phase * Math.PI * 2) : 0;
  ctx.globalAlpha = frame.busy ? 0.18 + 0.14 * (1 - pulse) : 0.14;
  ctx.fillStyle = palette.primary;
  ctx.beginPath();
  ctx.arc(cx, cy, 30 + pulse * 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  const orb = ctx.createRadialGradient(cx - 9, cy - 9, 2, cx, cy, 30);
  orb.addColorStop(0, palette.primary);
  orb.addColorStop(1, palette.orbEdge);
  ctx.fillStyle = orb;
  ctx.beginPath();
  ctx.arc(cx, cy, 28, 0, Math.PI * 2);
  ctx.fill();
  // A microphone, drawn: the capsule, the cradle, the stem and the foot.
  ctx.fillStyle = palette.onPrimary;
  ctx.strokeStyle = palette.onPrimary;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(cx - 5, cy - 15, 10, 18, 5);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy - 2, 10, Math.PI * 0.08, Math.PI * 0.92);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy + 8);
  ctx.lineTo(cx, cy + 15);
  ctx.moveTo(cx - 6, cy + 15);
  ctx.lineTo(cx + 6, cy + 15);
  ctx.stroke();

  // What it is doing, and whose voice this is.
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = palette.primary;
  ctx.font = `700 28px ${FONT}`;
  ctx.fillText(frame.status, 104, 58);
  ctx.fillStyle = palette.muted;
  ctx.font = `500 16px ${FONT}`;
  ctx.fillText("HomeTalk · WonderHome", 104, 84);

  // The exchange. Labels in the muted ink, the words in the full ink.
  const left = 36;
  const width = w - left - 36;
  let y = 132;
  if (frame.heard) {
    ctx.fillStyle = palette.muted;
    ctx.font = `600 15px ${FONT}`;
    ctx.fillText(frame.you.toLocaleUpperCase(), left, y);
    ctx.fillStyle = palette.ink;
    y = paragraph(ctx, frame.heard, left, y + 28, width, 2, [22, 18], "500") + 18;
  }
  if (frame.said) {
    const room = Math.max(1, Math.floor((h - 40 - (y + 28)) / 29));
    ctx.fillStyle = palette.muted;
    ctx.font = `600 15px ${FONT}`;
    ctx.fillText("HOMETALK", left, y);
    ctx.fillStyle = palette.ink;
    paragraph(ctx, frame.said, left, y + 28, width, Math.min(4, room), [22, 18], "500");
  }
}
