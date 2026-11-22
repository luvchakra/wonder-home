/**
 * Signs that pasted text is a web page, an advert or a newsletter rather than
 * something about this household. Each is a whole pattern a household's own
 * message would rarely carry; two or more together are needed.
 */
const WEB_SIGNS: readonly RegExp[] = [
  /\b(accept|manage) (all )?cookies?\b|\bcookie (policy|settings|preferences)\b/i,
  /\bprivacy policy\b|\bterms (of (use|service)|and conditions|& conditions)\b/i,
  /\bunsubscribe\b|\bview (this email )?in (your )?browser\b|\bmanage (your )?(email )?preferences\b/i,
  /\ball rights reserved\b|©\s?\d{4}/i,
  /\b(sponsored|advertisement|promoted)\b|\b(shop now|buy now|limited[- ]time offer|use (promo )?code|\d{1,2}% off)\b/i,
  /\b(sign in|log in|sign up|create (an )?account)\b.*\b(home|about( us)?|contact( us)?|blog|careers)\b/i,
  /\b(home|about( us)?|contact( us)?|blog|careers|faq)\s*[|•·]\s*(home|about( us)?|contact( us)?|blog|careers|faq)\b/i,
  /\b(subscribe to (our|the) newsletter|follow us on|share (this|on) (facebook|twitter|x|whatsapp|linkedin))\b/i,
  /<\/?(div|span|script|style|nav|footer|header|a|p)\b[^>]*>/i,
  /\bread more\b[\s\S]*\bread more\b/i,
];

/** How many links make a paste look like a page rather than a message. */
const MANY_LINKS = 4;



/**
 * Whether what was sent is plainly not household information: two or more
 * web signs, or many links with one sign. Only asked of an item HomeSend
 * could not read or could not tell what it is: a reading that found a bill,
 * a school notice or anything else is never set aside here, whatever its
 * footer says (a school newsletter with "unsubscribe" in it stays).
 */
export function notHouseholdInformation(text: string | null | undefined): boolean {
  if (!text || text.trim().length === 0) return false;
  const sample = text.slice(0, 20_000);
  const signs = WEB_SIGNS.filter((pattern) => pattern.test(sample)).length;
  const links = (sample.match(/https?:\/\/\S+/gi) ?? []).length;
  return signs >= 2 || (links >= MANY_LINKS && signs >= 1);
}
