import { detectImageMimeType } from "./security";

/**
 * The "Normalize" step of HomeSend's pipeline (Wave 3 §1): whatever came in
 * — a photo, a PDF, a text file, a voice note, a web page, an email — is
 * turned into one of the few shapes the understanding step reads, and every
 * shape is decided from the bytes themselves, never from a filename or a
 * claimed content type alone.
 */

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const DOCUMENT_TYPES = ["application/pdf"] as const;
export const TEXT_FILE_TYPES = ["text/plain", "text/csv"] as const;
export const AUDIO_TYPES = ["audio/webm", "audio/ogg", "audio/mpeg", "audio/wav", "audio/flac"] as const;

export type ImageType = (typeof IMAGE_TYPES)[number];
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export type TextFileType = (typeof TEXT_FILE_TYPES)[number];
export type AudioType = (typeof AUDIO_TYPES)[number];
export type IntakeFileType = ImageType | DocumentType | TextFileType | AudioType;

export type FileFamily = "image" | "document" | "text" | "audio";

export function familyOf(type: IntakeFileType): FileFamily {
  if ((IMAGE_TYPES as readonly string[]).includes(type)) return "image";
  if ((DOCUMENT_TYPES as readonly string[]).includes(type)) return "document";
  if ((TEXT_FILE_TYPES as readonly string[]).includes(type)) return "text";
  return "audio";
}

/** Upper bounds per family. A voice note is bounded by what one speech request can take. */
export const MAX_BYTES: Record<FileFamily, number> = {
  image: 8 * 1024 * 1024,
  document: 8 * 1024 * 1024,
  text: 512 * 1024,
  audio: 10 * 1024 * 1024,
};

/**
 * Payload limits beyond bytes (Wave 5 §15). A PDF's pages are what a model
 * reads, and a voice note's length is what transcription pays for, so each
 * has its own ceiling beside the byte one.
 */
export const MAX_PDF_PAGES = 40;
export const MAX_AUDIO_SECONDS = 600;

/**
 * Pages in a PDF, counted from its page objects (`/Type /Page`, never the
 * `/Pages` tree nodes). A PDF whose page objects sit in compressed object
 * streams can undercount; the byte limit still bounds that one.
 */
export function pdfPageCount(bytes: Uint8Array): number {
  const text = new TextDecoder("latin1").decode(bytes);
  return (text.match(/\/Type\s*\/Page(?![A-Za-z])/g) ?? []).length;
}

/**
 * A voice note's length in seconds, where the container states it
 * exactly: a WAV's data size over its byte rate. For compressed formats
 * (MP3, OGG, WebM) there is no header that says so cheaply and reliably, so
 * this returns null and the byte limit bounds them instead.
 */
export function audioDurationSeconds(bytes: Uint8Array, type: string): number | null {
  if (type !== "audio/wav" && type !== "audio/x-wav" && type !== "audio/wave") return null;
  if (bytes.length < 44 || !startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) || !startsWith(bytes, [0x57, 0x41, 0x56, 0x45], 8)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let byteRate: number | null = null;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!);
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt " && offset + 20 <= bytes.length) byteRate = view.getUint32(offset + 16, true);
    if (id === "data") return byteRate && byteRate > 0 ? size / byteRate : null;
    offset += 8 + size + (size % 2);
  }
  return null;
}

/** What the `accept` attribute of every HomeSend picker offers — one list, so the picker never offers what the server refuses. */
export const ACCEPTED_UPLOAD_TYPES = [...IMAGE_TYPES, ...DOCUMENT_TYPES, ...TEXT_FILE_TYPES, ".txt", ".csv", ...AUDIO_TYPES, ".m4a", ".mp3", ".ogg", ".opus", ".webm", ".wav"].join(",");

function startsWith(bytes: Uint8Array, magic: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + magic.length) return false;
  return magic.every((byte, index) => bytes[offset + index] === byte);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

/** The audio container the bytes say they are. `m4a`/AAC is recognised only to be refused honestly — the speech service cannot read it. */
export function detectAudioType(bytes: Uint8Array): AudioType | "audio/mp4" | null {
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "audio/webm";
  if (ascii(bytes, 0, 4) === "OggS") return "audio/ogg";
  if (ascii(bytes, 0, 4) === "fLaC") return "audio/flac";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WAVE") return "audio/wav";
  if (ascii(bytes, 0, 3) === "ID3") return "audio/mpeg";
  if (bytes.length >= 2 && bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0) return "audio/mpeg";
  if (ascii(bytes, 4, 8) === "ftyp") return "audio/mp4";
  return null;
}

export function isPdf(bytes: Uint8Array): boolean {
  // "%PDF-" within the first 1 KB, which is where the spec allows it.
  const head = ascii(bytes, 0, Math.min(bytes.length, 1024));
  return head.includes("%PDF-");
}

/**
 * Whether the bytes are genuinely text: valid UTF-8, no NUL bytes, and
 * overwhelmingly printable. A renamed binary fails here however it was
 * labelled.
 */
export function decodeTextFile(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return null;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  const withoutBom = text.replace(/^\uFEFF/, "");
  if (withoutBom.trim().length === 0) return null;
  let control = 0;
  for (const char of withoutBom) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 32 && char !== "\n" && char !== "\r" && char !== "\t") control += 1;
  }
  return control / withoutBom.length > 0.01 ? null : withoutBom;
}

export type DetectedFile =
  | { ok: true; type: IntakeFileType; family: FileFamily }
  | { ok: false; reason: "unsupported_type" | "mismatched_type" | "unsupported_audio" | "empty" };

function claimedFamily(claimed: string, filename: string | null): FileFamily | null {
  const type = claimed.toLowerCase().split(";")[0]?.trim() ?? "";
  const extension = filename?.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf" || extension === "pdf") return "document";
  if (type.startsWith("audio/") || type === "video/webm" || ["m4a", "mp3", "ogg", "opus", "webm", "wav", "flac", "aac"].includes(extension)) return "audio";
  if (type.startsWith("text/") || ["txt", "csv"].includes(extension)) return "text";
  return null;
}

/**
 * Decides a file's real type from its bytes, and checks it against the
 * family its upload claimed. Claiming to be a photo and being a PDF is a
 * mismatch — refused, the same way `security.ts` always refused a renamed
 * image.
 */
export function detectIntakeFile(bytes: Uint8Array, claimedType: string, filename: string | null = null): DetectedFile {
  if (bytes.length === 0) return { ok: false, reason: "empty" };
  const claimed = claimedFamily(claimedType, filename);
  if (!claimed) return { ok: false, reason: "unsupported_type" };

  let detected: IntakeFileType | null = null;
  const image = detectImageMimeType(bytes);
  if (image) detected = image;
  else if (isPdf(bytes)) detected = "application/pdf";
  else {
    const audio = detectAudioType(bytes);
    if (audio === "audio/mp4") return claimed === "audio" ? { ok: false, reason: "unsupported_audio" } : { ok: false, reason: "mismatched_type" };
    if (audio) detected = audio;
    else if (decodeTextFile(bytes) !== null) {
      const isCsv = claimedType.toLowerCase().includes("csv") || filename?.toLowerCase().endsWith(".csv");
      detected = isCsv ? "text/csv" : "text/plain";
    }
  }

  if (!detected) return { ok: false, reason: "mismatched_type" };
  const family = familyOf(detected);
  if (family !== claimed) return { ok: false, reason: "mismatched_type" };
  return { ok: true, type: detected, family };
}

/** Longest text the understanding step reads from any one source. */
export const MAX_TEXT_CHARS = 12_000;

/**
 * Plain, model-ready text: Unicode-normalised, control characters removed,
 * whitespace collapsed, bounded. Never interprets the text — only cleans it.
 */
export function normalizeText(raw: string, limit = MAX_TEXT_CHARS): string {
  return raw
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/[ \t\f\v\u00A0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, limit);
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", bull: "•", middot: "·", copy: "©", reg: "®", trade: "™",
  rupee: "₹", euro: "€", pound: "£", cent: "¢", times: "×",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1]?.toLowerCase() === "x" ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? whole;
  });
}

/**
 * HTML to readable text, for a fetched page or an email's HTML part (§6:
 * "HTML must be sanitized/extracted before model use"). Scripts, styles,
 * hidden templates, comments and the head never reach the model — which is
 * also where hidden prompt-injection text most often hides. Nothing here
 * renders or evaluates the HTML; it is only ever read as a string.
 */
export function htmlToText(html: string, limit = MAX_TEXT_CHARS): { title: string | null; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1] ? normalizeText(decodeEntities(titleMatch[1].replace(/<[^>]+>/g, "")), 200) || null : null;

  const text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|head|iframe|object|canvas|math)\b[\s\S]*?<\/\1\s*>/gi, " ")
    // Content the author hid from people is not content the household received.
    .replace(/<([a-z0-9]+)\b[^>]*(?:\shidden\b|display\s*:\s*none|visibility\s*:\s*hidden|aria-hidden\s*=\s*["']true["'])[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(br|hr)\b[^>]*>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|header|footer|blockquote|pre|table|ul|ol)\s*>/gi, "\n")
    .replace(/<(td|th)\b[^>]*>/gi, " ")
    .replace(/<li\b[^>]*>/gi, "\n• ")
    // Inline formatting sits inside a sentence; dropping it must not split one.
    .replace(/<\/?(?:b|i|u|em|strong|span|a|small|sup|sub|font|mark|abbr|code|time)\b[^>]*>/gi, "")
    .replace(/<[^>]+>/g, " ");

  return { title, text: normalizeText(decodeEntities(text), limit) };
}

/** A pasted message that is nothing but one web address — the link input (§3). */
export function asLoneUrl(text: string): string | null {
  const trimmed = text.trim();
  if (!/^https?:\/\/\S+$/i.test(trimmed)) return null;
  return trimmed.length <= 2048 ? trimmed : null;
}

/** A stable fingerprint of content, for "you already sent this" (§15). */
export async function contentHash(input: Uint8Array | string): Promise<string> {
  const bytes = typeof input === "string" ? new TextEncoder().encode(normalizeText(input).toLowerCase()) : input;
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
