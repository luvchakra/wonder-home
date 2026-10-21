import type { Metadata } from "next";
import Link from "next/link";

import type { ApplicationStatus } from "@wonderhome/core/careers/wonderjobs";
import { Card } from "@wonderhome/core/ui/card";

import { careersConnection } from "../../_lib/careers";
import { WithdrawForm } from "./withdraw-form";

export const dynamic = "force-dynamic";

// The address carries the applicant's token: never indexed, never sent on as a referrer
// (next.config.ts also sends Referrer-Policy: no-referrer and X-Robots-Tag: noindex here).
export const metadata: Metadata = { title: "Your application", robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };

type Props = { searchParams: Promise<{ t?: string | string[] }> };

const day = (iso: string) => {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(at);
};

function ApplicationDetails({ application }: { application: ApplicationStatus }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[9rem_1fr]">
      <dt className="text-[var(--wh-foreground-muted)]">Job</dt>
      <dd className="font-semibold break-words">{application.jobTitle}</dd>
      {application.company ? (
        <>
          <dt className="text-[var(--wh-foreground-muted)]">Company</dt>
          <dd className="break-words">{application.company}</dd>
        </>
      ) : null}
      <dt className="text-[var(--wh-foreground-muted)]">Status</dt>
      <dd className="font-semibold">{application.statusLabel}</dd>
      <dt className="text-[var(--wh-foreground-muted)]">Applied</dt>
      <dd>{day(application.appliedAt)}</dd>
      <dt className="text-[var(--wh-foreground-muted)]">Last update</dt>
      <dd>{day(application.updatedAt)}</dd>
    </dl>
  );
}

/** An applicant's own application, found by the token in their email; the token goes to WonderJobs in a request body, never a URL. */
export default async function ApplicationStatusPage({ searchParams }: Props) {
  const raw = (await searchParams).t;
  const token = typeof raw === "string" ? raw : "";
  const connection = token ? await careersConnection() : null;
  const result = connection?.state === "ready" ? await connection.client.status(token, "view") : null;

  return (
    <section className="space-y-4">
      <h1 className="text-[length:var(--wh-text-title)] font-bold tracking-tight">Your application</h1>
      {!token || result?.state === "not_found" ? (
        <Card className="p-5">
          <p className="font-semibold">We couldn&rsquo;t find that application. Use the link in your email.</p>
        </Card>
      ) : result?.state === "ok" ? (
        <Card className="space-y-4 p-5">
          <ApplicationDetails application={result.data} />
          {result.data.canWithdraw ? <WithdrawForm token={token} /> : null}
        </Card>
      ) : (
        <Card className="space-y-2 p-5">
          <p className="font-semibold">Your application can&rsquo;t be shown right now.</p>
          <p className="text-sm text-[var(--wh-foreground-muted)]">Please try again later, from the link in your email.</p>
        </Card>
      )}
      <Link href="/careers" className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--wh-primary)] hover:underline">See open positions</Link>
    </section>
  );
}
