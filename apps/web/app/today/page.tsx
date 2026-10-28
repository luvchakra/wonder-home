import { redirect } from "next/navigation";

import { todayLensHref } from "../calendar/_components/today-plan";

/**
 * Today's plan is the Calendar's Day view now (design/UI-SIMPLIFICATION-v1.md
 * M4). Kept as a redirect, with its lens, for old links and bookmarks.
 */
export default async function TodayPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  redirect(todayLensHref(view === "family" || view === "household" ? view : "mine"));
}
