/**
 * What WonderHome shows to someone who is not a member — crawlers, AI
 * agents and anonymous callers (docs/progress/2026-10-21-reverse-engineering-hardening.md).
 *
 * The product is a household's private space, so outside the landing page and
 * the way in there is nothing a crawler needs to read. These rules keep it
 * that way by default: `robots.txt` names the few public pages, refuses the
 * known AI-training and AI-agent crawlers everywhere, and the API's own
 * description is for signed-in members in production.
 *
 * None of this is an authorization gate — robots.txt is a request, honoured
 * only by crawlers that choose to. The gates are still the session, the
 * domain services and RLS.
 */

/** Pages a signed-out visitor, and a search engine, may read. */
export const PUBLIC_MARKETING_PATHS = ["/", "/legal"] as const;

/**
 * Crawlers that gather pages for AI training, AI search answers or AI agents.
 * Each is refused the whole site in robots.txt. A new one is added here.
 */
export const AI_CRAWLERS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-Web",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  "CCBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "Bytespider",
  "Amazonbot",
  "meta-externalagent",
  "meta-externalfetcher",
  "FacebookBot",
  "cohere-ai",
  "cohere-training-data-crawler",
  "Diffbot",
  "YouBot",
  "ImagesiftBot",
  "Omgilibot",
  "Timpibot",
  "AI2Bot",
] as const;

/**
 * The fetchers that turn a shared link into a card in a chat. An event's
 * invite link (`/e/<token>`) is sent over WhatsApp on purpose, so these may
 * read it and its picture — the link's token is still its only credential.
 */
export const LINK_PREVIEW_FETCHERS = [
  "facebookexternalhit",
  "WhatsApp",
  "Twitterbot",
  "Slackbot-LinkExpanding",
  "TelegramBot",
  "Discordbot",
  "LinkedInBot",
] as const;

export type RobotsRule = { userAgent: string | string[]; allow?: string[]; disallow: string[] };

/** What a public page needs fetched alongside it to render as a card. */
const PUBLIC_ASSETS = ["/og.png", "/icon", "/apple-touch-icon.png", "/manifest.webmanifest"];

/**
 * The robots.txt rules: AI crawlers refused everything; link-preview fetchers
 * the public pages and invite links; everyone else the public pages and
 * nothing more (the app behind sign-in, the API and every protocol endpoint).
 */
export function robotsRules(): RobotsRule[] {
  const publicPages = ["/$", ...PUBLIC_MARKETING_PATHS.filter((path) => path !== "/").map((path) => `${path}$`)];
  return [
    { userAgent: [...AI_CRAWLERS], disallow: ["/"] },
    { userAgent: [...LINK_PREVIEW_FETCHERS], allow: [...publicPages, "/e/", ...PUBLIC_ASSETS], disallow: ["/"] },
    { userAgent: "*", allow: [...publicPages, ...PUBLIC_ASSETS], disallow: ["/"] },
  ];
}

/**
 * Whether the API's own description (`/api/v1/openapi`) needs a signed-in
 * member. In production it does: a full map of every endpoint and its shapes
 * is a blueprint of the product, and a member's own app does not need it.
 * Local builds, CI and previews keep it open, which the API contract tests
 * read anonymously.
 */
export function apiDocsNeedSession(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.VERCEL_ENV === "production";
}

/** The robots meta every signed-in page carries: never indexed, never used for AI. */
export const MEMBERS_ROBOTS_META = "noindex, nofollow, noarchive, noai, noimageai";
