/**
 * Where WonderHome is allowed to send a request (story 15-008).
 *
 * Nothing in the product makes an outbound call today — every connector is a
 * fixture, because `CLAUDE.md` is explicit that a provider counts as live only
 * once its credentials and contract behaviour exist. This is the guard that
 * call will arrive behind, written before it rather than after, for the same
 * reason the AI privacy gate was: a check added in the release after the
 * integration is a check that was absent for a release.
 *
 * The attack it exists for is server-side request forgery. A household will
 * eventually hand WonderHome a URL — a school portal, a calendar feed, a
 * webhook to call back. Every one of those is somebody else's string, resolved
 * and fetched by a server that sits inside a private network and holds cloud
 * credentials. Unchecked, `http://169.254.169.254/` is not a school portal; it
 * is the instance metadata endpoint, and it hands over the machine.
 *
 * Two things this deliberately does **not** try to be.
 *
 * It is not a DNS-rebinding defence. A hostname that resolves to a public
 * address at check time and a private one at connect time defeats any
 * pre-flight check, including this one. That is fixed at the socket, by
 * pinning the resolved address, and the note is here so nobody reads this
 * module as more than it is.
 *
 * It is not an allowlist of the whole internet's shape. It refuses what is
 * known to be dangerous and requires an explicit host allowlist for anything
 * that carries credentials, because a denylist alone is a guess about every
 * address space somebody will invent later.
 */

export type OutboundRefusal =
  | "not_a_url"
  | "scheme_not_allowed"
  | "credentials_in_url"
  | "host_not_allowed"
  | "private_address"
  | "port_not_allowed";

export type OutboundCheck =
  | { ok: true; url: URL }
  | { ok: false; code: OutboundRefusal; reason: string };

/** Only TLS. A plaintext call carries the household's data over somebody else's wire. */
const ALLOWED_SCHEMES = new Set(["https:"]);

/**
 * Ports a provider is plausibly served on.
 *
 * Narrow on purpose: an https URL pointing at port 6379 is not a provider, it
 * is somebody using this server to reach a Redis instance it can see and they
 * cannot.
 */
const ALLOWED_PORTS = new Set(["", "443", "8443"]);

/**
 * Hostnames that are never a provider, whatever they resolve to.
 *
 * `metadata.google.internal` and the AWS/Azure metadata IP are the specific
 * targets worth naming: they are the difference between a nuisance and a
 * compromised deployment.
 */
const DENIED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
]);

/**
 * Whether a hostname is a literal address inside a range nobody outside this
 * network should be able to make us reach.
 *
 * Only literals are judged here. A name is checked by the allowlist instead,
 * because judging a name means resolving it, and the resolution that matters
 * is the one the socket does.
 */
export function isPrivateAddress(host: string): boolean {
  const name = host.toLowerCase().replace(/^\[|\]$/g, "");

  // IPv6, including the forms that carry an IPv4 address inside them.
  if (name.includes(":")) {
    if (name === "::1" || name === "::") return true;
    // Unique local (fc00::/7) and link-local (fe80::/10).
    if (/^f[cd]/.test(name) || /^fe[89ab]/.test(name)) return true;
    // ::ffff:10.0.0.1 and friends resolve to the IPv4 rules below.
    const mapped = /::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(name);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return false;
  }

  const octets = name.split(".");
  if (octets.length !== 4 || !octets.every((part) => /^\d{1,3}$/.test(part))) return false;

  const [a, b] = octets.map(Number) as [number, number, number, number];
  if (octets.some((part) => Number(part) > 255)) return false;

  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // "this network"
  if (a === 169 && b === 254) return true; // link-local, and cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a >= 224) return true; // multicast and reserved

  return false;
}

export type OutboundPolicy = {
  /**
   * Hosts this call may reach. Required: a call with credentials and no
   * allowlist is a call that will eventually go somewhere nobody intended.
   * An entry beginning with a dot matches that domain and its subdomains.
   */
  allowedHosts: readonly string[];
};

/**
 * Whether this URL may be fetched.
 *
 * The order is deliberate. Shape first — an unparseable string is not a URL
 * and nothing after this could be trusted. Then the scheme and embedded
 * credentials, which are properties of the string. Then the host, which is the
 * decision that matters: the allowlist is checked before the private-address
 * rules, so a household can never be told "that address is private" about a
 * host that was never permitted in the first place.
 */
export function checkOutbound(candidate: string, policy: OutboundPolicy): OutboundCheck {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, code: "not_a_url", reason: "That is not a web address." };
  }

  if (!ALLOWED_SCHEMES.has(url.protocol)) {
    return {
      ok: false,
      code: "scheme_not_allowed",
      reason: "WonderHome only connects over https.",
    };
  }

  if (url.username || url.password) {
    // A username in a URL is both a credential in a log and the oldest trick
    // for making a host look like one it is not: https://real.com@evil.com/.
    return {
      ok: false,
      code: "credentials_in_url",
      reason: "That address has a username or password in it, which WonderHome will not use.",
    };
  }

  if (!ALLOWED_PORTS.has(url.port)) {
    return {
      ok: false,
      code: "port_not_allowed",
      reason: "That address points at a port WonderHome does not connect to.",
    };
  }

  const host = url.hostname.toLowerCase();

  if (DENIED_HOSTS.has(host)) {
    return { ok: false, code: "private_address", reason: "That address points back at our own systems." };
  }

  if (!hostAllowed(host, policy.allowedHosts)) {
    return {
      ok: false,
      code: "host_not_allowed",
      reason: "WonderHome is not set up to connect to that address.",
    };
  }

  // Last, and still checked: an allowlisted entry that is itself a private
  // literal must not be a way through.
  if (isPrivateAddress(host)) {
    return { ok: false, code: "private_address", reason: "That address points back at our own systems." };
  }

  return { ok: true, url };
}

function hostAllowed(host: string, allowed: readonly string[]): boolean {
  return allowed.some((entry) => {
    const pattern = entry.toLowerCase();
    if (pattern.startsWith(".")) return host === pattern.slice(1) || host.endsWith(pattern);
    return host === pattern;
  });
}

/**
 * Whether a redirect may be followed.
 *
 * The same check, and that is the point: a provider that answers 302 to
 * `http://169.254.169.254/` has just asked us to fetch the metadata endpoint
 * on its behalf, and a client that validates only the first URL will do it.
 * Whatever fetches must pass every hop through here rather than handing the
 * whole chain to a library's `redirect: "follow"`.
 */
export function checkRedirect(location: string, from: URL, policy: OutboundPolicy): OutboundCheck {
  // Relative locations resolve against the hop they came from, which was
  // already checked — but the result still goes through the full check,
  // because `//evil.com/x` is relative and changes host.
  const resolved = (() => {
    try {
      return new URL(location, from).toString();
    } catch {
      return location;
    }
  })();

  return checkOutbound(resolved, policy);
}

/** How many hops before a chain is a loop somebody built on purpose. */
export const MAX_REDIRECTS = 3;
