import { createAdminClient } from "@wonderhome/core/db/admin";
import { log } from "@wonderhome/core/observability/logger";
import { hitRateLimit } from "@wonderhome/core/security/rate-limit";
import { clientSecretMatches, findClient } from "@wonderhome/core/voicelink/oauth";
import { redeemCode, refreshVoiceTokens } from "@wonderhome/core/voicelink/repository";

/**
 * The OAuth 2.0 token endpoint a voice provider exchanges its code at, and
 * refreshes at (voice phase 2; RFC 6749 §3.2, §4.1.3, §6).
 *
 * Authenticated by the client, not by a household: a provider proves its
 * client secret (HTTP Basic, or in the body), then presents a code or
 * refresh token WonderHome issued it. Only hashes are looked up. Every
 * response is `no-store`, and errors are the RFC's closed words — never
 * which part was wrong beyond what the RFC says to name.
 */

function json(status: number, body: Record<string, unknown>, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", pragma: "no-cache", ...extra },
  });
}

function basicCredentials(header: string | null): { id: string; secret: string } | null {
  if (!header?.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const colon = decoded.indexOf(":");
    if (colon < 1) return null;
    return { id: decodeURIComponent(decoded.slice(0, colon)), secret: decodeURIComponent(decoded.slice(colon + 1)) };
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.includes("application/x-www-form-urlencoded")) return json(400, { error: "invalid_request", error_description: "Use a form-encoded body." });
  const body = new URLSearchParams((await request.text()).slice(0, 8192));

  const basic = basicCredentials(request.headers.get("authorization"));
  const clientId = basic?.id ?? body.get("client_id");
  const clientSecret = basic?.secret ?? body.get("client_secret");
  const client = findClient(clientId);
  if (!client || !clientSecretMatches(client, clientSecret)) {
    return json(401, { error: "invalid_client" }, basic ? { "www-authenticate": 'Basic realm="wonderhome"' } : {});
  }

  const admin = createAdminClient();
  // A leaked client secret is still not a firehose.
  if (!(await hitRateLimit(admin, "voice.token", client.clientId))) return json(429, { error: "temporarily_unavailable" });

  const grantType = body.get("grant_type");
  const result =
    grantType === "authorization_code"
      ? body.get("code")
        ? await redeemCode(admin, { code: body.get("code")!, clientId: client.clientId, redirectUri: body.get("redirect_uri"), codeVerifier: body.get("code_verifier") })
        : ({ error: "invalid_request" } as const)
      : grantType === "refresh_token"
        ? body.get("refresh_token")
          ? await refreshVoiceTokens(admin, { refreshToken: body.get("refresh_token")!, clientId: client.clientId })
          : ({ error: "invalid_request" } as const)
        : null;

  if (result === null) return json(400, { error: "unsupported_grant_type" });
  if ("error" in result) {
    log.info("voice oauth: token refused", { grantType: grantType ?? "none", reason: result.error, allow: ["grantType", "reason"] });
    return json(400, { error: result.error });
  }
  return json(200, {
    access_token: result.accessToken,
    token_type: "Bearer",
    expires_in: result.expiresIn,
    refresh_token: result.refreshToken,
    scope: result.scopes.join(" "),
  });
}

export const dynamic = "force-dynamic";
