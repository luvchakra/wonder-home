"use client";

import { MoreHorizontal } from "lucide-react";
import { startTransition, useActionState, useState, type ReactNode } from "react";

import type { AddAnywayCounts } from "@wonderhome/core/homesend/inbox-view";
import { Alert } from "@wonderhome/core/ui/alert";
import { Pill } from "@wonderhome/core/ui/pill";
import { Popover } from "@wonderhome/core/ui/popover";
import { ConfirmationSheet } from "@wonderhome/core/ui/sheet";

import { addAllAnywayHomeSendAction, archiveAllHomeSendAction, restoreArchivedHomeSendAction, type ClearState } from "../(auth)/home-send-clear-actions";
import { countWords, type HomeSendPageLabels } from "../_lib/homesend-labels";

export type ClearCounts = {
  /** Every waiting and unreadable item "Archive all" would move. */
  archive: number;
  /** What "Add all anyway" would try, and what it keeps behind a guard. */
  add: AddAnywayCounts;
  /** Unreadable items, never added. */
  failed: number;
};

/**
 * HomeSend's two one-tap clears (the owner, 2026-11-03), each behind its own
 * confirm that says, in words, what happens and what doesn't. Shown to Admins
 * only; the server checks again. One place on the screen, beside the opening
 * sentence, so its result and Undo stay after the list empties: plain buttons
 * when the list is long (five or more), a ⋯ menu otherwise — never both, one
 * button per job (rule 14).
 */
export function HomeSendClear({ householdId, counts, labels, lead }: { householdId: string; counts: ClearCounts; labels: HomeSendPageLabels; lead: ReactNode }) {
  const variant = counts.archive >= 5 ? "buttons" : "menu";
  const words = labels.inbox.calm.clear;
  const [archiveState, archiveAll, archiving] = useActionState<ClearState, FormData>(archiveAllHomeSendAction, {});
  const [addState, addAll, adding] = useActionState<ClearState, FormData>(addAllAnywayHomeSendAction, {});
  const [restoreState, restore, restoring] = useActionState<ClearState, FormData>(restoreArchivedHomeSendAction, {});
  const [asking, setAsking] = useState<"archive" | "add" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const submit = (action: (data: FormData) => void) => {
    const data = new FormData();
    data.set("householdId", householdId);
    startTransition(() => action(data));
    setAsking(null);
  };
  const canAdd = counts.add.add > 0;
  const offered = counts.archive > 0;

  const choices = (
    <>
      {counts.archive > 0 ? (
        <Pill
          type="button"
          tone="quiet"
          disabled={archiving || adding}
          onClick={() => {
            setMenuOpen(false);
            setAsking("archive");
          }}
        >
          {words.archiveAll}
        </Pill>
      ) : null}
      {canAdd ? (
        <Pill
          type="button"
          tone="quiet"
          disabled={archiving || adding}
          onClick={() => {
            setMenuOpen(false);
            setAsking("add");
          }}
        >
          {adding ? labels.inbox.bulk.adding : words.addAll}
        </Pill>
      ) : null}
    </>
  );

  const kept = [
    counts.add.bills > 0 ? countWords(words.keptMoney, counts.add.bills) : null,
    counts.add.health > 0 ? countWords(words.keptHealth, counts.add.health) : null,
    counts.add.outside > 0 ? countWords(words.keptOutside, counts.add.outside) : null,
    counts.add.unclear > 0 ? countWords(words.keptUnclear, counts.add.unclear) : null,
    counts.failed > 0 ? countWords(words.keptFailed, counts.failed) : null,
  ].filter((line): line is string => line !== null);

  const undoIds = archiveState.done === "archived" && restoreState.done !== "restored" ? (archiveState.archivedIds ?? []) : [];

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">{lead}</div>
        {offered && variant === "menu" ? (
        <Popover
          open={menuOpen}
          onOpenChange={setMenuOpen}
          label={words.more}
          side="bottom"
          align="end"
          trigger={
            <button
              type="button"
              aria-label={words.more}
              className="grid size-9 place-items-center rounded-[var(--wh-radius-pill)] text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]"
            >
              <MoreHorizontal aria-hidden className="size-5" />
            </button>
          }
        >
          <div className="flex flex-col gap-1.5 p-1">{choices}</div>
        </Popover>
        ) : null}
      </div>
      {offered && variant === "buttons" ? <div className="flex flex-wrap gap-2">{choices}</div> : null}

      {archiveState.error ? <Alert>{archiveState.error}</Alert> : null}
      {addState.error ? <Alert>{addState.error}</Alert> : null}
      {restoreState.error ? <Alert>{restoreState.error}</Alert> : null}
      {archiveState.done === "archived" && undoIds.length > 0 ? (
        <Alert tone="info">
          <span className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1">{countWords(words.archived, archiveState.count ?? 0)}</span>
            <form action={restore}>
              <input type="hidden" name="householdId" value={householdId} />
              {undoIds.map((id) => (
                <input key={id} type="hidden" name="itemId" value={id} />
              ))}
              <Pill type="submit" tone="quiet" disabled={restoring}>
                {restoring ? labels.review.undoing : labels.inbox.undo}
              </Pill>
            </form>
          </span>
        </Alert>
      ) : null}
      {restoreState.done === "restored" ? <Alert tone="info">{countWords(words.restored, restoreState.count ?? 0)}</Alert> : null}
      {addState.done === "added" ? (
        <Alert tone="info">
          {countWords(words.added, addState.added ?? 0)}
          {(addState.kept ?? 0) > 0 ? ` ${countWords(words.kept, addState.kept ?? 0)}` : ""}
        </Alert>
      ) : null}

      <ConfirmationSheet
        open={asking === "archive"}
        onOpenChange={(open) => setAsking(open ? "archive" : null)}
        title={countWords(words.archiveTitle, counts.archive)}
        description={words.archiveBody}
        confirmLabel={words.archiveAll}
        cancelLabel={words.cancel}
        pending={archiving}
        onConfirm={() => submit(archiveAll)}
      />
      <ConfirmationSheet
        open={asking === "add"}
        onOpenChange={(open) => setAsking(open ? "add" : null)}
        title={countWords(words.addTitle, counts.add.add)}
        description={words.addBody}
        confirmLabel={words.addAll}
        cancelLabel={words.cancel}
        pending={adding}
        onConfirm={() => submit(addAll)}
      >
        {kept.length > 0 ? (
          <ul className="space-y-1 text-sm text-[var(--wh-foreground-muted)]">
            {kept.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
      </ConfirmationSheet>
    </div>
  );
}
