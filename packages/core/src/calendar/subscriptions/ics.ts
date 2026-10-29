/**
 * Story 26-022 — a defensive ICS (RFC 5545) parser.
 *
 * The feed is untrusted. This parser never throws, ignores what it cannot
 * understand, and stops after a bounded number of events so a hostile or
 * runaway feed cannot exhaust memory. It extracts only the VEVENT properties
 * WonderHome imports; everything else (VTODO, VJOURNAL, VALARM, custom
 * X- properties) is skipped. Interpreting dates/timezones is the time module's
 * job (`time.ts`) and expanding recurrence is the recurrence module's
 * (`recurrence.ts`) — this layer only turns bytes into structured properties.
 */

/** The hard ceiling on events read from one feed, whatever the caller asks for. */
export const MAX_PARSED_EVENTS = 2000;

export type IcsProperty = { value: string; params: Record<string, string> };

export type IcsRawEvent = {
  uid: string | null;
  summary: string | null;
  description: string | null;
  location: string | null;
  dtstart: IcsProperty | null;
  dtend: IcsProperty | null;
  duration: string | null;
  rrule: string | null;
  /** Each excluded date, flattened from any comma-separated or repeated EXDATE. */
  exdates: IcsProperty[];
  status: string | null;
  /** Present on an override of one occurrence of a recurring series. */
  recurrenceId: IcsProperty | null;
};

export type ParsedIcs = { events: IcsRawEvent[]; truncated: boolean };

/** Unfolds RFC 5545 line folding: a line beginning with a space or tab continues the previous one. */
function unfold(text: string): string[] {
  const rawLines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const lines: string[] = [];
  for (const line of rawLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

/** Splits a content line into its property name, parameters and raw value, respecting quoted params. */
function splitLine(line: string): { name: string; params: Record<string, string>; value: string } | null {
  let inQuote = false;
  let colon = -1;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') inQuote = !inQuote;
    else if (ch === ":" && !inQuote) {
      colon = i;
      break;
    }
  }
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);

  // Split the head on ';' not inside quotes.
  const segments: string[] = [];
  let current = "";
  inQuote = false;
  for (const ch of head) {
    if (ch === '"') inQuote = !inQuote;
    if (ch === ";" && !inQuote) {
      segments.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  segments.push(current);

  const name = (segments.shift() ?? "").trim().toUpperCase();
  if (!name) return null;
  const params: Record<string, string> = {};
  for (const segment of segments) {
    const eq = segment.indexOf("=");
    if (eq < 0) continue;
    const key = segment.slice(0, eq).trim().toUpperCase();
    const raw = segment.slice(eq + 1).trim();
    if (key) params[key] = raw.replace(/^"(.*)"$/, "$1");
  }
  return { name, params, value };
}

/** Unescapes an ICS TEXT value: \\n \\N → newline, \\, \\; \\\\ → the literal character. */
export function unescapeText(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === "\\" && i + 1 < value.length) {
      const next = value[i + 1]!;
      i += 1;
      if (next === "n" || next === "N") out += "\n";
      else if (next === "," || next === ";" || next === "\\") out += next;
      else out += next;
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * Parses an ICS document into structured VEVENTs. Never throws; a malformed
 * line is skipped. Stops after `maxEvents` (default and ceiling `MAX_PARSED_EVENTS`)
 * and reports `truncated` so the caller knows the feed was larger.
 */
export function parseIcs(text: string, opts: { maxEvents?: number } = {}): ParsedIcs {
  const cap = Math.min(Math.max(1, opts.maxEvents ?? MAX_PARSED_EVENTS), MAX_PARSED_EVENTS);
  const lines = unfold(text);
  const events: IcsRawEvent[] = [];
  let current: IcsRawEvent | null = null;
  let truncated = false;
  // Depth of nested components inside a VEVENT (e.g. VALARM) we ignore wholesale.
  let nested = 0;

  for (const line of lines) {
    const parsed = splitLine(line);
    if (!parsed) continue;
    const { name, params, value } = parsed;

    if (name === "BEGIN") {
      const component = value.trim().toUpperCase();
      if (component === "VEVENT" && current === null && nested === 0) {
        current = { uid: null, summary: null, description: null, location: null, dtstart: null, dtend: null, duration: null, rrule: null, exdates: [], status: null, recurrenceId: null };
      } else if (current) {
        nested += 1; // Inside a VEVENT, any BEGIN opens a sub-component we skip.
      }
      continue;
    }
    if (name === "END") {
      const component = value.trim().toUpperCase();
      if (component === "VEVENT" && nested === 0 && current) {
        events.push(current);
        current = null;
        if (events.length >= cap) {
          truncated = true;
          break;
        }
      } else if (nested > 0) {
        nested -= 1;
      }
      continue;
    }
    if (!current || nested > 0) continue;

    switch (name) {
      case "UID":
        current.uid = value.trim();
        break;
      case "SUMMARY":
        current.summary = unescapeText(value);
        break;
      case "DESCRIPTION":
        current.description = unescapeText(value);
        break;
      case "LOCATION":
        current.location = unescapeText(value);
        break;
      case "DTSTART":
        current.dtstart = { value: value.trim(), params };
        break;
      case "DTEND":
        current.dtend = { value: value.trim(), params };
        break;
      case "DURATION":
        current.duration = value.trim();
        break;
      case "RRULE":
        current.rrule = value.trim();
        break;
      case "EXDATE":
        for (const one of value.split(",")) {
          const trimmed = one.trim();
          if (trimmed) current.exdates.push({ value: trimmed, params });
        }
        break;
      case "STATUS":
        current.status = value.trim().toUpperCase();
        break;
      case "RECURRENCE-ID":
        current.recurrenceId = { value: value.trim(), params };
        break;
      default:
        break;
    }
  }

  return { events, truncated };
}
