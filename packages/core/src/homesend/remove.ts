/**
 * Who may take a HomeSend item away (the owner, 2026-11-03): its sender (an
 * adult) or any Admin. A child or a helper never, and an item that came by
 * email from outside (no sender in the household) only an Admin. The server
 * asks this before every remove and delete; the database's delete policy asks
 * it again.
 */
export type RemoveActor = { memberId: string; memberType: "adult" | "child" | "helper" | string; isAdmin: boolean };

export function mayRemoveHomeSendItem(actor: RemoveActor, item: { createdByMemberId: string | null }): boolean {
  if (actor.memberType === "child" || actor.memberType === "helper") return false;
  if (actor.isAdmin) return true;
  return item.createdByMemberId !== null && item.createdByMemberId === actor.memberId;
}
