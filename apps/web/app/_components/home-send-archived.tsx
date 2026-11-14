"use client";

import { Archive } from "lucide-react";
import { startTransition, useActionState, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Pill } from "@wonderhome/core/ui/pill";
import { EmptyState } from "@wonderhome/core/ui/states";
import { ConfirmationSheet } from "@wonderhome/core/ui/sheet";
import { mayRemoveHomeSendItem } from "@wonderhome/core/homesend/remove";

import { deleteArchivedHomeSendAction, type RemoveState } from "../(auth)/home-send-remove-actions";
import { restoreHomeSendItemAction, type ItemActionState } from "../(auth)/home-send-bulk-actions";
import type { HomeSendItem } from "../(auth)/home-send-actions";
import { countWords, fillIn, type HomeSendPageLabels } from "../_lib/homesend-labels";
import type { ArchiveReason } from "@wonderhome/core/homesend/archive-reasons";

/** A row's name, as the inbox shows it: what was read, else what was sent. */
function titleOf(item: HomeSendItem, fallback: string): string {
  return item.extracted?.title || item.understanding?.contentSummary || item.subject || item.sourceUrl || item.rawText?.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0] || fallback;
}

/**
 * HomeSend's archive (the owner, 2026-11-03): what waited 30 days untouched,
 * or what the daily tidy found no longer applies, set aside — kept, never
 * added, each with why — and put back with Restore (the archive's Undo).
 */
export function HomeSendArchived({ householdId, items, reasons = {}, labels, isAdmin = false, viewerMemberId = "", viewerType = "adult", compact = false }: { householdId: string; items: HomeSendItem[]; reasons?: Record<string, ArchiveReason>; labels: HomeSendPageLabels; isAdmin?: boolean; viewerMemberId?: string; viewerType?: string; compact?: boolean }) {
  const [state, restore, restoring] = useActionState<ItemActionState, FormData>(restoreHomeSendItemAction, {});
  const [deleteState, deleteAction, deleting] = useActionState<RemoveState, FormData>(deleteArchivedHomeSendAction, {});
  const [asking, setAsking] = useState<{ ids: string[] | "all" } | null>(null);
  const words = labels.inbox;
  const del = words.remove;
  const actor = { memberId: viewerMemberId, memberType: viewerType, isAdmin };
  const deletable = items.filter((item) => mayRemoveHomeSendItem(actor, item));
  const gone = new Set(deleteState.done === "deleted" ? (deleteState.ids ?? []) : []);
  const shown = items.filter((item) => !gone.has(item.id));
  const confirmDelete = () => {
    const data = new FormData();
    data.set("householdId", householdId);
    if (asking?.ids === "all") data.set("all", "1");
    else for (const id of asking?.ids ?? []) data.append("itemId", id);
    setAsking(null);
    startTransition(() => deleteAction(data));
  };
  if (shown.length === 0 && deleteState.done === "deleted") return <Alert tone="info">{countWords(del.deleted, deleteState.count ?? 0)}</Alert>;
  if (items.length === 0) return <EmptyState icon={Archive} tone="ai" title={words.archived.empty} description={words.archived.lede} />;
  return (
    <div className="space-y-4">
      {compact ? null : <p className="text-sm text-[var(--wh-foreground-muted)]">{words.archived.lede}</p>}
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.done === "restored" ? <Alert tone="info">{words.archived.restored}</Alert> : null}
      {deleteState.error ? <Alert>{deleteState.error}</Alert> : null}
      {deleteState.done === "deleted" ? (
        <Alert tone="info">
          {countWords(del.deleted, deleteState.count ?? 0)}
          {(deleteState.kept ?? 0) > 0 ? ` ${countWords(del.deleteSkipped, deleteState.kept ?? 0)}` : ""}
        </Alert>
      ) : null}
      {isAdmin && shown.length > 0 && !compact ? (
        <Pill type="button" tone="quiet" disabled={deleting} onClick={() => setAsking({ ids: "all" })}>
          {del.deleteAll}
        </Pill>
      ) : null}
      <Card className="p-2">
        <ul className="divide-y divide-[var(--wh-border)]">
          {shown.map((item) => {
            const title = titleOf(item, words.kind.unknown ?? "");
            const kind = words.kind[item.classifiedKind ?? "unknown"] ?? words.kind.unknown;
            return (
              <li key={item.id} className="flex items-center gap-3 py-2.5">
                <IconTile icon={Archive} tone="neutral" size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium break-words">{title}</span>
                  <span className="block text-xs text-[var(--wh-foreground-subtle)]">
                    {kind}
                    {reasons[item.id] ? ` · ${words.archived.reason[reasons[item.id]!]}` : null}
                  </span>
                </span>
                {/* On the HomeSend page only Restore, so a name keeps its width at 360 px (rules 11, 15); Delete for good is in the full list. */}
                {mayRemoveHomeSendItem(actor, item) && !compact ? (
                  <button
                    type="button"
                    disabled={deleting}
                    aria-label={fillIn(del.forGoodAria, { title })}
                    onClick={() => setAsking({ ids: [item.id] })}
                    className="text-xs font-medium text-[var(--wh-foreground-muted)] underline-offset-2 hover:underline"
                  >
                    {del.forGood}
                  </button>
                ) : null}
                <form action={restore}>
                  <input type="hidden" name="householdId" value={householdId} />
                  <input type="hidden" name="itemId" value={item.id} />
                  <Pill type="submit" tone="soft" disabled={restoring} aria-label={fillIn(words.archived.restoreAria, { title })}>
                    {words.archived.restore}
                  </Pill>
                </form>
              </li>
            );
          })}
        </ul>
      </Card>
      <ConfirmationSheet
        open={asking !== null}
        onOpenChange={(open) => setAsking(open ? asking : null)}
        title={asking?.ids === "all" ? countWords(del.deleteAllTitle, deletable.length) : del.deleteTitle}
        description={del.deleteBody}
        confirmLabel={del.forGood}
        cancelLabel={labels.inbox.calm.clear.cancel}
        pending={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
