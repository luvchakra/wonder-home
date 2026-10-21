/**
 * "People I choose" is a per-person sharing list, not a per-record one
 * (`health_consents`: one row per subject and viewer). Every health sheet
 * that offers the scope shows that list, and saving makes the list equal to
 * what was ticked (the owner, 2026-10-21). This is the pure half: what to
 * grant and what to revoke. The writes go through `grantHealthConsent` /
 * `revokeHealthConsent`, under the actor's own session, so RLS decides.
 */

export type SharingChange = {
  /** Viewer member ids to grant. */
  grant: string[];
  /** Consent row ids to revoke. */
  revoke: string[];
};

export function planSharingChange(input: {
  subjectMemberId: string;
  current: readonly { id: string; viewerMemberId: string }[];
  ticked: readonly string[];
}): SharingChange {
  const wanted = new Set(input.ticked.filter((id) => id !== input.subjectMemberId));
  const have = new Set(input.current.map((consent) => consent.viewerMemberId));
  return {
    grant: [...wanted].filter((id) => !have.has(id)),
    revoke: input.current.filter((consent) => !wanted.has(consent.viewerMemberId)).map((consent) => consent.id),
  };
}

/** Viewer ids per subject, from whichever consent rows the viewer's session can read. */
export function viewersBySubject(consents: readonly { subjectMemberId: string; viewerMemberId: string }[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const consent of consents) (out[consent.subjectMemberId] ??= []).push(consent.viewerMemberId);
  return out;
}
