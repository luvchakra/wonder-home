import { describe, expect, it } from "vitest";

import { converse } from "../conversation/engine";
import { clientSecretMatches, findClient, hashSecret, newSecret, pkceMatches, readAuthorizeRequest, redirectWith, voiceOAuthClients } from "./oauth";
import { agendaAllows, DEFAULT_VOICE_SCOPES, domainsFor, normaliseScopes, SENSITIVE_VOICE_SCOPES, voiceAllowsAction, VOICE_NOT_ALLOWED } from "./scopes";

/**
 * Voice integration phase 2: external identity, account linking and least
 * privilege (`design/voice-integration/02-external-voice-identity-and-auth.md`).
 */

const REDIRECT = "https://pitangui.amazon.com/api/skill/link/M2AAAAAAAAAAAA";
const ENV = {
  ALEXA_OAUTH_CLIENT_ID: "alexa-wonderhome",
  ALEXA_OAUTH_CLIENT_SECRET: "s3cret-s3cret-s3cret-s3cret",
  ALEXA_OAUTH_REDIRECT_URIS: `${REDIRECT}, https://layla.amazon.com/api/skill/link/M2AAAAAAAAAAAA`,
};
const params = (over: Record<string, string | null> = {}) => {
  const base: Record<string, string | null> = { client_id: "alexa-wonderhome", redirect_uri: REDIRECT, response_type: "code", state: "xyz", ...over };
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(base)) if (value !== null) search.set(key, value);
  return search;
};

describe("a provider is configured by the deployment, never invented", () => {
  it("no environment, no client — linking says it isn't set up", () => {
    expect(voiceOAuthClients({})).toEqual([]);
    const reading = readAuthorizeRequest(params(), {});
    expect(reading).toMatchObject({ ok: false, error: "unconfigured" });
  });

  it("a short secret or a non-https redirect is not a configuration", () => {
    expect(voiceOAuthClients({ ...ENV, ALEXA_OAUTH_CLIENT_SECRET: "short" })).toEqual([]);
    expect(voiceOAuthClients({ ...ENV, ALEXA_OAUTH_REDIRECT_URIS: "http://pitangui.amazon.com/x" })).toEqual([]);
  });

  it("the client secret is compared in constant time and must match exactly", () => {
    const client = findClient("alexa-wonderhome", ENV)!;
    expect(clientSecretMatches(client, ENV.ALEXA_OAUTH_CLIENT_SECRET)).toBe(true);
    expect(clientSecretMatches(client, `${ENV.ALEXA_OAUTH_CLIENT_SECRET}x`)).toBe(false);
    expect(clientSecretMatches(client, null)).toBe(false);
  });
});

describe("the authorization request is checked before anything is shown", () => {
  it("accepts a well-formed request and starts from the everyday scopes", () => {
    const reading = readAuthorizeRequest(params(), ENV);
    expect(reading.ok).toBe(true);
    if (!reading.ok) return;
    expect(reading.request.scopes).toEqual([...DEFAULT_VOICE_SCOPES]);
    for (const sensitive of SENSITIVE_VOICE_SCOPES) expect(reading.request.scopes).not.toContain(sensitive);
  });

  it("an unknown client is refused on the page, never redirected", () => {
    expect(readAuthorizeRequest(params({ client_id: "someone-else" }), ENV)).toMatchObject({ ok: false, error: "invalid_client" });
  });

  it("a redirect that is not exactly a registered one is refused on the page — prefixes and look-alikes too", () => {
    for (const uri of [`${REDIRECT}/../evil`, `${REDIRECT}?x=1`, "https://pitangui.amazon.com.evil.example/api/skill/link/M2", "https://evil.example/cb", null]) {
      const reading = readAuthorizeRequest(params({ redirect_uri: uri }), ENV);
      expect(reading).toMatchObject({ ok: false, error: "invalid_redirect" });
      expect("redirectUri" in reading).toBe(false);
    }
  });

  it("only the authorization-code flow, and only S256 PKCE", () => {
    expect(readAuthorizeRequest(params({ response_type: "token" }), ENV)).toMatchObject({ ok: false, error: "unsupported_response_type", redirectUri: REDIRECT });
    expect(readAuthorizeRequest(params({ code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", code_challenge_method: "plain" }), ENV)).toMatchObject({ ok: false, error: "invalid_request" });
    expect(readAuthorizeRequest(params({ code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", code_challenge_method: "S256" }), ENV)).toMatchObject({ ok: true });
  });

  it("what the provider asks for is a ceiling, and only known scopes survive", () => {
    const reading = readAuthorizeRequest(params({ scope: "groceries.read bills.read admin.everything" }), ENV);
    expect(reading.ok && reading.request.scopes).toEqual(["groceries.read", "bills.read"]);
  });

  it("the result goes back on the provider's own redirect, with its state", () => {
    expect(redirectWith(REDIRECT, { code: "whc_abc", state: "xyz" })).toBe(`${REDIRECT}?code=whc_abc&state=xyz`);
  });
});

describe("secrets exist once, and only their hashes are kept", () => {
  it("PKCE S256 matches the RFC 7636 example and nothing else", () => {
    expect(pkceMatches("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")).toBe(true);
    expect(pkceMatches("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXl", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")).toBe(false);
    expect(pkceMatches(null, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")).toBe(false);
    expect(pkceMatches("short", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")).toBe(false);
  });

  it("every secret is fresh, says what it is, and hashes to 64 hex characters", () => {
    const a = newSecret("access");
    const b = newSecret("access");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^wha_[A-Za-z0-9_-]{43}$/);
    expect(newSecret("refresh")).toMatch(/^whr_/);
    expect(newSecret("code")).toMatch(/^whc_/);
    expect(hashSecret(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSecret(a)).not.toContain(a);
  });
});

describe("least privilege: a voice link can do less than the member, never more", () => {
  it("everyday reads and grocery writes are there by default; money, health and school are not", () => {
    expect(voiceAllowsAction("ask_status", DEFAULT_VOICE_SCOPES)).toBe(true);
    expect(voiceAllowsAction("add_to_list", DEFAULT_VOICE_SCOPES)).toBe(true);
    expect(voiceAllowsAction("set_reminder", DEFAULT_VOICE_SCOPES)).toBe(true);
    expect(voiceAllowsAction("log_vital", DEFAULT_VOICE_SCOPES)).toBe(false);
    expect(voiceAllowsAction("log_vital", [...DEFAULT_VOICE_SCOPES, "health.write"])).toBe(true);
  });

  it("paying, ordering, delegating and running the agents are never over a voice link, whatever the scopes", () => {
    const everything = normaliseScopes([...DEFAULT_VOICE_SCOPES, ...SENSITIVE_VOICE_SCOPES]);
    for (const action of ["make_payment", "order_items", "assign_responsibility", "check_agents", "set_preference", "adjust_schedule"] as const) {
      expect(voiceAllowsAction(action, everything)).toBe(false);
    }
  });

  it("facts open by scope: without bills.read or health.read those domains are closed", () => {
    const open = domainsFor(DEFAULT_VOICE_SCOPES);
    expect(open.has("groceries")).toBe(true);
    expect(open.has("bills")).toBe(false);
    expect(open.has("health")).toBe(false);
    expect(open.has("school")).toBe(false);
    expect(agendaAllows("bills", DEFAULT_VOICE_SCOPES)).toBe(false);
    expect(agendaAllows("shopping", DEFAULT_VOICE_SCOPES)).toBe(true);
  });
});

describe("the engine refuses what the channel may not ask, before asking anything", () => {
  const turn = (utterance: string, allows: (action: string) => boolean) =>
    converse({
      utterance,
      channel: "voice",
      actor: { memberId: "m-1", roles: ["head"], memberType: "adult" },
      pending: null,
      autonomyFor: () => "execute",
      entitledFor: () => true,
      executable: () => true,
      sessionId: "s-1",
      channelLimits: { allows: (intent) => allows(intent.action), refusal: VOICE_NOT_ALLOWED },
    });

  it("\"Pay the electricity bill\" over a voice link is refused, not asked about and not proposed", async () => {
    const result = await turn("Pay the electricity bill.", (action) => voiceAllowsAction(action as never, DEFAULT_VOICE_SCOPES));
    expect(result.kind).toBe("reply");
    if (result.kind !== "reply") return;
    expect(result.proposal).toEqual({ kind: "refused", reason: VOICE_NOT_ALLOWED });
    expect(result.record).toBe(false);
  });

  it("an allowed request goes on through every other gate as usual", async () => {
    const result = await turn("Add coriander to the grocery list.", (action) => voiceAllowsAction(action as never, DEFAULT_VOICE_SCOPES));
    expect(result.kind === "reply" && result.proposal.kind).toBe("executed");
  });
});
