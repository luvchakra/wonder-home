"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-reads the page a few times while a provider's confirmation is on its way
 * (story 20-010). The server decides what the page says; this only asks again,
 * every few seconds for about a minute, then stops.
 */
export function RefreshWhileWaiting({ everyMs = 4000, times = 15 }: { everyMs?: number; times?: number }) {
  const router = useRouter();
  useEffect(() => {
    let count = 0;
    const timer = window.setInterval(() => {
      count += 1;
      router.refresh();
      if (count >= times) window.clearInterval(timer);
    }, everyMs);
    return () => window.clearInterval(timer);
  }, [router, everyMs, times]);
  return null;
}
