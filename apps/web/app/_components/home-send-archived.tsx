"use client";

import { Archive } from "lucide-react";
import { startTransition, useActionState, useState, type ReactNode } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Card } from "@wonderhome/core/ui/card";
import { CollapsibleSection } from "@wonderhome/core/ui/collapsible-section";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Pill } from "@wonderhome/core/ui/pill";
import { EmptyState } from "@wonderhome/core/ui/states";
import { ConfirmationSheet } from "@wonderhome/core/ui/sheet";
import { mayRemoveHomeSendItem } from "@wonderhome/core/homesend/remove";
import { setAsideName } from "@wonderhome/core/homesend/inbox-view";

import { deleteArchivedHomeSendAction, type RemoveState } from "../(auth)/home-send-remove-actions";
import { restoreHomeSendItemAction, type ItemActionState } from "../(auth)/home-send-bulk-actions";
import type { HomeSendItem } from "../(auth)/home-send-actions";
import { countWords, fillIn, type HomeSendPageLabels } from "../_lib/homesend-labels";
import type { ArchiveReason } from "@wonderhome/core/homesend/archive-reasons";

/**
 * HomeSend's archive (the owner, 2026-11-03): what waited 30 days untouched,
 * or what the daily tidy found no longer applies, set aside — kept, never
 * added, each with why — and put back with Restore (the archive's Undo).
 */
export function HomeSendArchived({ householdId, items, reasons = {}, labels, isAdmin = false, viewerMemberId = "", viewerType = "adult", compact = false, total }: { householdId: string; items: HomeSendItem[]; reasons?: Record<string, ArchiveReason>; labels: HomeSendPageLabels; isAdmin?: boolean; viewerMemberId?: string; viewerType?: string; compact?: boolean; /** Everything set aside, shown or not: what "Delete all" counts. */ total?: number }) {
  const [state, restore, restoring] = useActionState<ItemActionState, FormData>(restoreHomeSendItemAction, {});
  const [deleteState, deleteAction, deleting] = useActionState<RemoveState, FormData>(deleteArchivedHomeSendAction, {});
  const [asking, setAsking] = useState<{ ids: string[] | "all" } | null>(null);
  const words = labels.inbox;
  const del = words.remove;
  // On the HomeSend page the words say "set aside"; the full list keeps "archived".
  const wording = compact ? labels.setAside : { delete: del.forGood, deleteAria: del.forGoodAria, deleteAll: del.deleteAll, deleteAllTitle: del.deleteAllTitle };
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
  // On the HomeSend page nothing set aside means no section, but the last Restore still says it worked.
  if (items.length === 0 && compact) return state.done === "restored" ? <Alert tone="info">{words.archived.restored}</Alert> : null;
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
      {isAdmin && shown.length > 0 ? (
        <Pill type="button" tone="quiet" disabled={deleting} onClick={() => setAsking({ ids: "all" })}>
          {wording.deleteAll}
        </Pill>
      ) : null}
      <Card className="p-2">
        <ul className="divide-y divide-[var(--wh-border)]">
          {shown.map((item) => {
            const title = setAsideName(item, labels.inbox.calm.failedName);
            // "Not sure yet" means nothing on a row already set aside: its reason says what it is.
            const known = item.classifiedKind && item.classifiedKind !== "unknown" ? words.kind[item.classifiedKind] : undefined;
            const reason = reasons[item.id] ? words.archived.reason[reasons[item.id]!] : undefined;
            const line = [known, reason].filter(Boolean).join(" · ");
            return (
              <li key={item.id} className="flex items-center gap-3 py-2.5">
                <IconTile icon={Archive} tone="neutral" size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium break-words">{title}</span>
                  {line ? <span className="block text-xs text-[var(--wh-foreground-subtle)]">{line}</span> : null}
                </span>
                {/* Restore and Delete as one compact pair, stacked, so a name keeps its width at 360 px (rules 11, 14). */}
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <form action={restore}>
                    <input type="hidden" name="householdId" value={householdId} />
                    <input type="hidden" name="itemId" value={item.id} />
                    <Pill type="submit" tone="soft" disabled={restoring} aria-label={fillIn(words.archived.restoreAria, { title })}>
                      {words.archived.restore}
                    </Pill>
                  </form>
                  {mayRemoveHomeSendItem(actor, item) ? (
                    <button
                      type="button"
                      disabled={deleting}
                      aria-label={fillIn(wording.deleteAria, { title })}
                      onClick={() => setAsking({ ids: [item.id] })}
                      className="px-1 text-xs font-medium text-[var(--wh-foreground-muted)] underline-offset-2 hover:underline"
                    >
                      {wording.delete}
                    </button>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
      <ConfirmationSheet
        open={asking !== null}
        onOpenChange={(open) => setAsking(open ? asking : null)}
        title={asking?.ids === "all" ? countWords(wording.deleteAllTitle, compact && total !== undefined ? total : deletable.length) : del.deleteTitle}
        description={del.deleteBody}
        confirmLabel={wording.delete}
        cancelLabel={labels.inbox.calm.clear.cancel}
        pending={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

/**
 * "Set aside", folded away on the HomeSend page (owner, 2026-11-20: "clutter free"). Shown once there is
 * something set aside, and kept mounted for the rest of the visit, so restoring the last item still
 * shows its own "Restored" inside rather than vanishing with the list.
 */
export function SetAsideFold({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const [seen, setSeen] = useState(count > 0);
  if (count > 0 && !seen) setSeen(true);
  if (!seen && count === 0) return null;
  return (
    <CollapsibleSection icon={Archive} tone="neutral" title={title} count={count} as="h2">
      {children}
    </CollapsibleSection>
  );
}
