/**
 * What a pasted Razorpay key must look like (owner, 2026-11-20). Razorpay's
 * dashboard calls them "Key Id" / "Test API Key" (`rzp_test_…`, `rzp_live_…`)
 * and "Key Secret" (24 letters and numbers). A paste often carries spaces or
 * a line break, so every whitespace character is dropped before checking, and
 * a key pasted into the other box is named as such.
 */

export type CleanedKey = { ok: true; value: string } | { ok: false; message: string };

const strip = (raw: string) => raw.replace(/\s+/g, "");

export function cleanRazorpayKeyId(raw: string): CleanedKey {
  const value = strip(raw);
  if (/^rzp_(test|live)_[A-Za-z0-9]{6,40}$/.test(value)) return { ok: true, value };
  if (/^[A-Za-z0-9]{20,40}$/.test(value)) return { ok: false, message: "That looks like the Key Secret. The key id starts with rzp_test_ or rzp_live_." };
  return { ok: false, message: "A Razorpay key id starts with rzp_test_ or rzp_live_, then letters and numbers." };
}

export function cleanRazorpayKeySecret(raw: string): CleanedKey {
  const value = strip(raw);
  if (value.startsWith("rzp_")) return { ok: false, message: "That's the key id (it starts with rzp_). Paste the Key Secret here: 24 letters and numbers." };
  if (/^[A-Za-z0-9]{20,40}$/.test(value)) return { ok: true, value };
  return { ok: false, message: "A Razorpay key secret is 24 letters and numbers, with no spaces or symbols." };
}
