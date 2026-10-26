/**
 * The placeholders `pseudonymise` (privacy.ts) puts in place of names on the
 * way to a model: "Child B", "Adult A", "Helper C". They are only one turn's
 * stand-ins and never a person, so none is ever stored or shown (I-26). Kept
 * apart from privacy.ts so the HomeSend review can use it in the browser.
 */
const PLACEHOLDER_NAME = /\b(?:child|adult|helper)\s+[a-z]\b(?:'s)?/i;
const WHOLE = new RegExp(`^${PLACEHOLDER_NAME.source}$`, "i");

/** Whether the text is, as a whole, one of the placeholders rather than a name. */
export function isPlaceholderName(text: string): boolean {
  return WHOLE.test(text.trim());
}

/** Whether a placeholder appears anywhere in the text. */
export function hasPlaceholderName(text: string): boolean {
  return PLACEHOLDER_NAME.test(text);
}
