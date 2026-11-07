import { z } from "zod";

/**
 * Every setting WonderHome's staff can change without Vercel (owner,
 * 2026-11-07: "Don't have a config in Vercel unless absolutely necessary").
 *
 * One entry per environment variable the server reads. A saved value wins over
 * the variable, and the variable over the reader's own default
 * (`runtime-env.ts`), so a deployment with nothing saved behaves exactly as it
 * did before. The inventory and what must stay in Vercel, with the reason for
 * each, are in docs/progress/2026-11-07-admin-portal.md.
 *
 * Nothing here is a bootstrap value: the database URL and keys, the cron and
 * webhook signing secrets, build-time `NEXT_PUBLIC_*` values and anything
 * read before the database can be are deliberately absent, and
 * `registry.test.ts` fails if one is added.
 */

export const SETTING_GROUPS = {
  ai: { label: "AI", page: "ai" },
  voice: { label: "Voice and Alexa", page: "ai" },
  whatsapp: { label: "WhatsApp", page: "integrations" },
  email: { label: "Email", page: "integrations" },
  push: { label: "Web push", page: "integrations" },
  places: { label: "Maps and places", page: "integrations" },
  weather: { label: "Weather", page: "integrations" },
  films: { label: "Films and shows", page: "integrations" },
  homesend: { label: "HomeSend", page: "integrations" },
  groceries: { label: "Grocery ordering", page: "integrations" },
  school: { label: "School portals", page: "integrations" },
  careers: { label: "Careers", page: "integrations" },
  billing: { label: "Payments", page: "integrations" },
  features: { label: "Features", page: "configuration" },
} as const satisfies Record<string, { label: string; page: SettingPage }>;

export type SettingPage = "ai" | "integrations" | "configuration";
export type SettingGroup = keyof typeof SETTING_GROUPS;

/** Who may change a setting. Every secret is the owner's, with a password step-up. */
export type SettingEditor = "operator" | "owner";

export type SettingDefinition = {
  key: string;
  label: string;
  group: SettingGroup;
  kind: "config" | "secret";
  /** How the editor asks for it: a choice is picked, not typed (rule 20). */
  input: { type: "text" } | { type: "number" } | { type: "choice"; options: readonly { value: string; label: string }[] };
  /** What a value must look like before it is saved. Secrets are checked for shape only. */
  schema: z.ZodType<string>;
  /** What the reader uses when nothing is saved and the variable is unset; null = off / none. */
  defaultValue: string | null;
  description: string;
  editableBy: SettingEditor;
  /** A saved value the reader would misread as "on"; it reaches the reader as empty instead. */
  emptyWhen?: string;
};

const text = (max = 200) => z.string().trim().min(1).max(max);
const https = z.string().trim().regex(/^https:\/\/[^\s]+$/, "must be an https:// address").max(300);
const choice = (...values: [string, ...string[]]) => z.enum(values);
const onOff = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
] as const;
const secret = (min = 8, max = 4096) => z.string().trim().min(min, `must be at least ${min} characters`).max(max).regex(/^\S+$/, "must not contain spaces");

const entries = [
  // AI
  {
    key: "WONDERHOME_AI_PROVIDER",
    label: "Provider of WonderHome's own AI key",
    group: "ai",
    kind: "config",
    input: { type: "choice", options: [{ value: "anthropic", label: "Anthropic (Claude)" }, { value: "google", label: "Google (Gemini)" }, { value: "openai", label: "OpenAI" }] },
    schema: choice("anthropic", "google", "openai"),
    defaultValue: "anthropic",
    description: "Which provider WonderHome's own key belongs to. A household's own key always comes first.",
    editableBy: "operator",
  },
  {
    key: "WONDERHOME_AI_KEY",
    label: "WonderHome's own AI key",
    group: "ai",
    kind: "secret",
    input: { type: "text" },
    schema: secret(20),
    defaultValue: null,
    description: "Used for households that have not added a key of their own. If it starts failing, platform admins get an email.",
    editableBy: "owner",
  },
  // Voice
  {
    key: "WONDERHOME_SPEECH_KEY",
    label: "Speech key",
    group: "voice",
    kind: "secret",
    input: { type: "text" },
    schema: secret(20),
    defaultValue: null,
    description: "WonderHome's own Gemini key for live voice, used when a household has none.",
    editableBy: "owner",
  },
  {
    key: "WONDERHOME_GEMINI_LIVE_MODEL",
    label: "Live voice model",
    group: "voice",
    kind: "config",
    input: { type: "text" },
    schema: text(80).regex(/^[a-z0-9.\-]+$/, "a model id, like gemini-3.8-live"),
    defaultValue: "gemini-3.8-live",
    description: "The Gemini Live model a spoken conversation uses.",
    editableBy: "operator",
  },
  {
    key: "ALEXA_SKILL_ID",
    label: "Alexa skill id",
    group: "voice",
    kind: "config",
    input: { type: "text" },
    schema: text(120).regex(/^amzn1\.ask\.skill\.[0-9a-f-]+$/, "starts with amzn1.ask.skill."),
    defaultValue: null,
    description: "From the Alexa developer console. Requests from any other skill are refused.",
    editableBy: "operator",
  },
  {
    key: "ALEXA_OAUTH_CLIENT_ID",
    label: "Alexa account-linking client id",
    group: "voice",
    kind: "config",
    input: { type: "text" },
    schema: text(120),
    defaultValue: null,
    description: "As entered on the Alexa console's account-linking page. Its secret stays in Vercel because it checks Alexa's calls in.",
    editableBy: "operator",
  },
  {
    key: "ALEXA_OAUTH_REDIRECT_URIS",
    label: "Alexa redirect addresses",
    group: "voice",
    kind: "config",
    input: { type: "text" },
    schema: z
      .string()
      .trim()
      .max(1000)
      .refine((value) => value.split(",").every((uri) => /^https:\/\/[^\s,]+$/.test(uri.trim())), "comma-separated https:// addresses"),
    defaultValue: null,
    description: "The only places a sign-in may be sent back to, copied from the Alexa console. Owner only: a wrong address could hand a sign-in to someone else.",
    editableBy: "owner",
  },
  // WhatsApp
  {
    key: "WHATSAPP_ACCESS_TOKEN",
    label: "WhatsApp access token",
    group: "whatsapp",
    kind: "secret",
    input: { type: "text" },
    schema: secret(20),
    defaultValue: null,
    description: "Meta's system-user token for sending messages. The app secret and verify token stay in Vercel: they check Meta's calls in.",
    editableBy: "owner",
  },
  {
    key: "WHATSAPP_PHONE_NUMBER_ID",
    label: "WhatsApp phone number id",
    group: "whatsapp",
    kind: "config",
    input: { type: "text" },
    schema: text(40).regex(/^\d+$/, "digits only"),
    defaultValue: null,
    description: "Meta's id for the sending number (not the number itself).",
    editableBy: "operator",
  },
  {
    key: "WHATSAPP_BUSINESS_NUMBER",
    label: "WhatsApp business number",
    group: "whatsapp",
    kind: "config",
    input: { type: "text" },
    schema: text(20).regex(/^\+\d{8,15}$/, "international format, like +919876543210"),
    defaultValue: null,
    description: "The number people message to link WhatsApp and send to HomeSend.",
    editableBy: "operator",
  },
  {
    key: "WHATSAPP_TEMPLATE_NAME",
    label: "WhatsApp message template",
    group: "whatsapp",
    kind: "config",
    input: { type: "text" },
    schema: text(80).regex(/^[a-z0-9_]+$/, "lowercase letters, digits and _"),
    defaultValue: null,
    description: "The approved template with two body variables (title, text) for reminders.",
    editableBy: "operator",
  },
  {
    key: "WHATSAPP_TEMPLATE_LANGUAGE",
    label: "WhatsApp template language",
    group: "whatsapp",
    kind: "config",
    input: { type: "text" },
    schema: text(10).regex(/^[a-z]{2}(_[A-Z]{2})?$/, "a language code, like en or en_US"),
    defaultValue: "en",
    description: "The language the template was approved in.",
    editableBy: "operator",
  },
  // Email
  {
    key: "WONDERHOME_SMTP_HOST",
    label: "Mail server",
    group: "email",
    kind: "config",
    input: { type: "text" },
    schema: text(120).regex(/^[a-z0-9.-]+$/i, "a host name"),
    defaultValue: null,
    description: "The SMTP server invites and reminders are sent through.",
    editableBy: "operator",
  },
  {
    key: "WONDERHOME_SMTP_PORT",
    label: "Mail server port",
    group: "email",
    kind: "config",
    input: { type: "choice", options: [{ value: "465", label: "465 (TLS)" }, { value: "587", label: "587 (STARTTLS)" }] },
    schema: choice("465", "587"),
    defaultValue: "465",
    description: "465 connects over TLS; 587 upgrades after connecting.",
    editableBy: "operator",
  },
  {
    key: "WONDERHOME_SMTP_USER",
    label: "Mailbox",
    group: "email",
    kind: "config",
    input: { type: "text" },
    schema: z.string().trim().email().max(200),
    defaultValue: null,
    description: "The mailbox that signs in to the mail server.",
    editableBy: "operator",
  },
  {
    key: "WONDERHOME_SMTP_PASSWORD",
    label: "Mailbox password",
    group: "email",
    kind: "secret",
    input: { type: "text" },
    schema: z.string().min(4).max(200),
    defaultValue: null,
    description: "The password for the mailbox above.",
    editableBy: "owner",
  },
  {
    key: "WONDERHOME_SMTP_FROM",
    label: "Sender name",
    group: "email",
    kind: "config",
    input: { type: "text" },
    schema: text(200),
    defaultValue: null,
    description: 'Who mail says it is from, like "WonderHome <connect@wonderapps.biz>". Empty: "WonderHome <mailbox>".',
    editableBy: "operator",
  },
  // Push
  {
    key: "WONDERHOME_VAPID_PUBLIC_KEY",
    label: "Web push public key",
    group: "push",
    kind: "config",
    input: { type: "text" },
    schema: text(200).regex(/^[A-Za-z0-9_-]{80,100}$/, "a VAPID public key"),
    defaultValue: null,
    description: "The public half of the push key pair. Owner only: changing it signs every device out of push.",
    editableBy: "owner",
  },
  {
    key: "WONDERHOME_VAPID_PRIVATE_KEY",
    label: "Web push private key",
    group: "push",
    kind: "secret",
    input: { type: "text" },
    schema: secret(40, 100),
    defaultValue: null,
    description: "The private half. Change both halves together.",
    editableBy: "owner",
  },
  {
    key: "WONDERHOME_VAPID_SUBJECT",
    label: "Web push contact",
    group: "push",
    kind: "config",
    input: { type: "text" },
    schema: text(200).regex(/^(mailto:|https:\/\/)/, "starts with mailto: or https://"),
    defaultValue: "mailto:support@wonderapps.biz",
    description: "Who the push services can contact about WonderHome's messages.",
    editableBy: "operator",
  },
  // Places
  {
    key: "GOOGLE_MAPS_API_KEY",
    label: "Google Maps key",
    group: "places",
    kind: "secret",
    input: { type: "text" },
    schema: secret(20),
    defaultValue: null,
    description: "Places (New) and Maps Static, used on the server only: home address and school search.",
    editableBy: "owner",
  },
  // Weather
  {
    key: "WONDERHOME_WEATHER_PROVIDER",
    label: "Weather",
    group: "weather",
    kind: "config",
    input: { type: "choice", options: [{ value: "open-meteo", label: "Open-Meteo" }, { value: "off", label: "Off" }] },
    schema: choice("open-meteo", "off"),
    defaultValue: "off",
    description: "Where Today's weather comes from.",
    editableBy: "operator",
  },
  {
    key: "OPEN_METEO_API_KEY",
    label: "Open-Meteo key",
    group: "weather",
    kind: "secret",
    input: { type: "text" },
    schema: secret(8),
    defaultValue: null,
    description: "Only for Open-Meteo's commercial endpoint. Empty: the free endpoint.",
    editableBy: "owner",
  },
  // Films
  {
    key: "TMDB_API_KEY",
    label: "TMDB key",
    group: "films",
    kind: "secret",
    input: { type: "text" },
    schema: secret(16),
    defaultValue: null,
    description: "A TMDB read-access token or API key, for film and show picks.",
    editableBy: "owner",
  },
  // HomeSend
  {
    key: "WONDERHOME_HOMESEND_EMAIL_DOMAIN",
    label: "HomeSend email domain",
    group: "homesend",
    kind: "config",
    input: { type: "text" },
    schema: text(120).regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "a domain, like in.wonderapps.biz"),
    defaultValue: null,
    description: "Each household's HomeSend address ends with this domain.",
    editableBy: "operator",
  },
  {
    key: "RESEND_API_KEY",
    label: "Resend key",
    group: "homesend",
    kind: "secret",
    input: { type: "text" },
    schema: secret(16),
    defaultValue: null,
    description: "Reads the mail sent to HomeSend addresses. The webhook secret stays in Vercel.",
    editableBy: "owner",
  },
  {
    key: "WONDERHOME_MALWARE_SCAN_PROVIDER",
    label: "Upload scanning",
    group: "homesend",
    kind: "config",
    input: { type: "choice", options: [{ value: "cloudmersive", label: "Cloudmersive" }, { value: "off", label: "Off" }] },
    schema: choice("cloudmersive", "off"),
    defaultValue: "off",
    description: "Scans every photo and file sent to HomeSend before it is read.",
    editableBy: "operator",
  },
  {
    key: "WONDERHOME_MALWARE_SCAN_ENDPOINT",
    label: "Scanner address",
    group: "homesend",
    kind: "config",
    input: { type: "text" },
    schema: https,
    defaultValue: null,
    description: "Only to use a scanner other than Cloudmersive's own address.",
    editableBy: "owner",
  },
  {
    key: "WONDERHOME_MALWARE_SCAN_KEY",
    label: "Scanner key",
    group: "homesend",
    kind: "secret",
    input: { type: "text" },
    schema: secret(16),
    defaultValue: null,
    description: "The scanning service's API key. With none, nothing is scanned.",
    editableBy: "owner",
  },
  // Groceries
  {
    key: "WONDERHOME_INSTAMART",
    label: "Instamart ordering",
    group: "groceries",
    kind: "config",
    input: { type: "choice", options: [{ value: "on", label: "On (Swiggy)" }, { value: "fixture", label: "Practice store (QA)" }, { value: "off", label: "Off" }] },
    schema: choice("on", "fixture", "off"),
    defaultValue: "off",
    description: "Lets a household order its grocery list on Swiggy Instamart.",
    editableBy: "operator",
  },
  {
    key: "SWIGGY_MCP_BASE",
    label: "Swiggy server",
    group: "groceries",
    kind: "config",
    input: { type: "choice", options: [{ value: "https://mcp.swiggy.com", label: "Production" }, { value: "https://mcp-staging.swiggy.com", label: "Staging" }] },
    schema: choice("https://mcp.swiggy.com", "https://mcp-staging.swiggy.com"),
    defaultValue: "https://mcp.swiggy.com",
    description: "Which Swiggy server orders go to.",
    editableBy: "owner",
  },
  // School
  {
    key: "WONDERHOME_SCHOOL_DEMO",
    label: "Demo school portal",
    group: "school",
    kind: "config",
    input: { type: "choice", options: onOff },
    schema: choice("on", "off"),
    defaultValue: "off",
    description: "A practice school portal, for showing and testing the school connection.",
    editableBy: "operator",
    emptyWhen: "off",
  },
  {
    key: "LOOPLEARNING_USERNAME",
    label: "Loop Learning username",
    group: "school",
    kind: "secret",
    input: { type: "text" },
    schema: z.string().trim().min(3).max(200),
    defaultValue: null,
    description: "WonderHome's partner sign-in for Loop Learning.",
    editableBy: "owner",
  },
  {
    key: "LOOPLEARNING_PASSWORD",
    label: "Loop Learning password",
    group: "school",
    kind: "secret",
    input: { type: "text" },
    schema: z.string().min(4).max(200),
    defaultValue: null,
    description: "The password for the sign-in above.",
    editableBy: "owner",
  },
  // Careers
  {
    key: "WONDERJOBS_CAREERS_URL",
    label: "WonderJobs address",
    group: "careers",
    kind: "config",
    input: { type: "text" },
    schema: https.refine((value) => /^https:\/\/([a-z0-9-]+\.)*wonderapps\.biz(\/|$)/.test(value), "an https address on wonderapps.biz"),
    defaultValue: null,
    description: "Where the public Careers pages read jobs from. The key is on Careers connection.",
    editableBy: "operator",
  },
  // Billing
  {
    key: "WONDERHOME_BILLING_PROVIDERS",
    label: "Payment providers",
    group: "billing",
    kind: "config",
    input: { type: "choice", options: [{ value: "razorpay", label: "Razorpay" }, { value: "stripe", label: "Stripe" }, { value: "razorpay,stripe", label: "Razorpay and Stripe" }, { value: "none", label: "None" }] },
    schema: choice("razorpay", "stripe", "razorpay,stripe", "none"),
    defaultValue: "none",
    description: "Which providers can take a payment. A plan never changes without a verified payment.",
    editableBy: "owner",
  },
  {
    key: "WONDERHOME_BILLING_INDIA_PROVIDER",
    label: "Provider for India",
    group: "billing",
    kind: "config",
    input: { type: "choice", options: [{ value: "razorpay", label: "Razorpay" }, { value: "stripe", label: "Stripe" }] },
    schema: choice("razorpay", "stripe"),
    defaultValue: "razorpay",
    description: "Used for payments in rupees, or from a household in India.",
    editableBy: "owner",
  },
  {
    key: "WONDERHOME_BILLING_INTERNATIONAL_PROVIDER",
    label: "Provider elsewhere",
    group: "billing",
    kind: "config",
    input: { type: "choice", options: [{ value: "razorpay", label: "Razorpay" }, { value: "stripe", label: "Stripe" }] },
    schema: choice("razorpay", "stripe"),
    defaultValue: "stripe",
    description: "Used for every other payment.",
    editableBy: "owner",
  },
  {
    key: "RAZORPAY_KEY_ID",
    label: "Razorpay key id",
    group: "billing",
    kind: "config",
    input: { type: "text" },
    schema: text(60).regex(/^rzp_(live|test)_[A-Za-z0-9]+$/, "starts with rzp_live_ or rzp_test_"),
    defaultValue: null,
    description: "Razorpay's public key id. The webhook secret stays in Vercel.",
    editableBy: "owner",
  },
  {
    key: "RAZORPAY_KEY_SECRET",
    label: "Razorpay key secret",
    group: "billing",
    kind: "secret",
    input: { type: "text" },
    schema: secret(16),
    defaultValue: null,
    description: "The secret half of the Razorpay key.",
    editableBy: "owner",
  },
  {
    key: "STRIPE_SECRET_KEY",
    label: "Stripe secret key",
    group: "billing",
    kind: "secret",
    input: { type: "text" },
    schema: secret(20).regex(/^(sk|rk)_(live|test)_/, "starts with sk_ or rk_"),
    defaultValue: null,
    description: "Stripe's secret or restricted key. The webhook secret stays in Vercel.",
    editableBy: "owner",
  },
  // Features
  {
    key: "WONDERHOME_FLAG_VOICE_CONVERSATION",
    label: "Voice conversation",
    group: "features",
    kind: "config",
    input: { type: "choice", options: onOff },
    schema: choice("on", "off"),
    defaultValue: "off",
    description: "Speech input and spoken replies in HomeTalk.",
    editableBy: "operator",
  },
  {
    key: "WONDERHOME_FLAG_PROACTIVE_AGENTS",
    label: "Proactive agents",
    group: "features",
    kind: "config",
    input: { type: "choice", options: onOff },
    schema: choice("on", "off"),
    defaultValue: "off",
    description: "The background plan, act and check loop.",
    editableBy: "operator",
  },
  {
    key: "WONDERHOME_FLAG_WHATSAPP_CHANNEL",
    label: "WhatsApp reminders",
    group: "features",
    kind: "config",
    input: { type: "choice", options: onOff },
    schema: choice("on", "off"),
    defaultValue: "off",
    description: "Reminders sent on WhatsApp to people who linked it.",
    editableBy: "operator",
  },
  {
    key: "WONDERHOME_DEVELOPER_API",
    label: "Partner API",
    group: "features",
    kind: "config",
    input: { type: "choice", options: onOff },
    schema: choice("on", "off"),
    defaultValue: "off",
    description: "Lets households make partner keys for /api/v1/partner.",
    editableBy: "operator",
  },
] as const satisfies readonly SettingDefinition[];

export type SettingKey = (typeof entries)[number]["key"];

export const PLATFORM_SETTINGS: readonly SettingDefinition[] = entries;

const BY_KEY = new Map<string, SettingDefinition>(PLATFORM_SETTINGS.map((entry) => [entry.key, entry]));

export function settingDefinition(key: string): SettingDefinition | null {
  return BY_KEY.get(key) ?? null;
}

/** The settings shown on one portal page, in registry order, grouped. */
export function settingsForPage(page: SettingPage): { group: SettingGroup; label: string; settings: SettingDefinition[] }[] {
  const groups: { group: SettingGroup; label: string; settings: SettingDefinition[] }[] = [];
  for (const entry of PLATFORM_SETTINGS) {
    if (SETTING_GROUPS[entry.group].page !== page) continue;
    let bucket = groups.find((group) => group.group === entry.group);
    if (!bucket) {
      bucket = { group: entry.group, label: SETTING_GROUPS[entry.group].label, settings: [] };
      groups.push(bucket);
    }
    bucket.settings.push(entry);
  }
  return groups;
}

/** Whether `role` may change `entry`. Support never may; secrets are the owner's alone. */
export function mayEdit(entry: SettingDefinition, role: "support" | "operator" | "owner"): boolean {
  if (role === "owner") return true;
  if (role === "operator") return entry.kind === "config" && entry.editableBy === "operator";
  return false;
}

export type ValidatedValue = { ok: true; value: string } | { ok: false; message: string };

/**
 * Checks a value against its entry before it is saved. "off" and "none" for a
 * choice that means off are saved as such: the reader treats them exactly as
 * it treats an unset variable.
 */
export function validateSetting(entry: SettingDefinition, raw: string): ValidatedValue {
  const parsed = entry.schema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: `${entry.label} ${parsed.error.issues[0]?.message ?? "is not valid"}.` };
  return { ok: true, value: parsed.data };
}

/** The last four characters a screen may show of a secret; nothing of a short one. */
export function lastFourOf(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length >= 12 ? trimmed.slice(-4) : null;
}
