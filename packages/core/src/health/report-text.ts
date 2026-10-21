import { inflateSync } from "node:zlib";

/**
 * The text layer of a health report PDF (story 21-012), so the reading's
 * validator can check every finding against the words the document itself
 * prints — the same words the model is given. Server-only (node:zlib).
 *
 * Deliberately small: it inflates the PDF's content streams and collects the
 * strings shown by its text operators (`Tj`, `TJ`, `'`, `"`). That covers the
 * reports lab software prints. A scanned report, or one whose fonts use their
 * own encoding, has no readable text layer; this then returns null and the
 * report is read as a picture instead, every finding checked against its own
 * quote and marked as such. Nothing here interprets what the text says.
 */

/** Longest text kept from one report. Lab reports are short; this bounds a hostile one. */
export const MAX_REPORT_TEXT_CHARS = 24_000;

/** Ceiling on what one stream may inflate to, so a compressed bomb cannot exhaust memory. */
const MAX_INFLATED_BYTES = 4 * 1024 * 1024;

/** Streams that are never page text: images, fonts, metadata, cross-reference and object streams. */
const NOT_TEXT = /\/(?:Length1|Length2|Length3)\b|\/Type\s*\/(?:XRef|ObjStm|Metadata|EmbeddedFile|XObject)\b|\/Subtype\s*\/(?:Image|Type1C|CIDFontType0C|OpenType|XML|Form)\b/;
const OTHER_FILTERS = /\/(?:DCTDecode|JPXDecode|CCITTFaxDecode|JBIG2Decode|LZWDecode|ASCII85Decode|ASCIIHexDecode|RunLengthDecode)\b/;

function inflate(data: Buffer): Buffer | null {
  try {
    return inflateSync(data, { maxOutputLength: MAX_INFLATED_BYTES });
  } catch {
    try {
      // A stream with trailing bytes after its end still yields what came before.
      return inflateSync(data, { maxOutputLength: MAX_INFLATED_BYTES, finishFlush: 2 /* Z_SYNC_FLUSH */ });
    } catch {
      return null;
    }
  }
}

/** Every content stream's decoded bytes, as latin1 text. */
function contentStreams(raw: string): string[] {
  const out: string[] = [];
  const streamStart = /(?<!end)stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = streamStart.exec(raw))) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    streamStart.lastIndex = end + 9;
    const dict = raw.slice(Math.max(0, raw.lastIndexOf("obj", match.index)), match.index);
    if (NOT_TEXT.test(dict) || OTHER_FILTERS.test(dict)) continue;
    const body = Buffer.from(raw.slice(start, end).replace(/\r?\n$/, ""), "latin1");
    const decoded = /\/FlateDecode\b/.test(dict) ? inflate(body) : body;
    if (!decoded) continue;
    const text = decoded.toString("latin1");
    if (/\bBT\b/.test(text) && /\bET\b/.test(text)) out.push(text);
  }
  return out;
}

function decodeBytes(bytes: number[]): string {
  // UTF-16BE, with a byte-order mark or as two-byte codes whose high byte is zero.
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let text = "";
    for (let i = 2; i + 1 < bytes.length; i += 2) text += String.fromCharCode(((bytes[i] ?? 0) << 8) | (bytes[i + 1] ?? 0));
    return text;
  }
  if (bytes.length >= 2 && bytes.length % 2 === 0 && bytes.every((byte, index) => index % 2 === 1 || byte === 0)) {
    let text = "";
    for (let i = 0; i + 1 < bytes.length; i += 2) text += String.fromCharCode(bytes[i + 1] ?? 0);
    return text;
  }
  return String.fromCharCode(...bytes);
}

type Operand = { kind: "string"; text: string } | { kind: "number"; value: number } | { kind: "array"; items: Operand[] } | { kind: "other" };

/** Collects the text a content stream shows, in the order it draws it. */
function textOf(content: string): string {
  const out: string[] = [];
  const stack: Operand[][] = [[]];
  const operands = () => stack[stack.length - 1]!;
  let i = 0;
  const n = content.length;

  while (i < n) {
    const ch = content[i]!;
    if (ch === "(") {
      const bytes: number[] = [];
      let depth = 1;
      i += 1;
      while (i < n && depth > 0) {
        const c = content[i]!;
        if (c === "\\") {
          const next = content[i + 1] ?? "";
          const escapes: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12, "(": 40, ")": 41, "\\": 92 };
          if (next in escapes) {
            bytes.push(escapes[next]!);
            i += 2;
          } else if (/[0-7]/.test(next)) {
            const octal = content.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)![0];
            bytes.push(Number.parseInt(octal, 8) & 0xff);
            i += 1 + octal.length;
          } else if (next === "\r" || next === "\n") {
            i += next === "\r" && content[i + 2] === "\n" ? 3 : 2;
          } else {
            i += 1;
          }
          continue;
        }
        if (c === "(") depth += 1;
        if (c === ")") {
          depth -= 1;
          if (depth === 0) break;
        }
        bytes.push(c.charCodeAt(0) & 0xff);
        i += 1;
      }
      i += 1;
      operands().push({ kind: "string", text: decodeBytes(bytes) });
      continue;
    }
    if (ch === "<" && content[i + 1] !== "<") {
      const close = content.indexOf(">", i);
      if (close < 0) break;
      const hex = content.slice(i + 1, close).replace(/[^0-9a-fA-F]/g, "");
      const bytes: number[] = [];
      for (let j = 0; j < hex.length; j += 2) bytes.push(Number.parseInt(hex.slice(j, j + 2).padEnd(2, "0"), 16));
      operands().push({ kind: "string", text: decodeBytes(bytes) });
      i = close + 1;
      continue;
    }
    if (ch === "[") {
      stack.push([]);
      i += 1;
      continue;
    }
    if (ch === "]") {
      const items = stack.length > 1 ? stack.pop()! : [];
      operands().push({ kind: "array", items });
      i += 1;
      continue;
    }
    if (ch === "%") {
      while (i < n && content[i] !== "\n" && content[i] !== "\r") i += 1;
      continue;
    }
    if (/[\s<>{}/]/.test(ch)) {
      if (ch === "/") {
        i += 1;
        while (i < n && !/[\s/[\]()<>{}%]/.test(content[i]!)) i += 1;
        operands().push({ kind: "other" });
        continue;
      }
      i += ch === "<" || ch === ">" ? 2 : 1;
      continue;
    }
    const token = content.slice(i).match(/^[^\s/[\]()<>{}%]+/)?.[0] ?? ch;
    i += token.length;
    const number = Number(token);
    if (token !== "" && Number.isFinite(number) && /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(token)) {
      operands().push({ kind: "number", value: number });
      continue;
    }
    // An operator: act on what came before it, then start afresh.
    const args = operands();
    const lastString = [...args].reverse().find((operand) => operand.kind === "string");
    switch (token) {
      case "Tj":
        if (lastString?.kind === "string") out.push(lastString.text);
        break;
      case "'":
      case '"':
        out.push("\n");
        if (lastString?.kind === "string") out.push(lastString.text);
        break;
      case "TJ": {
        const array = [...args].reverse().find((operand) => operand.kind === "array");
        if (array?.kind === "array") {
          out.push(
            array.items
              .map((item) => (item.kind === "string" ? item.text : item.kind === "number" && item.value < -250 ? " " : ""))
              .join(""),
          );
        }
        break;
      }
      case "T*":
      case "ET":
        out.push("\n");
        break;
      case "Td":
      case "TD":
      case "Tm":
        out.push(" ");
        break;
      default:
        break;
    }
    stack.length = 1;
    stack[0] = [];
  }
  return out.join("");
}

/**
 * The report's own text, or null when it has no readable text layer (a scan,
 * or fonts whose codes are not letters). Whitespace is collapsed; nothing is
 * reworded.
 */
export function extractPdfText(bytes: Uint8Array, limit = MAX_REPORT_TEXT_CHARS): string | null {
  const raw = Buffer.from(bytes).toString("latin1");
  if (!raw.startsWith("%PDF-")) return null;
  const pieces: string[] = [];
  let length = 0;
  for (const stream of contentStreams(raw)) {
    const text = textOf(stream);
    pieces.push(text);
    length += text.length;
    if (length > limit * 2) break;
  }
  const text = pieces
    .join("\n")
    .normalize("NFKC")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim()
    .slice(0, limit);

  // Too little that reads as words or numbers: there is no usable text layer.
  const visible = text.replace(/\s/g, "");
  const readable = (visible.match(/[\p{L}\p{N}]/gu) ?? []).length;
  if (readable < 20 || readable / Math.max(1, visible.length) < 0.5) return null;
  return text;
}
