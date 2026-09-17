/**
 * Redaction for logs and error reports.
 *
 * The security baseline says credentials and raw sensitive household content
 * never reach logs. Relying on every call site to remember that does not work,
 * so anything on its way to a log goes through here first.
 */

const SECRET_KEY = /(secret|token|password|passwd|api[_-]?key|service[_-]?role|authorization|cookie|credential|refresh[_-]?token|access[_-]?token)/i;

/** Household content that is private by default, even inside our own systems. */
const PRIVATE_CONTENT_KEY = /(transcript|message|content|body|prompt|note|address|phone|dob|date_of_birth|email)/i;

export const REDACTED = "[redacted]";

export type RedactOptions = {
  /** Keys to keep verbatim, e.g. an id that is already safe to log. */
  allow?: readonly string[];
  maxDepth?: number;
};

export function redact(value: unknown, options: RedactOptions = {}): unknown {
  const allow = new Set(options.allow ?? []);
  const maxDepth = options.maxDepth ?? 6;

  function walk(input: unknown, depth: number): unknown {
    if (depth > maxDepth) return REDACTED;
    if (input === null || typeof input !== "object") return scalar(input);
    if (Array.isArray(input)) return input.map((item) => walk(item, depth + 1));

    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
      if (allow.has(key)) {
        out[key] = raw;
      } else if (SECRET_KEY.test(key) || PRIVATE_CONTENT_KEY.test(key)) {
        out[key] = REDACTED;
      } else {
        out[key] = walk(raw, depth + 1);
      }
    }
    return out;
  }

  return walk(value, 0);
}

/** Catches credentials that arrive inside a string rather than under a key. */
function scalar(input: unknown): unknown {
  if (typeof input !== "string") return input;
  return input
    .replace(/\b(eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b/g, REDACTED)
    .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, REDACTED)
    .replace(/\b(?:postgres|postgresql):\/\/[^\s"']+/g, REDACTED)
    .replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, REDACTED);
}
