import { createHash } from "node:crypto";

/**
 * Approval binding (Wave 5 §20): a "yes" is to one exact proposal.
 *
 * A proposal's fingerprint is a hash of exactly what it would do — the
 * action, its target and every parameter, so the amount, the person and the
 * date are all inside it. An approval is honoured only when:
 *
 *  - the proposal is still inside its time limit (otherwise it is expired);
 *  - what is stored still hashes to the fingerprint it was recorded with
 *    (otherwise the proposal changed after it was shown);
 *  - the fingerprint the person was shown is the one on record (otherwise
 *    the approval is for an earlier version — stale).
 *
 * "Pay Electricity Bill ₹2,840" approved, then the proposal becomes
 * ₹3,100: the fingerprints differ, the approval is rejected, and a new one
 * is asked for. Server-only (it hashes with node:crypto).
 */

export type Fingerprintable = {
  actionType: string;
  outcomeKey: string | null;
  parameters: Record<string, unknown>;
};

/** Keys sorted at every depth, so the same proposal always serialises the same way. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

export function proposalFingerprint(proposal: Fingerprintable): string {
  const body = JSON.stringify(canonical({ action: proposal.actionType, target: proposal.outcomeKey ?? null, parameters: proposal.parameters }));
  return `fp-${createHash("sha256").update(body).digest("hex").slice(0, 16)}`;
}

export type ApprovalCheck = { ok: true } | { ok: false; reason: "expired" | "changed" | "stale" };

export function checkApproval(input: {
  stored: Fingerprintable & { fingerprint: string | null; createdAt: Date };
  /** The fingerprint the person was shown, when the client sent one. */
  seen: string | null;
  now: Date;
  ttlMinutes: number;
}): ApprovalCheck {
  if (input.stored.createdAt.getTime() <= input.now.getTime() - input.ttlMinutes * 60_000) return { ok: false, reason: "expired" };
  const current = proposalFingerprint(input.stored);
  // Recorded before fingerprints existed: nothing to have changed from,
  // but what the person saw must still be what would run.
  if (input.stored.fingerprint !== null && input.stored.fingerprint !== current) return { ok: false, reason: "changed" };
  if (input.seen !== null && input.seen !== current) return { ok: false, reason: "stale" };
  return { ok: true };
}

/** What the person is told when an approval is not honoured. Nothing ran. */
export function approvalRefusal(reason: "expired" | "changed" | "stale"): string {
  return reason === "expired"
    ? "That proposal has timed out, so I have not done it. Ask again and I will set it up fresh."
    : "That proposal changed after you saw it, so I have not done it. Ask again and I will show you exactly what it would do.";
}
