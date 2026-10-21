/**
 * Referring to things while writing a chat message (the owner, 2026-10-21:
 * "/ can list all module related tasks in the app, @ can trigger name of all
 * members in app, including pets and helpers, # can be used to make a term
 * trending within the app. the trending words can be listed in home page").
 *
 * Pure: which picker the text at the caret asks for, how a picked name or tag
 * goes back into the text, which tags a message carries, and which tags are
 * trending across the messages a person can read. A `/` pick never becomes
 * text: it is the message's attachment, read again on the server.
 */

export type Trigger = { char: "/" | "@" | "#"; query: string; start: number; end: number };

/** Letters (any script), digits and underscores make a tag; it is kept in lower case. */
const TAG_BODY = "[\\p{L}\\p{M}\\p{N}_]{1,40}";
const TAG = new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}_&#])#(${TAG_BODY})`, "gu");

/**
 * The picker the text right before the caret asks for: a `/`, `@` or `#` that
 * starts a word, and what has been typed after it. A mention may run over
 * spaces ("@Upasana Ch"), the others end at a space.
 */
export function activeTrigger(text: string, caret: number): Trigger | null {
  const before = text.slice(0, caret);
  for (let index = before.length - 1; index >= 0 && before.length - index <= 41; index -= 1) {
    const char = before[index];
    if (char === "\n") return null;
    if (char === "/" || char === "@" || char === "#") {
      const preceding = index === 0 ? " " : before[index - 1]!;
      if (!/\s/.test(preceding)) return null;
      const query = before.slice(index + 1);
      if (char !== "@" && /\s/.test(query)) return null;
      if (char === "@" && /\s{2}|^\s/.test(query)) return null;
      return { char, query, start: index, end: caret };
    }
  }
  return null;
}

/** The text with the trigger's word replaced by `replacement` and a space after it, and where the caret goes. */
export function replaceTrigger(text: string, trigger: Trigger, replacement: string): { text: string; caret: number } {
  const after = text.slice(trigger.end);
  const inserted = replacement ? `${replacement} ` : "";
  const next = text.slice(0, trigger.start) + inserted + after.replace(/^ /, "");
  return { text: next, caret: trigger.start + inserted.length };
}

/** A tag as written: what was typed after `#`, letters and digits only, lower case; null when nothing is left. */
export function normaliseTag(raw: string): string | null {
  const cleaned = raw.normalize("NFKC").replace(/^#/, "").replace(/[^\p{L}\p{M}\p{N}_]/gu, "").toLocaleLowerCase();
  return cleaned.length > 0 ? cleaned.slice(0, 40) : null;
}

/** The tags a message carries, each once, in lower case. */
export function tagsIn(body: string): string[] {
  const found = new Set<string>();
  for (const match of body.normalize("NFKC").matchAll(TAG)) {
    const tag = normaliseTag(match[2] ?? "");
    if (tag && !/^\d+$/.test(tag)) found.add(tag);
  }
  return [...found];
}

export type TrendingTag = { tag: string; count: number; lastAt: string; threadId: string };

/**
 * The tags used most in the messages given (each message counts a tag once),
 * newest first among equals, with the chat it was last used in. Only what the
 * reader can read is ever passed in, so a tag from someone else's chat never
 * trends for them.
 */
export function trendingTags(messages: readonly { threadId: string; body: string; createdAt: string }[], limit = 6): TrendingTag[] {
  const byTag = new Map<string, TrendingTag>();
  for (const message of messages) {
    for (const tag of tagsIn(message.body)) {
      const known = byTag.get(tag);
      if (!known) byTag.set(tag, { tag, count: 1, lastAt: message.createdAt, threadId: message.threadId });
      else {
        known.count += 1;
        if (message.createdAt > known.lastAt) {
          known.lastAt = message.createdAt;
          known.threadId = message.threadId;
        }
      }
    }
  }
  return [...byTag.values()].sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt)).slice(0, limit);
}

export type Mentionable = { name: string; kind: "member" | "helper" | "pet" };

/**
 * A message split into plain text, the names it mentions ("@Asmi") and its
 * tags, for showing them apart. A name is a mention only when it is one of
 * the household's own; the longest name wins ("@Upasana Chakraborty" over
 * "@Upasana").
 */
export type Piece = { kind: "text" | "mention" | "tag"; text: string };

export function piecesOf(body: string, names: readonly string[]): Piece[] {
  const sorted = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length).map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const mention = sorted.length > 0 ? `@(?:${sorted.join("|")})(?![\\p{L}\\p{N}_])` : null;
  const pattern = new RegExp(`${mention ? `${mention}|` : ""}(?<=^|[^\\p{L}\\p{M}\\p{N}_&#])#${TAG_BODY}`, "giu");
  const pieces: Piece[] = [];
  let last = 0;
  for (const match of body.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) pieces.push({ kind: "text", text: body.slice(last, at) });
    pieces.push({ kind: match[0].startsWith("@") ? "mention" : "tag", text: match[0] });
    last = at + match[0].length;
  }
  if (last < body.length) pieces.push({ kind: "text", text: body.slice(last) });
  return pieces;
}
