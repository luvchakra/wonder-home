/**
 * A path on this site, or null — the one check behind every `?next=`,
 * `returnTo` and post-sign-in redirect, so none of them can become an open
 * redirect.
 *
 * Starting with "/" is not enough: browsers read a backslash as a slash, so
 * "/\evil.com" is "//evil.com", another site; a tab or newline inside the
 * value is dropped by the URL parser and can do the same. The value is
 * therefore refused on any backslash or control character, and must still
 * resolve to this site's own origin when parsed.
 */
export function sameSitePath(value: unknown, maxLength = 2000): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.length > maxLength) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(path)) return null;
  const base = "https://same-site.invalid";
  try {
    const resolved = new URL(path, base);
    return resolved.origin === base ? path : null;
  } catch {
    return null;
  }
}
