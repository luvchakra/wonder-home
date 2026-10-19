/**
 * The user guide, as data.
 *
 * Written here rather than as markup in a page for two reasons. The guide
 * needs to be searchable by the assistant on the help screen, and an answer
 * has to be able to point at the exact section it came from — both of which
 * need structure, not prose in JSX. And keeping it in one place means the
 * guide and the FAQ cannot drift apart, because the FAQ answers *are* links
 * into these sections.
 *
 * Everything here describes what WonderHome actually does today. Where a
 * capability is not built, the guide says so plainly and says what happens
 * instead — the same rule the product's screens follow. A guide that
 * describes the roadmap is a guide that makes people feel the software is
 * broken.
 *
 * **Words live in the catalog** (story 22-004). This module holds the guide's
 * shape — each section's id (its URL anchor), its group and its search
 * keywords — and reads every title, summary, paragraph and FAQ from the
 * help catalogs (`i18n/messages/areas/help/`, read through `help/words.ts`
 * and never through the app's general catalogs, which reach the browser). English
 * is `helpEn`, so it has one source; another language is the same guide read
 * through `helpWords(language)` (`localizedGuide(words)`), with the same ids
 * and anchors. Keywords stay English: they are a search aid, never shown.
 */
import { englishHelp, helpEn, type HelpKey, type HelpWords } from "./words";

export type GuideSection = {
  /** Anchors the URL, so an answer can link to `/help#outcomes`. */
  id: string;
  title: string;
  /** One line under the heading. */
  summary: string;
  /** Paragraphs. Plain text — the page renders them, the search reads them. */
  body: string[];
  /** Extra words people might search with that the body does not contain. */
  keywords: string[];
  group: GuideGroup;
  /**
   * When this section's words last changed (YYYY-MM-DD), shown as "Last
   * updated". Set it in the same change that rewrites the section.
   */
  updated: string;
};

/** The groups, by their English names — which is also how they are identified. */
export const GUIDE_GROUPS = [
  "Getting started",
  "Everyday use",
  "Your household",
  "Privacy and trust",
] as const;
export type GuideGroup = (typeof GUIDE_GROUPS)[number];

/** Reads one of the guide's words: English by default, a person's language through `helpWords(language)`. */
const wordsOf = (t?: HelpWords): HelpWords => t ?? englishHelp;

const GROUP_KEYS: Record<GuideGroup, HelpKey> = {
  "Getting started": "help.group.gettingStarted",
  "Everyday use": "help.group.everydayUse",
  "Your household": "help.group.yourHousehold",
  "Privacy and trust": "help.group.privacyAndTrust",
};

type SectionShape = Pick<GuideSection, "id" | "group" | "keywords" | "updated">;

/** Every section, in reading order. Its words are `help.guide.<id>.*`. */
const SECTIONS: readonly SectionShape[] = [
  {
    id: "what-wonderhome-is",
    group: "Getting started",
    updated: "2026-10-16",
    keywords: ["about", "purpose", "overview", "what is", "intro", "mental load", "hometalk", "homebrain", "homesend"],
  },
  {
    id: "first-week",
    group: "Getting started",
    updated: "2026-10-17",
    keywords: ["setup", "onboarding", "get started", "progress", "checklist", "100%", "wizard", "guided setup"],
  },
  {
    id: "accounts",
    group: "Getting started",
    updated: "2026-10-16",
    keywords: ["sign in", "login", "password", "forgot", "reset", "google", "account", "locked out", "log out", "sign out"],
  },
  {
    id: "language",
    group: "Getting started",
    updated: "2026-10-17",
    keywords: ["language", "hindi", "marathi", "arabic", "chinese", "mandarin", "中文", "singapore", "spanish", "french", "german", "translate", "region", "currency", "time zone", "date format", "units"],
  },
  {
    id: "talk-to-wonderhome",
    group: "Everyday use",
    updated: "2026-10-19",
    keywords: ["after school", "after work", "office hours", "school hours", "place book", "saved places", "ai", "assistant", "chat", "voice", "speak", "microphone", "ask", "command", "hometalk", "remind me", "reminder", "correct", "edit", "search messages", "places", "restaurant", "dinner", "park", "nearby", "map", "homeplaces", "welcome", "getting to know", "vacation", "getaway", "trip", "weekend", "holiday", "look again", "check again", "database", "how many", "guests coming", "should we", "noticed", "likes", "food preferences", "who likes what", "what do you know"],
  },
  {
    id: "voice",
    group: "Everyday use",
    updated: "2026-10-18",
    keywords: ["voice", "speech", "microphone", "hands-free", "live", "listen", "gemini live", "alexa", "speak out loud", "pause", "open a screen", "take me to", "go to", "navigate", "glow", "getting ready", "wait", "connecting", "speak now"],
  },
  {
    id: "home-send",
    group: "Everyday use",
    updated: "2026-10-16",
    keywords: ["homesend", "upload", "photo", "pdf", "screenshot", "forward", "email", "share", "paperclip", "school notice", "receipt", "whatsapp", "voice note", "link", "undo"],
  },
  {
    id: "today-and-home",
    group: "Everyday use",
    updated: "2026-10-19",
    keywords: ["dashboard", "home screen", "today", "agenda", "timeline", "needs you", "handled", "plan something", "swipe", "pets", "what's new", "new features", "release notes", "changelog", "version", "update"],
  },
  {
    id: "calendar",
    group: "Everyday use",
    updated: "2026-10-19",
    keywords: ["next event", "next holiday", "upcoming", "calendar", "month", "week", "day", "year", "pinch", "holiday", "public holiday", "birthday", "repeat", "recurring", "private", "just me", "clash", "conflict", "filter", "skip", "where", "place", "address", "google maps", "directions", "appointments", "busy", "deliveries", "service visit", "helper away", "also show"],
  },
  {
    id: "notifications",
    group: "Everyday use",
    updated: "2026-10-18",
    keywords: ["notification", "alert", "reminder", "quiet hours", "push", "notify", "snooze", "remind me later", "summary", "timing"],
  },
  {
    id: "bills",
    group: "Everyday use",
    updated: "2026-09-26",
    keywords: ["bill", "payment", "money", "finance", "due", "overdue", "budget", "anomaly", "pay", "transaction", "currency"],
  },
  {
    id: "school",
    group: "Everyday use",
    updated: "2026-10-19",
    keywords: ["school", "homework", "exam", "child", "study", "deadline", "portal", "teacher", "screenshot", "notice", "class teacher", "subject teacher", "activity", "class", "music", "piano", "karate", "competition", "medal", "award", "timetable", "time table", "period", "exam", "exams", "unit test", "mid-term", "finals", "syllabus", "study material"],
  },
  {
    id: "meals-and-shopping",
    group: "Everyday use",
    updated: "2026-10-19",
    keywords: ["servings", "shortfall", "ingredients", "amount", "quantity", "meal", "recipe", "grocery", "shopping", "list", "to buy", "in stock", "pantry", "food", "allergy", "use by", "bought", "nutrients", "receipt", "suggest", "preferences", "catalog", "search", "brand", "picture", "nutrition", "change meal", "remove meal", "ingredients", "no recipe", "plan a meal", "save as recipe", "new recipe", "ingredient search", "calories per serving", "work out nutrients", "ideas", "what to cook", "suggest dishes", "from what is at home"],
  },
  {
    id: "health",
    group: "Everyday use",
    updated: "2026-10-18",
    keywords: ["health", "fitness", "vitals", "weight", "blood pressure", "checkup", "appointment", "prescription", "medical record", "routine", "private"],
  },
  {
    id: "home-upkeep",
    group: "Everyday use",
    updated: "2026-09-26",
    keywords: ["maintenance", "appliance", "repair", "service", "laundry", "pets", "weather", "upkeep", "device"],
  },
  {
    id: "household-and-roles",
    group: "Your household",
    updated: "2026-10-19",
    keywords: ["invite", "member", "role", "permission", "head of family", "administrator", "admin", "child", "helper", "guardian", "remove member", "activity", "audit", "history", "who changed", "relationships", "related", "father", "mother", "wife", "husband", "family tree"],
  },
  {
    id: "family",
    group: "Your household",
    updated: "2026-10-18",
    keywords: ["invite", "sign in", "email", "phone", "phone number", "sms", "code", "login", "share link", "family", "pets", "profile", "photo", "family calls me", "event", "birthday", "protected time", "gift", "calendar"],
  },
  {
    id: "househelp",
    group: "Your household",
    updated: "2026-10-18",
    keywords: ["househelper", "helper", "maid", "cook", "driver", "schedule", "leave", "absence", "away", "cover", "backup"],
  },
  {
    id: "outcomes",
    group: "Your household",
    updated: "2026-10-16",
    keywords: ["outcome", "responsibility", "playbook", "routine", "policy", "owner", "who does what", "backup", "workload", "share the load", "fair", "balance"],
  },
  {
    id: "plan",
    group: "Your household",
    updated: "2026-10-17",
    keywords: ["plan", "subscription", "pro", "max", "free", "price", "upgrade", "downgrade", "billing", "invoice", "trial"],
  },
  {
    id: "ai-autonomy",
    group: "Privacy and trust",
    updated: "2026-10-16",
    keywords: ["autonomy", "permission", "approve", "execute", "automation", "control", "ai settings"],
  },
  {
    id: "certification",
    group: "Privacy and trust",
    updated: "2026-10-19",
    keywords: ["belief review", "certification", "understanding", "belief", "correct", "source", "confidence", "wrong", "why", "homebrain", "explain", "while you slept", "tidy", "merged", "resting", "bring back", "connections", "memory"],
  },
  {
    id: "privacy",
    group: "Privacy and trust",
    updated: "2026-10-19",
    keywords: ["privacy", "data", "security", "training", "delete", "export", "download", "gdpr", "consent"],
  },
  {
    id: "ai-key",
    group: "Privacy and trust",
    updated: "2026-10-16",
    keywords: ["api key", "byok", "anthropic", "openai", "gemini", "model", "billing", "own key"],
  },
  {
    id: "connections",
    group: "Privacy and trust",
    updated: "2026-10-08",
    keywords: ["integration", "connect", "calendar", "email", "provider", "sync", "google", "portal", "whatsapp", "alexa", "smart home", "devices", "weather", "app", "apps", "api", "partner", "developer", "developer access", "key"],
  },
];

/** A section's paragraph keys, `body.1` onwards, counted from the English source. */
function paragraphKeys(id: string): HelpKey[] {
  const keys: HelpKey[] = [];
  for (let n = 1; `help.guide.${id}.body.${n}` in helpEn; n += 1) {
    keys.push(`help.guide.${id}.body.${n}` as HelpKey);
  }
  return keys;
}

/** The whole guide in one person's language — the same ids, anchors and keywords as English. */
export function localizedGuide(t?: HelpWords): GuideSection[] {
  const words = wordsOf(t);
  return SECTIONS.map(({ id, group, keywords, updated }) => ({
    id,
    title: words(`help.guide.${id}.title` as HelpKey),
    summary: words(`help.guide.${id}.summary` as HelpKey),
    body: paragraphKeys(id).map((key) => words(key)),
    keywords,
    group,
    updated,
  }));
}

/** The guide in English. */
export const GUIDE: GuideSection[] = localizedGuide();

export type FaqEntry = {
  /** Stable name for the entry; its words are `help.faq.<id>.q` and `.a`. */
  id: string;
  question: string;
  answer: string;
  /** The guide section that covers it in full. */
  section: string;
};

const FAQ_SHAPE: readonly Pick<FaqEntry, "id" | "section">[] = [
  { id: "quiet-home", section: "what-wonderhome-is" },
  { id: "tick-off", section: "outcomes" },
  { id: "spend-money", section: "bills" },
  { id: "children-bills", section: "household-and-roles" },
  { id: "training", section: "privacy" },
  { id: "download-delete", section: "privacy" },
  { id: "forgot-password", section: "accounts" },
  { id: "send-notice", section: "home-send" },
  { id: "other-language", section: "language" },
  { id: "reminder-timing", section: "notifications" },
  { id: "health-visibility", section: "health" },
  { id: "google-calendar", section: "connections" },
  { id: "calendar-private", section: "calendar" },
  { id: "own-ai-account", section: "ai-key" },
  { id: "prepared-not-done", section: "talk-to-wonderhome" },
  { id: "wrong-name", section: "talk-to-wonderhome" },
  { id: "pay-for-plan", section: "plan" },
  { id: "full-setup", section: "first-week" },
  { id: "budget", section: "bills" },
  { id: "other-apps", section: "connections" },
  { id: "activity-trail", section: "household-and-roles" },
];

/** The questions people ask first, in one person's language. */
export function localizedFaq(t?: HelpWords): FaqEntry[] {
  const words = wordsOf(t);
  return FAQ_SHAPE.map(({ id, section }) => ({
    id,
    question: words(`help.faq.${id}.q` as HelpKey),
    answer: words(`help.faq.${id}.a` as HelpKey),
    section,
  }));
}

/** The questions in English. */
export const FAQ: FaqEntry[] = localizedFaq();

/** A group's heading in one person's language. */
export function groupTitle(group: GuideGroup, t?: HelpWords): string {
  return wordsOf(t)(GROUP_KEYS[group]);
}

/**
 * Every section grouped for rendering, in the order the groups are declared.
 * `group` identifies it; `title` is what a person reads.
 */
export function guideByGroup(
  t?: HelpWords,
): { group: GuideGroup; title: string; sections: GuideSection[] }[] {
  const guide = localizedGuide(t);
  return GUIDE_GROUPS.map((group) => ({
    group,
    title: groupTitle(group, t),
    sections: guide.filter((section) => section.group === group),
  })).filter((entry) => entry.sections.length > 0);
}
