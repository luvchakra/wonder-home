/**
 * Which WonderHome environment this server is: production or test
 * (owner, 2026-11-25: "a full test environment, completely separate from
 * Prod", named "test", never "staging"). `docs/test-environment.md`.
 *
 * Read from the deployment's own variables only, never from Platform admin:
 * the settings store lives in the database, and a copied or edited store must
 * never be able to turn a test server into one that messages real people.
 *
 * Fails closed: a Vercel Preview deployment counts as test even when
 * `WONDERHOME_ENV` was forgotten, so the only server that sends freely is
 * Vercel Production, or a local one nobody marked.
 */

type Env = Record<string, string | undefined>;

export type DeploymentEnvironment = "production" | "test";

export function deploymentEnvironment(env: Env = process.env): DeploymentEnvironment {
  const named = (env.WONDERHOME_ENV ?? "").trim().toLowerCase();
  if (named === "test") return "test";
  if (env.VERCEL_ENV === "preview") return "test";
  return "production";
}

export function isTestEnvironment(env: Env = process.env): boolean {
  return deploymentEnvironment(env) === "test";
}

/** A recipient as the allow-list compares it: an email lower-cased, a phone as "+" and its digits. */
export function normaliseRecipient(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes("@")) return trimmed.toLowerCase();
  const digits = trimmed.replace(/[^\d]/g, "");
  return digits ? `+${digits}` : "";
}

/**
 * Who a test server may reach: `WONDERHOME_TEST_RECIPIENTS`, a comma-, semicolon- or
 * newline-separated list of email addresses and E.164 numbers. Empty by
 * default, which means nobody.
 */
export function testRecipients(env: Env = process.env): Set<string> {
  return new Set(
    (env.WONDERHOME_TEST_RECIPIENTS ?? "")
      .split(/[,;\n]+/)
      .map(normaliseRecipient)
      .filter(Boolean),
  );
}

/**
 * May this server send to this recipient? Production: always. Test: only to
 * an address or number on `WONDERHOME_TEST_RECIPIENTS`. Push has no address
 * of its own, so the caller passes the recipient's account email.
 */
export function outboundAllowed(recipient: string | null | undefined, env: Env = process.env): boolean {
  if (!isTestEnvironment(env)) return true;
  if (!recipient) return false;
  const key = normaliseRecipient(recipient);
  return key !== "" && testRecipients(env).has(key);
}
