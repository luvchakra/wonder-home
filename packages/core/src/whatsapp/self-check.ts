/**
 * "Test WhatsApp" on Platform admin → Integrations (owner, 2026-11-22: "add a
 * test button for WhatsApp"). Each check answers with one plain line: ✓ or ✗
 * and what to do. Never a secret's value (only "ends in XXXX"), never a
 * message, a HomeSend item or a reply: the webhook self-test carries a marker
 * the webhook recognises after the signature check and drops
 * (`isWhatsAppSelfTest`).
 *
 * Meta's docs (read 2026-11-22): the phone number node gives
 * `display_phone_number`, `verified_name`, `quality_rating`; a WABA delivers
 * webhooks to an app only once the app is in `GET /{waba-id}/subscribed_apps`
 * (embedded-signup webhooks page: "You must individually subscribe to every
 * Messaging account"); the app's own callback URL and its `messages` field are
 * set in the App Dashboard, and `GET /{app-id}/subscriptions` (app access token)
 * reports them where Meta returns them, though its reference says WhatsApp
 * webhooks are configured in the dashboard, so a missing entry there is
 * reported as "can't confirm", not as a fault.
 */

export const WHATSAPP_SELF_TEST_OBJECT = "wonderhome_self_test";
export const WHATSAPP_CHECK_TIMEOUT_MS = 8_000;
/** The version the sender uses (`notifications/whatsapp.ts`), so the test sees what sending sees. */
export const WHATSAPP_GRAPH_VERSION = "v21.0";

type Fetch = typeof fetch;

export type CheckLine = { id: string; ok: boolean | null; title: string; detail: string };

/** A body the webhook accepts (signed) and drops: no entries, a marker object. */
export function selfTestBody(nonce: string): string {
  return JSON.stringify({ object: WHATSAPP_SELF_TEST_OBJECT, nonce, entry: [] });
}

export function isWhatsAppSelfTest(payload: unknown): boolean {
  return typeof payload === "object" && payload !== null && (payload as { object?: unknown }).object === WHATSAPP_SELF_TEST_OBJECT;
}

/** `sha256=<hex>`: what Meta sends in `X-Hub-Signature-256`. */
export async function signWhatsAppBody(body: string, appSecret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `sha256=${[...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function endsIn(secret: string | null | undefined): string {
  const value = secret?.trim() ?? "";
  return value.length >= 12 ? `ends in ${value.slice(-4)}` : "set";
}

// ---------------------------------------------------------------------------
// 1. Settings present, and where each comes from.
// ---------------------------------------------------------------------------

export type SettingSourceLine = { key: string; label: string; source: "saved" | "environment" | "default" | "unset"; required: boolean };

export function settingsLine(rows: readonly SettingSourceLine[]): CheckLine {
  const word = { saved: "saved here", environment: "Vercel", default: "default", unset: "missing" } as const;
  const missing = rows.filter((row) => row.required && row.source === "unset");
  const detail = rows.map((row) => `${row.label}: ${word[row.source]}`).join(" · ");
  return {
    id: "settings",
    ok: missing.length === 0,
    title: missing.length === 0 ? "Settings present" : `Missing: ${missing.map((row) => row.label).join(", ")}`,
    detail: missing.length === 0 ? detail : `Save ${missing.length === 1 ? "it" : "them"} below. ${detail}`,
  };
}

// ---------------------------------------------------------------------------
// Graph API calls, each with a timeout; an error is read for its code only.
// ---------------------------------------------------------------------------

type GraphError = { code?: number; error_subcode?: number; message?: string };
type GraphAnswer<T> = { ok: true; body: T } | { ok: false; status: number; error: GraphError | null; unreachable?: boolean };

async function graphGet<T>(fetchImpl: Fetch, path: string, token: string, timeoutMs: number): Promise<GraphAnswer<T>> {
  try {
    const response = await fetchImpl(`https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${path}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as (T & { error?: GraphError }) | null;
    if (response.ok && body && !body.error) return { ok: true, body };
    return { ok: false, status: response.status, error: body?.error ?? null };
  } catch {
    return { ok: false, status: 0, error: null, unreachable: true };
  }
}

/** Plain words for a Graph refusal. */
export function graphTrouble(answer: Extract<GraphAnswer<unknown>, { ok: false }>, what: string): string {
  if (answer.unreachable) return `Meta didn't answer in time. Try again in a minute.`;
  const code = answer.error?.code;
  const sub = answer.error?.error_subcode;
  if (code === 190 || sub === 463 || sub === 467) return `Access token expired or invalid. Generate a permanent system-user token in Meta Business Settings → System users, and save it below.`;
  if (code === 200 || code === 10) return `The token isn't allowed to read ${what}. Give the system user the whatsapp_business_management and whatsapp_business_messaging permissions.`;
  if (code === 100) return `Meta doesn't know ${what}. Check the id saved below.`;
  if (code === 4 || code === 80008 || answer.status === 429) return `Meta is limiting requests just now. Try again in a few minutes.`;
  return `Meta refused (${answer.status || "no answer"}${code ? `, code ${code}` : ""}).`;
}

// ---------------------------------------------------------------------------
// 2. Access token valid, and the number it speaks for.
// ---------------------------------------------------------------------------

function digits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export async function checkAccessToken(input: { accessToken: string | null; phoneNumberId: string | null; businessNumber: string | null; fetch?: Fetch; timeoutMs?: number }): Promise<CheckLine> {
  const id = "token";
  if (!input.accessToken || !input.phoneNumberId) return { id, ok: false, title: "Access token not tested", detail: "Save the access token and phone number id first." };
  const answer = await graphGet<{ display_phone_number?: string; verified_name?: string; quality_rating?: string }>(
    input.fetch ?? fetch,
    `${encodeURIComponent(input.phoneNumberId)}?fields=display_phone_number,verified_name,quality_rating`,
    input.accessToken,
    input.timeoutMs ?? WHATSAPP_CHECK_TIMEOUT_MS,
  );
  if (!answer.ok) return { id, ok: false, title: "Access token not accepted", detail: graphTrouble(answer, "this phone number id") };
  const shown = answer.body.display_phone_number ?? "unknown number";
  const name = answer.body.verified_name ?? "no verified name";
  const quality = answer.body.quality_rating ? `, quality ${answer.body.quality_rating}` : "";
  const matches = input.businessNumber ? digits(shown) === digits(input.businessNumber) : null;
  return {
    id,
    ok: matches !== false,
    title: matches === false ? "Access token works, but for a different number" : "Access token valid",
    detail:
      `Meta says this is ${shown} (${name}${quality}).` +
      (matches === false ? ` The business number saved here is ${input.businessNumber}: save the number Meta shows, or the phone number id of ${input.businessNumber}.` : matches === null ? " No business number is saved to compare." : " It matches the business number saved here."),
  };
}

// ---------------------------------------------------------------------------
// 3. Webhook subscription: the app's callback and the WABA's subscribed apps.
// ---------------------------------------------------------------------------

type AppSubscription = { object?: string; callback_url?: string; active?: boolean; fields?: (string | { name?: string })[] };

export async function checkAppSubscription(input: { appId: string | null; appSecret: string | null; expectedUrl: string; fetch?: Fetch; timeoutMs?: number }): Promise<CheckLine> {
  const id = "app_subscription";
  if (!input.appId) return { id, ok: null, title: "Webhook address not checked", detail: "Save the Meta app id (App settings → Basic) to check where Meta sends messages." };
  if (!input.appSecret) return { id, ok: false, title: "Webhook address not checked", detail: "Save the app secret first." };
  const answer = await graphGet<{ data?: AppSubscription[] }>(input.fetch ?? fetch, `${encodeURIComponent(input.appId)}/subscriptions`, `${input.appId}|${input.appSecret}`, input.timeoutMs ?? WHATSAPP_CHECK_TIMEOUT_MS);
  if (!answer.ok) {
    if (answer.error?.code === 190 || answer.error?.code === 101) return { id, ok: false, title: "App id and app secret don't match", detail: "Meta refused the app id with this app secret. Copy both again from Meta → App settings → Basic." };
    return { id, ok: false, title: "Webhook address not checked", detail: graphTrouble(answer, "this app's webhooks") };
  }
  const whatsapp = (answer.body.data ?? []).find((row) => row.object === "whatsapp_business_account");
  if (!whatsapp) return { id, ok: null, title: "Webhook address: can't confirm", detail: `Meta didn't report a WhatsApp webhook for this app. In Meta → WhatsApp → Configuration, set the callback URL to ${input.expectedUrl} and tick messages.` };
  const fields = (whatsapp.fields ?? []).map((field) => (typeof field === "string" ? field : field.name ?? ""));
  const problems: string[] = [];
  if (whatsapp.callback_url !== input.expectedUrl) problems.push(`Meta is sending to a different URL: ${whatsapp.callback_url ?? "none"}. Change it to ${input.expectedUrl} in Meta → WhatsApp → Configuration.`);
  if (whatsapp.active === false) problems.push("The webhook is switched off in Meta. Verify and save it again in Meta → WhatsApp → Configuration.");
  if (!fields.includes("messages")) problems.push("messages field not subscribed. Tick it in Meta → WhatsApp → Configuration → Webhook fields.");
  return problems.length === 0
    ? { id, ok: true, title: "Webhook address right", detail: `Meta sends to ${input.expectedUrl}, active, with messages subscribed.` }
    : { id, ok: false, title: "Webhook address needs fixing", detail: problems.join(" ") };
}

type SubscribedApp = { whatsapp_business_api_data?: { id?: string; name?: string }; id?: string; name?: string; override_callback_uri?: string };

export async function checkWabaSubscription(input: { wabaId: string | null; appId: string | null; accessToken: string | null; expectedUrl: string; fetch?: Fetch; timeoutMs?: number }): Promise<CheckLine> {
  const id = "waba_subscription";
  if (!input.wabaId) return { id, ok: null, title: "Business account subscription not checked", detail: "Save the WhatsApp business account id (Meta → WhatsApp → API setup) to check that it sends messages to this app." };
  if (!input.accessToken) return { id, ok: false, title: "Business account subscription not checked", detail: "Save the access token first." };
  const answer = await graphGet<{ data?: SubscribedApp[] }>(input.fetch ?? fetch, `${encodeURIComponent(input.wabaId)}/subscribed_apps`, input.accessToken, input.timeoutMs ?? WHATSAPP_CHECK_TIMEOUT_MS);
  if (!answer.ok) return { id, ok: false, title: "Business account subscription not checked", detail: graphTrouble(answer, "this business account id") };
  const apps = (answer.body.data ?? []).map((row) => ({ id: row.whatsapp_business_api_data?.id ?? row.id ?? null, name: row.whatsapp_business_api_data?.name ?? row.name ?? null, override: row.override_callback_uri ?? null }));
  const ours = input.appId ? apps.find((app) => app.id === input.appId) : apps[0];
  const fix = `Subscribe it: POST /${input.wabaId}/subscribed_apps with the access token (Meta's API, or Graph API Explorer).`;
  if (apps.length === 0) return { id, ok: false, title: "The business account sends messages to no app", detail: `Meta delivers nothing until the app is subscribed. ${fix}` };
  if (!ours) return { id, ok: false, title: "The business account sends messages to another app", detail: `Subscribed: ${apps.map((app) => app.name ?? app.id).join(", ")}. ${fix}` };
  if (ours.override && ours.override !== input.expectedUrl) return { id, ok: false, title: "The business account overrides the webhook address", detail: `It sends to ${ours.override}. Remove the override or set it to ${input.expectedUrl}.` };
  return { id, ok: true, title: "Business account subscribed", detail: `It sends messages to ${ours.name ?? "this app"}${input.appId ? "" : " (no app id saved to compare)"}.` };
}

// ---------------------------------------------------------------------------
// 4. The deployed webhook accepts a signed delivery.
// ---------------------------------------------------------------------------

export async function checkWebhookSelfTest(input: { webhookUrl: string; appSecret: string | null; fetch?: Fetch; timeoutMs?: number; nonce?: string }): Promise<CheckLine> {
  const id = "self_test";
  if (!input.appSecret) return { id, ok: false, title: "Webhook not tested", detail: "Save the app secret first." };
  const body = selfTestBody(input.nonce ?? crypto.randomUUID());
  try {
    const response = await (input.fetch ?? fetch)(input.webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": await signWhatsAppBody(body, input.appSecret) },
      body,
      signal: AbortSignal.timeout(input.timeoutMs ?? WHATSAPP_CHECK_TIMEOUT_MS * 2),
      cache: "no-store",
    });
    if (response.status === 200) return { id, ok: true, title: "Webhook accepts Meta's signature", detail: "The live webhook checked a signed test delivery with the app secret saved here and accepted it. Nothing was recorded." };
    if (response.status === 401) return { id, ok: false, title: "Webhook refused a signed delivery", detail: "The live webhook doesn't see the same app secret, or none. Check the whatsapp_events not_configured row for the missing setting; if this server just deployed, wait a minute and test again." };
    return { id, ok: false, title: "Webhook answered oddly", detail: `It answered ${response.status}. Expected 200.` };
  } catch {
    return { id, ok: false, title: "Webhook not reached", detail: `${input.webhookUrl} didn't answer in time.` };
  }
}

export function summaryLine(lines: readonly CheckLine[]): { ok: boolean; text: string } {
  const failed = lines.filter((line) => line.ok === false).length;
  const unknown = lines.filter((line) => line.ok === null).length;
  if (failed === 0) return { ok: true, text: unknown === 0 ? "WhatsApp looks right end to end. Send \"hi\" from a linked phone." : `Nothing wrong found; ${unknown} check${unknown === 1 ? "" : "s"} couldn't run.` };
  return { ok: false, text: `${failed} thing${failed === 1 ? "" : "s"} to fix.` };
}
