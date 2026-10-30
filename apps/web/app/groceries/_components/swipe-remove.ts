/**
 * What a completed swipe does to a grocery row (the owner, 2026-10-29: a full
 * swipe must remove the entry). On To buy the item comes off the list; on All,
 * where the row would only spring back, it is removed (tracking stops, history
 * stays, "Track again" restores it). Resolves true when the row should leave,
 * false when it stays (already off the list), null when nothing saved.
 */
export async function removeBySwipe({
  view,
  onList,
  takeOffList,
  stopTracking,
}: {
  view: "to-buy" | "in-kitchen" | "all" | string;
  itemId: string;
  onList: number;
  takeOffList: () => Promise<{ ok: boolean }>;
  stopTracking: () => Promise<{ ok: boolean }>;
}): Promise<boolean | null> {
  if (view !== "to-buy") {
    if (onList > 0) {
      const off = await takeOffList();
      if (!off.ok) return null;
    }
    const stopped = await stopTracking();
    return stopped.ok ? true : null;
  }
  if (onList <= 0) return null;
  const off = await takeOffList();
  return off.ok ? true : null;
}
