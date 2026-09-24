/**
 * Money at the provider boundary (story 20-009, CLAUDE.md rule 22).
 *
 * WonderHome keeps and shows amounts in the currency's major unit — 299.00,
 * never 29900. Payment providers speak minor units, so a provider adapter
 * converts on the way out and back on the way in, and nothing else ever sees
 * a minor unit. The exponent is the currency's own, not an assumed 2.
 */

/** ISO 4217 currencies with no minor unit, or three. Everything else has two. */
const EXPONENT: Record<string, number> = {
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0, PYG: 0, RWF: 0, UGX: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  BHD: 3, JOD: 3, KWD: 3, OMR: 3, TND: 3,
};

export function currencyExponent(currency: string): number {
  return EXPONENT[currency.toUpperCase()] ?? 2;
}

/** 299.00 INR → 29900 paise. Rounded to the unit, so float noise never reaches a provider. */
export function toMinorUnits(amount: number, currency: string): number {
  return Math.round(amount * 10 ** currencyExponent(currency));
}

/** 29900 paise → 299 INR. */
export function fromMinorUnits(minor: number, currency: string): number {
  const exponent = currencyExponent(currency);
  return Number((minor / 10 ** exponent).toFixed(exponent));
}

/** "₹299.00", "$7.00" — the household's own locale decides separators. */
export function formatMoney(amount: number, currency: string, locale = "en-IN"): string {
  const exponent = currencyExponent(currency);
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: exponent, maximumFractionDigits: exponent }).format(amount);
}
