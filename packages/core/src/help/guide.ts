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
 * `help` area of the message catalogs (`i18n/messages/areas/help/`). English
 * is `helpEn`, so it has one source; another language is the same guide read
 * through that person's translator (`localizedGuide(t)`), with the same ids
 * and anchors. Keywords stay English: they are a search aid, never shown.
 */
import { helpEn } from "../i18n/messages/areas/help/en";
import type { Translate } from "../i18n/translate";

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
};

/** The groups, by their English names — which is also how they are identified. */
export const GUIDE_GROUPS = [
  "Getting started",
  "Everyday use",
  "Your household",
  "Privacy and trust",
] as const;
export type GuideGroup = (typeof GUIDE_GROUPS)[number];

type HelpKey = keyof typeof helpEn;

/** Reads one of the guide's words: English by default, a person's language through their translator. */
type Words = (key: HelpKey) => string;

const english: Words = (key) => helpEn[key];
const wordsOf = (t?: Translate): Words => (t ? (key) => t(key) : english);

const GROUP_KEYS: Record<GuideGroup, HelpKey> = {
  "Getting started": "help.group.gettingStarted",
  "Everyday use": "help.group.everydayUse",
  "Your household": "help.group.yourHousehold",
  "Privacy and trust": "help.group.privacyAndTrust",
};

type SectionShape = Pick<GuideSection, "id" | "group" | "keywords">;

/** Every section, in reading order. Its words are `help.guide.<id>.*`. */
const SECTIONS: readonly SectionShape[] = [
  {
    id: "what-wonderhome-is",
    group: "Getting started",
    keywords: ["about", "purpose", "overview", "what is", "intro", "mental load", "hometalk", "homebrain", "homesend"],
  },
  {
    id: "first-week",
    group: "Getting started",
    keywords: ["setup", "onboarding", "get started", "progress", "checklist", "100%", "wizard", "guided setup"],
  },
  {
    id: "accounts",
    group: "Getting started",
    keywords: ["sign in", "login", "password", "forgot", "reset", "google", "account", "locked out", "log out", "sign out"],
  },
  {
    id: "language",
    group: "Getting started",
    keywords: ["language", "hindi", "marathi", "arabic", "chinese", "mandarin", "中文", "singapore", "spanish", "french", "german", "translate", "region", "currency", "time zone", "date format", "units"],
  },
  {
    id: "talk-to-wonderhome",
    group: "Everyday use",
    keywords: ["ai", "assistant", "chat", "voice", "speak", "microphone", "ask", "command", "hometalk", "remind me", "reminder", "correct", "edit", "search messages"],
  },
  {
    id: "voice",
    group: "Everyday use",
    keywords: ["voice", "speech", "microphone", "hands-free", "live", "listen", "gemini live", "alexa", "speak out loud", "pause"],
  },
  {
    id: "home-send",
    group: "Everyday use",
    keywords: ["homesend", "upload", "photo", "pdf", "screenshot", "forward", "email", "share", "paperclip", "school notice", "receipt", "whatsapp", "voice note", "link", "undo"],
  },
  {
    id: "today-and-home",
    group: "Everyday use",
    keywords: ["dashboard", "home screen", "today", "agenda", "timeline", "needs you", "handled", "plan something", "swipe"],
  },
  {
    id: "notifications",
    group: "Everyday use",
    keywords: ["notification", "alert", "reminder", "quiet hours", "push", "notify", "snooze", "remind me later", "summary", "timing"],
  },
  {
    id: "bills",
    group: "Everyday use",
    keywords: ["bill", "payment", "money", "finance", "due", "overdue", "budget", "anomaly", "pay", "transaction", "currency"],
  },
  {
    id: "school",
    group: "Everyday use",
    keywords: ["school", "homework", "exam", "child", "study", "deadline", "portal", "teacher", "screenshot", "notice"],
  },
  {
    id: "meals-and-shopping",
    group: "Everyday use",
    keywords: ["meal", "recipe", "grocery", "shopping", "cart", "pantry", "food", "allergy", "run out", "nutrients", "receipt", "suggest", "preferences"],
  },
  {
    id: "health",
    group: "Everyday use",
    keywords: ["health", "fitness", "vitals", "weight", "blood pressure", "checkup", "appointment", "prescription", "medical record", "routine", "private"],
  },
  {
    id: "home-upkeep",
    group: "Everyday use",
    keywords: ["maintenance", "appliance", "repair", "service", "laundry", "pets", "weather", "upkeep", "device"],
  },
  {
    id: "household-and-roles",
    group: "Your household",
    keywords: ["invite", "member", "role", "permission", "head of family", "administrator", "admin", "child", "helper", "guardian", "remove member"],
  },
  {
    id: "family",
    group: "Your household",
    keywords: ["family", "pets", "profile", "photo", "family calls me", "event", "birthday", "protected time", "gift", "calendar"],
  },
  {
    id: "househelp",
    group: "Your household",
    keywords: ["househelper", "helper", "maid", "cook", "driver", "schedule", "leave", "absence", "away", "cover", "backup"],
  },
  {
    id: "outcomes",
    group: "Your household",
    keywords: ["outcome", "responsibility", "playbook", "routine", "policy", "owner", "who does what", "backup", "workload", "share the load", "fair", "balance"],
  },
  {
    id: "plan",
    group: "Your household",
    keywords: ["plan", "subscription", "pro", "max", "free", "price", "upgrade", "downgrade", "billing", "invoice", "trial"],
  },
  {
    id: "ai-autonomy",
    group: "Privacy and trust",
    keywords: ["autonomy", "permission", "approve", "execute", "automation", "control", "ai settings"],
  },
  {
    id: "certification",
    group: "Privacy and trust",
    keywords: ["belief review", "certification", "understanding", "belief", "correct", "source", "confidence", "wrong", "why", "homebrain", "explain"],
  },
  {
    id: "privacy",
    group: "Privacy and trust",
    keywords: ["privacy", "data", "security", "training", "delete", "export", "download", "gdpr", "consent"],
  },
  {
    id: "ai-key",
    group: "Privacy and trust",
    keywords: ["api key", "byok", "anthropic", "openai", "gemini", "model", "billing", "own key"],
  },
  {
    id: "connections",
    group: "Privacy and trust",
    keywords: ["integration", "connect", "calendar", "email", "provider", "sync", "google", "portal", "whatsapp", "alexa", "smart home", "devices", "weather", "app", "apps", "api", "partner", "developer", "key"],
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
export function localizedGuide(t?: Translate): GuideSection[] {
  const words = wordsOf(t);
  return SECTIONS.map(({ id, group, keywords }) => ({
    id,
    title: words(`help.guide.${id}.title` as HelpKey),
    summary: words(`help.guide.${id}.summary` as HelpKey),
    body: paragraphKeys(id).map(words),
    keywords,
    group,
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
  { id: "own-ai-account", section: "ai-key" },
  { id: "prepared-not-done", section: "talk-to-wonderhome" },
  { id: "wrong-name", section: "talk-to-wonderhome" },
  { id: "pay-for-plan", section: "plan" },
  { id: "full-setup", section: "first-week" },
  { id: "budget", section: "bills" },
  { id: "other-apps", section: "connections" },
];

/** The questions people ask first, in one person's language. */
export function localizedFaq(t?: Translate): FaqEntry[] {
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
export function groupTitle(group: GuideGroup, t?: Translate): string {
  return wordsOf(t)(GROUP_KEYS[group]);
}

/**
 * Every section grouped for rendering, in the order the groups are declared.
 * `group` identifies it; `title` is what a person reads.
 */
export function guideByGroup(
  t?: Translate,
): { group: GuideGroup; title: string; sections: GuideSection[] }[] {
  const guide = localizedGuide(t);
  return GUIDE_GROUPS.map((group) => ({
    group,
    title: groupTitle(group, t),
    sections: guide.filter((section) => section.group === group),
  })).filter((entry) => entry.sections.length > 0);
}
