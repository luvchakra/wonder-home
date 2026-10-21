"use client";

import { CalendarPlus, CircleCheck, ExternalLink, FileText, FlaskConical, Gauge, LoaderCircle, Stethoscope } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";

import type { ReportFinding, ReportReading } from "@wonderhome/core/health/report-reading";
import { HOME_MEASURE_VITAL, suggestFromReport, type ReportSuggestion } from "@wonderhome/core/health/report-suggestions";
import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Pill, PillLink } from "@wonderhome/core/ui/pill";

import { readReportAction, type ReportReadRefusal } from "../(auth)/health-report-actions";
import type { HealthFormLabels } from "../_lib/health-form-labels";
import { BookAppointmentButton } from "./health-appointment-forms";
import { AddCheckupButton } from "./health-checkup-forms";
import { AddRoutineButton } from "./health-measurement-routine-forms";

type Scope = "private" | "selected_family" | "household_operational";

export type ReportPanelRecord = {
  id: string;
  memberId: string;
  label: string;
  documentDate: string | null;
  notes: string | null;
  filePath: string | null;
  privacyScope: Scope;
};

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
}

/**
 * A health record opened in place (rule 21): its notes, its report, what the
 * report says and the next steps that follow from it (story 21-012).
 *
 * "Read the report" is offered only to the record's person or their guardian
 * (`canAsk`) — the only people the server lets ask — and every refusal is said
 * in words. Findings are what the validator kept; each says its value, the
 * report's own range and the report's own flag in words, never by colour
 * alone. Suggestions are `suggestFromReport`'s rules; each opens the existing
 * sheet prefilled, for the person to check and save, and only for someone who
 * may save it.
 */
export function HealthReportPanel({
  householdId,
  record,
  stored,
  canAsk,
  today,
  language,
  timeZone,
  members,
  labels,
}: {
  householdId: string;
  record: ReportPanelRecord;
  stored: { reading: ReportReading; readAt: string } | null;
  canAsk: boolean;
  today: string;
  language: string;
  timeZone: string;
  members: { id: string; displayName: string }[];
  labels: HealthFormLabels;
}) {
  const words = labels.report;
  const [current, setCurrent] = useState(stored);
  const [notKept, setNotKept] = useState<"not_ready" | "failed" | null>(null);
  const [refusal, setRefusal] = useState<ReportReadRefusal | null>(null);
  const [pending, startTransition] = useTransition();

  const day = (dateKey: string) => new Intl.DateTimeFormat(language, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${dateKey}T00:00:00Z`));
  const moment = (iso: string) => new Intl.DateTimeFormat(language, { day: "numeric", month: "short", year: "numeric", timeZone }).format(new Date(iso));

  function read() {
    setRefusal(null);
    startTransition(async () => {
      const reply = await readReportAction({ householdId, recordId: record.id });
      if (!reply.ok) {
        setRefusal(reply.reason);
        return;
      }
      setCurrent({ reading: reply.reading, readAt: reply.readAt });
      setNotKept(reply.kept ? null : reply.notKept);
    });
  }

  const reading = current?.reading ?? null;
  const suggestions = reading
    ? suggestFromReport({ findings: reading.findings, memberId: record.memberId, reportDate: record.documentDate ?? reading.testDate, today })
    : [];

  return (
    <div className="space-y-4">
      {record.notes ? <p className="text-sm break-words text-[var(--wh-foreground-muted)]">{record.notes}</p> : null}

      {!record.filePath ? (
        <p className="text-sm text-[var(--wh-foreground-subtle)]">{words.noReport}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <PillLink href={`/health/records/${record.id}/report`} prefetch={false} target="_blank" rel="noopener noreferrer" tone="quiet">
              <ExternalLink aria-hidden className="size-3.5" /> {words.open}
            </PillLink>
          </div>

          <section className="space-y-3" aria-live="polite">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">{words.section}</h3>
              <p className="text-xs text-[var(--wh-foreground-subtle)]">{words.lede}</p>
              <p className="text-xs text-[var(--wh-foreground-muted)]">
                {current ? fill(words.readOn, { date: moment(current.readAt) }) : canAsk ? words.notRead : words.notReadViewer}
                {reading?.testDate ? ` · ${fill(words.testDate, { date: day(reading.testDate) })}` : null}
              </p>
            </div>

            {canAsk ? (
              <Button type="button" variant={current ? "secondary" : "primary"} onClick={read} disabled={pending} className="gap-1.5">
                {pending ? <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : <FileText aria-hidden className="size-4" />}
                {pending ? words.reading : current ? words.readAgain : words.read}
              </Button>
            ) : null}

            {refusal ? <Alert tone={refusal === "failed" || refusal === "unreadable_file" ? "risk" : "attention"}>{words.refusal[refusal]}</Alert> : null}
            {notKept ? <Alert tone="info">{words.notKept[notKept]}</Alert> : null}

            {reading ? (
              reading.findings.length === 0 ? (
                <p className="text-sm text-[var(--wh-foreground-muted)]">{words.nothingRead}</p>
              ) : (
                <>
                  {reading.checkedAgainst === "quote" ? <p className="text-xs text-[var(--wh-foreground-muted)]">{words.fromPicture}</p> : null}
                  <ul className="divide-y divide-[var(--wh-border)]">
                    {reading.findings.map((finding) => (
                      <FindingRow key={finding.key} finding={finding} labels={labels} />
                    ))}
                  </ul>
                </>
              )
            ) : null}
            {reading && reading.dropped > 0 ? <p className="text-xs text-[var(--wh-foreground-subtle)]">{words.dropped}</p> : null}
            {reading?.instructionsIgnored ? <Alert tone="attention">{words.instructions}</Alert> : null}
          </section>

          {suggestions.length > 0 && reading ? (
            <section className="space-y-2">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">{words.suggest.title}</h3>
                <p className="text-xs text-[var(--wh-foreground-subtle)]">{words.suggest.lede}</p>
              </div>
              <ul className="divide-y divide-[var(--wh-border)]">
                {suggestions.map((suggestion) => (
                  <SuggestionRow
                    key={suggestion.kind === "track" ? `track.${suggestion.measure}` : suggestion.kind}
                    suggestion={suggestion}
                    findings={reading.findings}
                    record={record}
                    canAct={canAsk}
                    householdId={householdId}
                    members={members}
                    labels={labels}
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function FindingRow({ finding, labels }: { finding: ReportFinding; labels: HealthFormLabels }) {
  const words = labels.report;
  const state =
    finding.outsideBasis === "flag" && finding.flag
      ? words.flag[finding.flag]
      : finding.outside === "high" || finding.outside === "low"
        ? words.outside[finding.outside]
        : finding.flag === "normal"
          ? words.flag.normal
          : finding.referenceRange
            ? words.within
            : words.noFlag;
  const range = finding.referenceRange ? fill(words.range, { range: finding.referenceRange }) : words.noRange;
  return (
    <li className="flex items-start gap-3 py-3">
      <IconTile icon={finding.outside ? Gauge : FlaskConical} tone={finding.outside ? "attention" : "health"} />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="text-sm font-medium break-words">{finding.name}</span>
          <span className="text-sm font-semibold break-words">
            {finding.value}
            {finding.unit ? ` ${finding.unit}` : ""}
          </span>
        </p>
        <p className="text-xs break-words text-[var(--wh-foreground-muted)]">
          {state} · {range}
        </p>
        <p className="text-xs break-words text-[var(--wh-foreground-subtle)]">
          “{finding.quote}”{finding.page ? ` · ${fill(words.page, { page: String(finding.page) })}` : ""}
        </p>
      </div>
    </li>
  );
}

function SuggestionRow({
  suggestion,
  findings,
  record,
  canAct,
  householdId,
  members,
  labels,
}: {
  suggestion: ReportSuggestion;
  findings: readonly ReportFinding[];
  record: ReportPanelRecord;
  canAct: boolean;
  householdId: string;
  members: { id: string; displayName: string }[];
  labels: HealthFormLabels;
}) {
  const words = labels.report;
  if (suggestion.kind === "nothing_flagged") {
    return (
      <li className="flex items-start gap-3 py-3">
        <IconTile icon={CircleCheck} tone="handled" />
        <p className="min-w-0 flex-1 text-sm">{words.suggest.nothingFlagged}</p>
      </li>
    );
  }

  const cited = findings.filter((finding) => suggestion.findingKeys.includes(finding.key));
  const names = cited.map((finding) => finding.name).join(", ");
  const because = fill(words.suggest.because, { names });
  const findingsLine = cited.map((finding) => `${finding.name} ${finding.value}${finding.unit ? ` ${finding.unit}` : ""}`).join("; ");
  const common = { householdId, members, labels, defaultPrivacyScope: record.privacyScope } as const;

  let icon = Stethoscope;
  let title = words.suggest.followUpTitle;
  let actions: ReactNode = null;

  if (suggestion.kind === "follow_up") {
    actions = canAct ? (
      <BookAppointmentButton
        {...common}
        defaultMemberId={suggestion.memberId}
        defaultAppointmentType="doctor"
        defaultNotes={fill(words.suggest.followUpNotes, { label: record.label, findings: findingsLine })}
        trigger={<Pill type="button" tone="soft">{words.suggest.followUpAction}</Pill>}
      />
    ) : null;
  } else if (suggestion.kind === "track") {
    icon = Gauge;
    title = fill(words.suggest.trackTitle, { measure: words.measure[suggestion.measure] });
    const vital = HOME_MEASURE_VITAL[suggestion.measure];
    actions = canAct ? (
      <AddRoutineButton
        {...common}
        defaultMemberId={suggestion.memberId}
        defaultVitalType={vital.vitalType}
        defaultCustomLabel={vital.custom ? words.bloodSugarLabel : undefined}
        defaultCadenceDays="7"
        defaultNextDueOn={suggestion.startsOn}
        defaultNotes={fill(words.suggest.trackNotes, { label: record.label })}
        trigger={<Pill type="button" tone="soft">{words.suggest.trackAction}</Pill>}
      />
    ) : null;
  } else {
    icon = CalendarPlus;
    title = words.suggest.recheckTitle;
    actions = canAct ? (
      <div className="flex flex-wrap gap-1.5">
        {suggestion.options.map((option) => (
          <AddCheckupButton
            key={option.months}
            {...common}
            defaultMemberId={suggestion.memberId}
            defaultLabel={fill(words.suggest.recheckLabel, { label: record.label })}
            defaultCheckupType="diagnostic"
            defaultNextDueOn={option.dueOn}
            defaultNotes={findingsLine}
            trigger={<Pill type="button" tone="soft">{option.months === 3 ? words.suggest.recheckIn3 : words.suggest.recheckIn6}</Pill>}
          />
        ))}
      </div>
    ) : null;
  }

  return (
    <li className="flex flex-wrap items-start gap-3 py-3">
      <IconTile icon={icon} tone="health" />
      <div className="min-w-0 flex-1 basis-40 space-y-0.5">
        <p className="text-sm font-medium break-words">{title}</p>
        <p className="text-xs break-words text-[var(--wh-foreground-subtle)]">{because}</p>
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </li>
  );
}
