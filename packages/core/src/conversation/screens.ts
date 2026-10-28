import { PRIMARY_NAVIGATION } from "../navigation/primary-navigation";
import { SECONDARY_NAVIGATION, secondaryNavigationFor, type Viewer } from "../navigation/secondary-navigation";

/**
 * "Take me to the grocery list", "open the calendar", "go back to HomeTalk"
 * (the owner, 2026-10-18): HomeTalk opens a screen while the conversation
 * carries on.
 *
 * Opening a screen reads nothing and changes nothing. The reply names the
 * screen and carries its path, and the browser goes there. The screen's own
 * route policy and permissions still decide what it shows. A screen this
 * person is never offered (a child's Bills) is not opened, and the reply
 * says so, so the conversation never promises a page that would refuse them.
 *
 * Only the screens below can be named, each by a fixed key the rules and a
 * model choose from. A path is never taken from what anyone said.
 */

export const SCREEN_KEYS = [
  "home",
  "calendar",
  "hometalk",
  "family",
  "more",
  "today",
  "groceries",
  "meals",
  "bills",
  "school",
  "househelper",
  "responsibilities",
  "upkeep",
  "places",
  "health",
  "review",
  "homesend",
  "notifications",
  "manage",
  "settings",
  "help",
] as const;
export type ScreenKey = (typeof SCREEN_KEYS)[number];

type Screen = { key: ScreenKey; label: string; href: string; words: readonly string[] };

const primary = (href: string) => PRIMARY_NAVIGATION.find((item) => item.href === href)!;
const secondary = (key: (typeof SECONDARY_NAVIGATION)[number]["key"]) => SECONDARY_NAVIGATION.find((item) => item.key === key)!;
const fromSecondary = (key: ScreenKey, navKey: (typeof SECONDARY_NAVIGATION)[number]["key"], words: readonly string[]): Screen => ({
  key,
  label: secondary(navKey).label,
  href: secondary(navKey).href,
  words,
});

/** Every screen HomeTalk can open, with the words people use for it. Lower case, no articles. */
export const SCREENS: readonly Screen[] = [
  { key: "home", label: primary("/").label, href: "/", words: ["home", "home screen", "home page", "homepage", "dashboard", "start"] },
  { key: "calendar", label: primary("/calendar").label, href: "/calendar", words: ["calendar", "family calendar", "events", "family events", "plans", "family plans"] },
  { key: "hometalk", label: primary("/ai").label, href: "/ai", words: ["hometalk", "home talk", "chat", "conversation", "our conversation", "this conversation", "assistant"] },
  { key: "family", label: primary("/family").label, href: "/family", words: ["family", "family members", "members", "people"] },
  { key: "more", label: primary("/more").label, href: "/more", words: ["more", "menu", "all screens"] },
  { key: "today", label: "Today", href: "/calendar?view=day", words: ["today's plan", "todays plan", "today plan", "plan for today", "today screen", "today page"] },
  fromSecondary("groceries", "groceries", ["groceries", "grocery", "grocery list", "groceries list", "shopping list", "shopping", "pantry", "what's at home", "stock"]),
  fromSecondary("meals", "meals", ["meals", "meal plan", "meal planner", "recipes", "meals and recipes", "food plan"]),
  fromSecondary("bills", "bills", ["bills", "bill", "bills and finance", "finance", "finances", "money", "payments"]),
  fromSecondary("school", "school", ["school", "kids and school", "kids & school", "homework", "school work"]),
  fromSecondary("househelper", "househelper", ["househelper", "househelpers", "house helper", "house helpers", "helper", "helpers", "help at home"]),
  fromSecondary("responsibilities", "responsibilities", ["responsibilities", "responsibility", "roles", "who does what", "chores"]),
  fromSecondary("upkeep", "upkeep", ["upkeep", "home and upkeep", "home & upkeep", "home upkeep", "maintenance", "appliances", "repairs"]),
  fromSecondary("places", "places", ["homeplaces", "home places", "places", "place book", "saved places", "our places"]),
  fromSecondary("health", "health", ["health", "fitness", "health and fitness", "health & fitness"]),
  fromSecondary("review", "certification", ["homebrain review", "homebrain", "review", "certification"]),
  fromSecondary("homesend", "homesend", ["homesend", "home send", "homesend inbox", "uploads"]),
  { key: "notifications", label: "Notifications", href: "/notifications", words: ["notifications", "reminders", "alerts", "inbox"] },
  fromSecondary("manage", "manage", ["manage household", "household settings", "manage the household", "playbook"]),
  fromSecondary("settings", "settings", ["settings", "my settings", "profile", "my profile", "settings and profile", "preferences"]),
  { key: "help", label: "Help", href: "/help", words: ["help page", "help pages", "user guide", "guide", "help screen"] },
];

const BY_KEY = new Map(SCREENS.map((screen) => [screen.key, screen]));

export function screenFor(key: unknown): Screen | null {
  return typeof key === "string" ? (BY_KEY.get(key as ScreenKey) ?? null) : null;
}

/** "the grocery list screen" → groceries: the words with articles and "screen/page/tab" taken off, matched whole. */
export function screenNamed(phrase: string): Screen | null {
  const words = phrase
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[.!?,]+$/g, "")
    .replace(/^(?:the|my|our|your)\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  const bare = words.replace(/\s+(?:screen|page|tab|section|area)$/, "").replace(/^(?:the|my|our|your)\s+/, "");
  for (const candidate of [words, bare]) {
    const found = SCREENS.find((screen) => screen.words.includes(candidate));
    if (found) return found;
  }
  return null;
}

/**
 * "Take me to the groceries", "open the calendar", "go back to HomeTalk",
 * "show me the shopping list page". Only a whole phrase that names a screen:
 * "show me tomorrow's schedule" is a question, not a screen.
 */
export function readOpenScreen(text: string): ScreenKey | null {
  const said = text.trim();
  // "Go home", "take me home", "back home".
  if (/^(?:go|take me|bring me|get me|back)(?: back)? home$/i.test(said)) return "home";
  const going = said.match(/^(?:(?:take|bring|get) me (?:back )?to|(?:let's |lets )?go (?:back )?to|go back|open(?: up)?|navigate to|switch to|jump to|move to|head to|bring up|pull up)\s+(.+)$/i);
  if (going) return screenNamed(going[1]!)?.key ?? null;
  // "Show me the bills" is as often a question as a place to go; only a
  // screen, page or list said as one is opened.
  const showing = said.match(/^(?:show me|show|i want to see|i'd like to see)\s+(.+?\s(?:screen|page|tab|section|list))$/i);
  return showing ? (screenNamed(showing[1]!)?.key ?? null) : null;
}

/** Whether this person is ever offered the screen, by the same rules the More screen and sidebar use. */
export function mayOpenScreen(key: ScreenKey, viewer: Viewer): boolean {
  const navKey = SECONDARY_NAVIGATION.find((item) => item.href === screenFor(key)?.href)?.key;
  if (!navKey) return true;
  return secondaryNavigationFor(viewer).some((item) => item.key === navKey);
}

/**
 * What HomeTalk says, and where the browser goes. A voice speaker with no
 * screen of its own (Alexa) is told where to find it instead.
 */
/**
 * Requests HomeTalk does not carry out itself — roles, new people, how it
 * asks — said once, plainly, with the screen where it is done (integration
 * tests IT-FAM-11, IT-FAM-12, IT-HH-09). A closed set of keys, never text
 * from the conversation.
 */
export const DONE_ON_SCREEN = {
  admin: "Making someone an Admin, or stepping one back, is done in Manage Household → Members & roles, where any Admin can do it.",
  add_member: "A new family member is added in Family, so their details and sign-in are set up properly.",
  add_helper: "A new helper is added in Househelper, with their days and what they do.",
  asking: "Whether I ask before acting is set in Settings → AI Assistant, and an outcome's autonomy in Manage Household.",
} as const;
export type DoneOnScreen = keyof typeof DONE_ON_SCREEN;

export function openScreenReply(key: unknown, options: { viewer: Viewer; hasScreen: boolean; because?: unknown }): { text: string; navigate: string | null } {
  const screen = screenFor(key);
  const lead = typeof options.because === "string" && options.because in DONE_ON_SCREEN ? `${DONE_ON_SCREEN[options.because as DoneOnScreen]} ` : "";
  if (!screen) return { text: "I can open Home, Calendar, Groceries, Meals, Family and the other WonderHome screens. Which one would you like?", navigate: null };
  if (!mayOpenScreen(screen.key, options.viewer)) return { text: `${lead}${screen.label} isn't one of your screens, so I've stayed here.`, navigate: null };
  if (!options.hasScreen) return { text: `${lead}There's no screen here to show ${screen.label} on. Open it in the WonderHome app.`, navigate: null };
  return { text: `${lead}Opening ${screen.label}.`, navigate: screen.href };
}
