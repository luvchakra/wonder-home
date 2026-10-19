import { GitMerge, Link2, Moon, Scissors, UserRoundCheck, Wind } from "lucide-react";

import { ActionRow } from "@wonderhome/core/ui/action-row";
import { Card } from "@wonderhome/core/ui/card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import type { Translate } from "@wonderhome/core/i18n/translate";

import { SleepUndoButton } from "./sleep-undo";

/**
 * What HomeBrain did while the household slept (HomeBrain Sleep), inside the
 * Learned tab — the one place it is kept, and kept small (the owner,
 * 2026-10-19): the night's line, what it tidied with Undo beside each, what
 * is resting with Bring back, and how much it connected across the home.
 * Nothing here asks anything of anyone; a contradiction goes to Needs review
 * instead.
 */

export type SleepChange = { id: string; kind: "merged" | "split" | "expired" | "reattributed" | "rested"; statement: string; count: number; reason: string | null; at: Date };
export type SleepView = {
  lastSlept: Date | null;
  counts: Record<string, number>;
  changes: SleepChange[];
  links: { total: number; examples: string[] };
};

const ICON = { merged: GitMerge, split: Scissors, expired: Wind, reattributed: UserRoundCheck, rested: Moon } as const;

export function SleepSection({ view, t, householdId, when }: { view: SleepView; t: Translate; householdId: string; when: (at: Date) => string }) {
  const tidied = view.changes.filter((change) => change.kind !== "rested");
  const resting = view.changes.filter((change) => change.kind === "rested");
  const failed = t("review.sleep.failed");
  const sentence = (change: SleepChange) =>
    change.kind === "merged"
      ? t("review.sleep.kind.merged", { count: change.count, statement: change.statement })
      : change.kind === "split"
        ? t("review.sleep.kind.split", { statement: change.statement })
        : change.kind === "expired"
          ? change.reason === "empty"
            ? t("review.sleep.kind.expiredEmpty", { statement: change.statement })
            : t("review.sleep.kind.expired", { statement: change.statement })
          : change.kind === "reattributed"
            ? t("review.sleep.kind.reattributed", { statement: change.statement })
            : change.statement;

  return (
    <section className="space-y-3" aria-label={t("review.sleep.title")}>
      <SectionHeader title={t("review.sleep.title")} />
      <p className="text-sm text-[var(--wh-foreground-muted)]">
        {view.lastSlept ? t("review.sleep.last", { when: when(view.lastSlept) }) : t("review.sleep.never")} {t("review.sleep.lede")}
      </p>

      {tidied.length > 0 ? (
        <Card className="p-2">
          <ul className="divide-y divide-[var(--wh-border)] px-1">
            {tidied.map((change) => (
              <ActionRow
                key={change.id}
                icon={ICON[change.kind]}
                tone="ai"
                title={sentence(change)}
                meta={when(change.at)}
                action={<SleepUndoButton householdId={householdId} consolidationId={change.id} label={t("review.sleep.undo", { statement: change.statement })} failed={failed} />}
              />
            ))}
          </ul>
        </Card>
      ) : null}

      {resting.length > 0 ? (
        <Card className="space-y-1 p-3">
          <p className="text-sm font-semibold">{t("review.sleep.resting.title")}</p>
          <p className="text-xs text-[var(--wh-foreground-muted)]">{t("review.sleep.resting.lede")}</p>
          <ul className="divide-y divide-[var(--wh-border)]">
            {resting.map((change) => (
              <ActionRow
                key={change.id}
                icon={Moon}
                tone="neutral"
                title={change.statement}
                action={<SleepUndoButton householdId={householdId} consolidationId={change.id} label={t("review.sleep.wake", { statement: change.statement })} failed={failed} />}
              />
            ))}
          </ul>
        </Card>
      ) : null}

      {view.links.total > 0 ? (
        <Card className="space-y-1 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Link2 aria-hidden className="size-4 text-[var(--wh-foreground-muted)]" />
            {t("review.sleep.links.title")}
          </p>
          <p className="text-xs text-[var(--wh-foreground-muted)]">{t("review.sleep.links.lede", { count: view.links.total })}</p>
          <ul className="list-disc space-y-1 ps-5 text-sm">
            {view.links.examples.map((example) => (
              <li key={example}>{example}</li>
            ))}
          </ul>
        </Card>
      ) : null}
    </section>
  );
}
