/**
 * Request correlation.
 *
 * Every /api/v1 response carries an `x-request-id`, echoed back on errors in the
 * envelope, so a caller can quote one id and a log search finds the exact
 * request without anyone pasting household content into a support thread.
 */

const HEADER = "x-request-id";

/** Accepts an inbound id only if it is safe to echo and log. */
export function sanitizeRequestId(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 128) return null;
  return /^[A-Za-z0-9._:-]+$/.test(trimmed) ? trimmed : null;
}

export function requestIdFrom(headers: Headers): string {
  return sanitizeRequestId(headers.get(HEADER)) ?? crypto.randomUUID();
}

export const REQUEST_ID_HEADER = HEADER;
