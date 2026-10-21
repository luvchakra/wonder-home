import type { Metadata } from "next";
import Link from "next/link";

import type { CareerJob, CareerSite } from "@wonderhome/core/careers/wonderjobs";
import { consentText, descriptionBlocks, jobFacts, jobPostingJsonLd } from "@wonderhome/core/careers/format";
import { ButtonLink } from "@wonderhome/core/ui/button";
import { Card } from "@wonderhome/core/ui/card";

import { CAREERS_APP_NAME, careersConnection, careersStaff } from "../../_lib/careers";
import { CareersNotice, type CareersProblem } from "../notice";
import { ApplyForm } from "./apply-form";
import { ShareButton } from "./share-button";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://home.wonderapps.biz";

type Loaded =
  | { kind: "job"; job: CareerJob; site: CareerSite }
  | { kind: "closed" }
  | { kind: "problem"; problem: CareersProblem };

async function load(id: string): Promise<Loaded> {
  const connection = await careersConnection();
  if (connection.state !== "ready") return { kind: "problem", problem: connection.state };
  const result = await connection.client.getJob(id);
  if (result.state === "ok") return { kind: "job", job: result.data.job, site: result.data.site };
  if (result.state === "not_found") return { kind: "closed" };
  return { kind: "problem", problem: result.state === "wrong_key" || result.state === "busy" ? result.state : "unavailable" };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const loaded = await load((await params).id);
  if (loaded.kind !== "job") return { title: "Open position" };
  const description = `${jobFacts(loaded.job).join(" · ")}. ${loaded.job.description.replace(/\s+/g, " ").slice(0, 160)}`;
  return { title: loaded.job.title, description, alternates: { canonical: `/careers/${encodeURIComponent(loaded.job.id)}` }, openGraph: { title: loaded.job.title, description, type: "website" } };
}

/** One job: its description as text, Share, and the application form. */
export default async function CareerJobPage({ params }: Props) {
  const id = (await params).id;
  const [loaded, staff] = await Promise.all([load(id), careersStaff()]);

  if (loaded.kind === "closed") {
    return (
      <Card className="space-y-2 p-5">
        <h1 className="text-lg font-semibold">This position is no longer open</h1>
        <Link href="/careers" className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--wh-primary)] hover:underline">See the open positions</Link>
      </Card>
    );
  }
  if (loaded.kind === "problem") return <CareersNotice problem={loaded.problem} isStaff={Boolean(staff)} retryHref={`/careers/${encodeURIComponent(id)}`} />;

  const { job, site } = loaded;
  const path = `/careers/${encodeURIComponent(job.id)}`;
  return (
    <article className="space-y-6">
      {/* Data for search engines, never executed; every "<" is escaped. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jobPostingJsonLd(job, `${SITE}${path}`, CAREERS_APP_NAME) }} />
      <header className="space-y-3">
        <h1 className="text-[length:var(--wh-text-title)] font-bold tracking-tight break-words">{job.title}</h1>
        <p className="flex flex-wrap gap-x-2 gap-y-0.5 text-sm text-[var(--wh-foreground-muted)]">
          {job.company ? <span>{job.company}</span> : null}
          {jobFacts(job).map((fact, index) => (
            <span key={fact}>{index > 0 || job.company ? <span aria-hidden>· </span> : null}{fact}</span>
          ))}
        </p>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="#apply">Apply</ButtonLink>
          <ShareButton title={job.title} path={path} />
        </div>
      </header>

      <Card className="space-y-3 p-5">
        {descriptionBlocks(job.description).map((block, index) =>
          block.kind === "heading" ? (
            <h2 key={index} className="pt-1 text-base font-semibold break-words">{block.text}</h2>
          ) : block.kind === "list" ? (
            <ul key={index} className="list-disc space-y-1 ps-5 text-sm leading-relaxed">
              {block.items.map((item, itemIndex) => <li key={itemIndex} className="break-words">{item}</li>)}
            </ul>
          ) : (
            <p key={index} className="text-sm leading-relaxed break-words">{block.text}</p>
          ),
        )}
        {job.skills.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5 pt-1" aria-label="Skills">
            {job.skills.map((skill) => <li key={skill} className="rounded-full bg-[var(--wh-surface-muted)] px-2 py-0.5 text-xs break-words">{skill}</li>)}
          </ul>
        ) : null}
      </Card>

      <Card className="space-y-4 p-5" id="apply">
        <h2 className="text-lg font-semibold">Apply for this position</h2>
        <ApplyForm jobId={job.id} consent={consentText(CAREERS_APP_NAME, site.retentionMonths)} />
      </Card>
    </article>
  );
}
