import type { CareerJob } from "./wonderjobs";

/**
 * How a WonderJobs job reads on WonderHome's careers pages. Everything here is
 * plain text in, plain text out: a job's description is untrusted data and is
 * only ever rendered as text nodes, never as HTML.
 */

export const WORK_MODE_LABEL: Record<CareerJob["workMode"], string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };

const JOB_TYPE_LABEL: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
  temporary: "Temporary",
  freelance: "Freelance",
};

export function jobTypeLabel(jobType: string | null | undefined): string | null {
  if (!jobType) return null;
  return JOB_TYPE_LABEL[jobType] ?? jobType.replace(/_/g, " ").replace(/^./, (first) => first.toUpperCase());
}

/** "₹12,00,000–₹18,00,000", "From $90,000", or null when the job gives no pay. */
export function salaryRange(job: Pick<CareerJob, "salaryMin" | "salaryMax" | "currency">): string | null {
  const min = job.salaryMin ?? null;
  const max = job.salaryMax ?? null;
  if (min === null && max === null) return null;
  const currency = (job.currency || "INR").toUpperCase();
  let format: (value: number) => string;
  try {
    const formatter = new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en", { style: "currency", currency, maximumFractionDigits: 0 });
    format = (value) => formatter.format(value);
  } catch {
    format = (value) => `${currency} ${Math.round(value).toLocaleString("en")}`;
  }
  if (min !== null && max !== null) return min === max ? format(min) : `${format(min)}–${format(max)}`;
  return min !== null ? `From ${format(min)}` : `Up to ${format(max!)}`;
}

/** The facts under a title, each its own piece so a layout can wrap between them. */
export function jobFacts(job: CareerJob): string[] {
  return [job.location || null, WORK_MODE_LABEL[job.workMode], jobTypeLabel(job.jobType), salaryRange(job)].filter((fact): fact is string => Boolean(fact));
}

export type DescriptionBlock = { kind: "heading"; text: string } | { kind: "paragraph"; text: string } | { kind: "list"; items: string[] };

/**
 * A description as headings, paragraphs and lists, read from its own blank
 * lines, "Heading:" lines and "- " / "• " bullets. Only the shape is read; the
 * text stays text.
 */
export function descriptionBlocks(text: string): DescriptionBlock[] {
  const blocks: DescriptionBlock[] = [];
  for (const chunk of text.replace(/\r\n?/g, "\n").split(/\n\s*\n/)) {
    const lines = chunk.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    if (lines.length > 1 && lines[0]!.endsWith(":") && lines[0]!.length <= 80) blocks.push({ kind: "heading", text: lines.shift()!.slice(0, -1) });
    const bullet = /^[-•*]\s+/;
    if (lines.every((line) => bullet.test(line))) blocks.push({ kind: "list", items: lines.map((line) => line.replace(bullet, "")) });
    else for (const line of lines) blocks.push(bullet.test(line) ? { kind: "list", items: [line.replace(bullet, "")] } : { kind: "paragraph", text: line });
  }
  return mergeLists(blocks);
}

function mergeLists(blocks: DescriptionBlock[]): DescriptionBlock[] {
  const out: DescriptionBlock[] = [];
  for (const block of blocks) {
    const last = out[out.length - 1];
    if (block.kind === "list" && last?.kind === "list") last.items.push(...block.items);
    else out.push(block);
  }
  return out;
}

/**
 * The consent line. The period comes from WonderJobs; with none, it is left
 * out rather than invented.
 */
export function consentText(appName: string, retentionMonths: number | null): string {
  const base = `I agree that ${appName} stores my application to consider me for this and similar roles`;
  if (retentionMonths === null || !Number.isFinite(retentionMonths) || retentionMonths <= 0) return `${base}.`;
  return `${base}, and deletes it ${retentionMonths} ${retentionMonths === 1 ? "month" : "months"} after its last update.`;
}

const EMPLOYMENT_TYPE: Record<string, string> = {
  full_time: "FULL_TIME",
  part_time: "PART_TIME",
  contract: "CONTRACTOR",
  internship: "INTERN",
  temporary: "TEMPORARY",
  freelance: "CONTRACTOR",
};

/**
 * schema.org JobPosting, as a string safe to place inside a
 * `<script type="application/ld+json">`: every "<" is escaped, so a
 * description can never close the script.
 */
export function jobPostingJsonLd(job: CareerJob, url: string, hiringOrganization: string): string {
  const salary =
    job.salaryMin != null || job.salaryMax != null
      ? {
          "@type": "MonetaryAmount",
          currency: (job.currency || "INR").toUpperCase(),
          value: { "@type": "QuantitativeValue", ...(job.salaryMin != null ? { minValue: job.salaryMin } : {}), ...(job.salaryMax != null ? { maxValue: job.salaryMax } : {}), unitText: "YEAR" },
        }
      : undefined;
  const data = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.description,
    datePosted: job.updatedAt || undefined,
    employmentType: job.jobType ? (EMPLOYMENT_TYPE[job.jobType] ?? undefined) : undefined,
    hiringOrganization: { "@type": "Organization", name: job.company || hiringOrganization },
    ...(job.workMode === "remote" ? { jobLocationType: "TELECOMMUTE" } : {}),
    ...(job.location ? { jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: job.location } } } : {}),
    ...(salary ? { baseSalary: salary } : {}),
    skills: job.skills.length > 0 ? job.skills.join(", ") : undefined,
    url,
  };
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(new RegExp("\\u2028", "g"), "\\u2028").replace(new RegExp("\\u2029", "g"), "\\u2029");
}
