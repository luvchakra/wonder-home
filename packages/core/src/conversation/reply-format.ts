/**
 * The assistant's reply format: the little the chat can render beyond plain
 * sentences, and the only places a reply may link to.
 *
 * A reply is text with three affordances — paragraphs, a bullet list (lines
 * starting "- "), `**bold**` — and links written `[label](/path)` that go
 * somewhere in this app. Nothing else: no headings, no raw HTML, no outside
 * URLs. The model is told the same grammar, and whatever it writes is parsed
 * here rather than rendered as markup, so a link to anywhere but a screen in
 * `APP_PLACES` comes out as its label and nothing more. That is the whole
 * safety argument: the parser produces text, emphasis and vetted paths, and
 * the renderer only ever sees those.
 */

export type Inline = { kind: "text"; text: string } | { kind: "bold"; text: string } | { kind: "link"; label: string; href: string };

export type Block = { kind: "paragraph"; inlines: Inline[] } | { kind: "list"; items: Inline[][] };

/** Every screen a reply may send somebody to, and what they will find there. */
export const APP_PLACES: readonly { href: string; label: string; what: string }[] = [
  { href: "/", label: "Home", what: "what needs you and what WonderHome handled" },
  { href: "/today", label: "Today", what: "the day's plan" },
  { href: "/family", label: "Family", what: "the family calendar, members and availability" },
  { href: "/household/members", label: "People", what: "who is in the household and their roles" },
  { href: "/household/responsibilities", label: "Responsibilities", what: "who is responsible for what and how much WonderHome may do" },
  { href: "/househelper", label: "Househelper", what: "the helper's days, arrangement and absences" },
  { href: "/groceries", label: "Groceries", what: "the grocery list, supplies and orders" },
  { href: "/meals", label: "Meals", what: "the meal plan, recipes and preferences" },
  { href: "/bills", label: "Bills", what: "bills, due dates and payments" },
  { href: "/school", label: "School", what: "school work, deadlines and messages from school" },
  { href: "/household/home", label: "Home & upkeep", what: "maintenance, services, laundry and pets" },
  { href: "/notifications", label: "Notifications", what: "everything WonderHome has raised" },
  { href: "/certification", label: "What WonderHome believes", what: "the facts WonderHome holds, to confirm or correct" },
  { href: "/household", label: "Manage household", what: "playbook, policies and AI autonomy" },
  { href: "/household/integrations", label: "Connected accounts", what: "school, calendar, shopping and email connections" },
  { href: "/settings", label: "Settings", what: "profile, privacy and the assistant's key" },
  { href: "/help", label: "Help", what: "the user guide" },
];

/** A path is allowed when it is one of the places, optionally with a query or fragment. */
export function isAllowedHref(href: string): boolean {
  const path = href.split(/[?#]/)[0] ?? "";
  return APP_PLACES.some((place) => place.href === path);
}

/** "[Bills](/bills)" for a known place, or its label alone. */
export function linkTo(href: string, label?: string): string {
  const place = APP_PLACES.find((entry) => entry.href === href.split(/[?#]/)[0]);
  const text = label ?? place?.label ?? href;
  return place ? `[${text}](${href})` : text;
}

/** The grammar, for a model that is asked to write in it. */
export function describeReplyFormat(): string {
  return [
    "Formatting: write short paragraphs separated by a blank line. When you list three or more things, use a bullet list with one item per line starting with \"- \". Use **bold** for a name or the single thing that matters most, never for whole sentences. No headings, no tables, no other markdown.",
    "Links: point the person to the screen where they can see or do something by writing [label](path), using ONLY these paths:",
    ...APP_PLACES.map((place) => `- ${place.href} — ${place.label}: ${place.what}`),
    "Never link anywhere else and never invent a path. A link belongs at the end of the sentence it helps, not on its own line.",
  ].join("\n");
}

export function parseReply(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: Inline[][] | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: "paragraph", inlines: parseInlines(paragraph.join(" ")) });
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    blocks.push({ kind: "list", items: list });
    list = null;
  };

  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      list ??= [];
      list.push(parseInlines(bullet[1] ?? ""));
      continue;
    }
    if (line === "") {
      flushParagraph();
      flushList();
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}

const INLINE = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function parseInlines(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) out.push({ kind: "text", text: text.slice(last, index) });
    if (match[1] !== undefined) {
      out.push({ kind: "bold", text: match[1] });
    } else if (match[2] !== undefined && match[3] !== undefined) {
      out.push(isAllowedHref(match[3]) ? { kind: "link", label: match[2], href: match[3] } : { kind: "text", text: match[2] });
    }
    last = index + match[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

/** The reply as plain words — for a notification, a log line, a test. */
export function plainText(text: string): string {
  return parseReply(text)
    .map((block) =>
      block.kind === "paragraph"
        ? block.inlines.map(inlineText).join("")
        : block.items.map((item) => `• ${item.map(inlineText).join("")}`).join("\n"),
    )
    .join("\n");
}

function inlineText(inline: Inline): string {
  return inline.kind === "link" ? inline.label : inline.text;
}
