"use client";

import { useActionState, useState } from "react";
import { GraduationCap, HeartPulse, Inbox, MessageCircle, ReceiptText, ShoppingBasket } from "lucide-react";

import { ButtonLink, Button } from "@wonderhome/core/ui/button";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { answerNeedsYouAction, type NeedsYouState } from "../(auth)/needs-you-actions";

export type NeedsYouRow = {
  id: string;
  kind: string | null;
  prompt: string;
  defaultLine: string;
  answers: { value: string; label: string }[];
  /** Answered where it lives (a HomeTalk proposal, an approval). */
  href: string | null;
  openLabel: string;
};

type Labels = { title: string; lede: string; more: string | null; done: string; settled: string; failed: string };

function iconFor(kind: string | null): { icon: typeof Inbox; tone: IconTone } {
  if (kind === "bill" || kind === "receipt" || kind === "purchase") return { icon: ReceiptText, tone: "money" };
  if (kind === "school_item" || kind === "activity_item") return { icon: GraduationCap, tone: "school" };
  if (kind === "health_document") return { icon: HeartPulse, tone: "health" };
  if (kind === "grocery_item") return { icon: ShoppingBasket, tone: "meals" };
  if (kind && /^[a-z_.]+$/.test(kind) && !kind.includes("homesend")) return { icon: MessageCircle, tone: "ai" };
  return { icon: Inbox, tone: "ai" };
}

/**
 * The rows of "Needs you": tinted tile, the question, the line saying what
 * happens if nobody answers (and when), then the tap answers (rule 4, rule 20).
 * The first answer is the committing one (blue); the rest are secondary.
 */
export function NeedsYouList({ householdId, rows, total, labels, className }: { householdId: string; rows: NeedsYouRow[]; total: number; labels: Labels; className?: string }) {
  const [answered, setAnswered] = useState<Record<string, "done" | "settled">>({});
  const open = rows.filter((row) => !answered[row.id]);
  const finished = rows.filter((row) => answered[row.id]);
  return (
    <Card id="needs-you" className={className}>
      <SectionHeader title={labels.title} count={Math.max(0, total - Object.keys(answered).length)} />
      <p className="mt-1 text-sm text-[var(--wh-foreground-muted)]">{labels.lede}</p>
      <ul className="mt-3 grid gap-3">
        {open.map((row) => (
          <NeedsYouItemRow key={row.id} householdId={householdId} row={row} labels={labels} onAnswered={(result) => setAnswered((was) => ({ ...was, [row.id]: result }))} />
        ))}
        {finished.map((row) => (
          <li key={row.id} className="text-sm text-[var(--wh-handled)]" role="status">
            {answered[row.id] === "done" ? labels.done : labels.settled}
          </li>
        ))}
      </ul>
      {labels.more ? <p className="mt-3 text-sm text-[var(--wh-foreground-muted)]">{labels.more}</p> : null}
    </Card>
  );
}

function NeedsYouItemRow({ householdId, row, labels, onAnswered }: { householdId: string; row: NeedsYouRow; labels: Labels; onAnswered: (result: "done" | "settled") => void }) {
  const [state, action, pending] = useActionState<NeedsYouState, FormData>(async (previous, formData) => {
    const next = await answerNeedsYouAction(previous, formData);
    if (next.result === "done" || next.result === "settled") onAnswered(next.result);
    return next;
  }, {});
  const { icon, tone } = iconFor(row.kind);
  return (
    <li className="flex gap-3 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-background)] p-3">
      <IconTile icon={icon} tone={tone} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium break-words text-[var(--wh-foreground)]">{row.prompt}</p>
        <p className="mt-1 text-xs text-[var(--wh-foreground-muted)]">{row.defaultLine}</p>
        {row.href ? (
          <div className="mt-2">
            <ButtonLink href={row.href} variant="secondary">
              {row.openLabel}
            </ButtonLink>
          </div>
        ) : (
          <form action={action} className="mt-2 flex flex-wrap gap-2">
            <input type="hidden" name="householdId" value={householdId} />
            <input type="hidden" name="id" value={row.id} />
            {row.answers.map((answer, index) => (
              <Button key={answer.value} type="submit" name="answer" value={answer.value} variant={index === 0 ? "primary" : "secondary"} disabled={pending}>
                {answer.label}
              </Button>
            ))}
          </form>
        )}
        {state.result === "failed" ? (
          <p className="mt-2 text-sm text-[var(--wh-attention)]" role="alert">
            {labels.failed}
          </p>
        ) : null}
      </div>
    </li>
  );
}
