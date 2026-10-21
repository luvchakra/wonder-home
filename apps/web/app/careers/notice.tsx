import Link from "next/link";

import { Card } from "@wonderhome/core/ui/card";

/**
 * What a visitor reads when the jobs can't be shown, and, for a platform
 * admin alone, why. Never sample jobs, never a placeholder.
 */
export type CareersProblem = "needs_setup" | "bad_address" | "wrong_key" | "unavailable" | "busy";

const ADMIN_REASON: Record<CareersProblem, string> = {
  needs_setup: "No WonderJobs career site key is saved, and WONDERJOBS_CAREERS_KEY isn't set.",
  bad_address: "WONDERJOBS_CAREERS_URL isn't an https address on wonderapps.biz, so no call is made.",
  wrong_key: "WonderJobs refused the saved key (401). It may be mistyped or revoked.",
  unavailable: "WonderJobs couldn't be reached or answered with an error.",
  busy: "WonderJobs answered 429 (busy).",
};

export function CareersNotice({ problem, isStaff, retryHref }: { problem: CareersProblem; isStaff: boolean; retryHref: string }) {
  const notSetUp = problem === "needs_setup" || problem === "bad_address";
  return (
    <Card className="space-y-3 p-5">
      <h2 className="text-base font-semibold tracking-tight">{notSetUp ? "Careers isn't set up yet" : "Careers is unavailable right now"}</h2>
      <p className="text-sm text-[var(--wh-foreground-muted)]">
        {notSetUp ? "Open positions will appear here soon." : "We couldn't load our open positions. Please try again later."}
      </p>
      {!notSetUp ? (
        <Link href={retryHref} className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--wh-primary)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]">
          Try again
        </Link>
      ) : null}
      {isStaff ? (
        <p className="rounded-[var(--wh-radius-sm)] bg-[var(--wh-attention-soft)] px-3 py-2 text-sm text-[var(--wh-attention)]">
          Admins only: {ADMIN_REASON[problem]} <Link href="/platform-admin/careers" className="underline">Careers connection</Link>
        </p>
      ) : null}
    </Card>
  );
}
