import Link from "next/link";
import { BriefcaseBusiness, ChevronRight } from "lucide-react";

import { jobFacts } from "@wonderhome/core/careers/format";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";

import { careersConnection, careersStaff } from "../_lib/careers";
import { CareersNotice, type CareersProblem } from "./notice";

export const dynamic = "force-dynamic";
export const metadata = { title: "Open positions", alternates: { canonical: "/careers" } };

/** The open jobs WonderJobs links to this site, as it returns them. */
export default async function CareersPage() {
  const [connection, staff] = await Promise.all([careersConnection(), careersStaff()]);
  const result = connection.state === "ready" ? await connection.client.listJobs() : null;
  const problem: CareersProblem | null = connection.state !== "ready" ? connection.state : result && result.state !== "ok" ? (result.state === "wrong_key" || result.state === "busy" ? result.state : "unavailable") : null;

  return (
    <>
      <header className="space-y-2">
        <h1 className="text-[length:var(--wh-text-title)] font-bold tracking-tight">Work with us</h1>
        <p className="text-[var(--wh-foreground-muted)]">
          WonderHome takes the mental load off families. If you&rsquo;d like to help build it, these are the roles open right now.
        </p>
      </header>

      {problem || !result || result.state !== "ok" ? (
        <CareersNotice problem={problem ?? "unavailable"} isStaff={Boolean(staff)} retryHref="/careers" />
      ) : result.data.jobs.length === 0 ? (
        <Card className="p-5">
          <p className="font-semibold">No open positions right now</p>
          <p className="mt-1 text-sm text-[var(--wh-foreground-muted)]">New roles are posted here first.</p>
        </Card>
      ) : (
        <ul className="space-y-3" aria-label="Open positions">
          {result.data.jobs.map((job) => (
            <li key={job.id}>
              <Link
                href={`/careers/${encodeURIComponent(job.id)}`}
                className="flex items-start gap-3 rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-4 shadow-[var(--wh-shadow-card)] transition hover:border-[var(--wh-primary)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)] motion-reduce:transition-none"
              >
                <IconTile icon={BriefcaseBusiness} tone="primary" />
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block font-semibold break-words">{job.title}</span>
                  <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-sm text-[var(--wh-foreground-muted)]">
                    {jobFacts(job).map((fact, index) => (
                      <span key={fact}>{index > 0 ? <span aria-hidden>· </span> : null}{fact}</span>
                    ))}
                  </span>
                  {job.skills.length > 0 ? (
                    <span className="flex flex-wrap gap-1.5 pt-1" aria-label="Skills">
                      {job.skills.map((skill) => (
                        <span key={skill} className="rounded-full bg-[var(--wh-surface-muted)] px-2 py-0.5 text-xs break-words">{skill}</span>
                      ))}
                    </span>
                  ) : null}
                </span>
                <ChevronRight aria-hidden className="mt-2 size-5 shrink-0 text-[var(--wh-foreground-subtle)]" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
