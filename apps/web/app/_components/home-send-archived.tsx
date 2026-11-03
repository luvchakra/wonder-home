"use client";

import { Archive } from "lucide-react";
import { useActionState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Pill } from "@wonderhome/core/ui/pill";
import { EmptyState } from "@wonderhome/core/ui/states";

import { restoreHomeSendItemAction, type ItemActionState } from "../(auth)/home-send-bulk-actions";
import type { HomeSendItem } from "../(auth)/home-send-actions";
import { fillIn, type HomeSendPageLabels } from "../_lib/homesend-labels";
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
export function HomeSendArchived({ householdId, items, reasons = {}, labels }: { householdId: string; items: HomeSendItem[]; reasons?: Record<string, ArchiveReason>; labels: HomeSendPageLabels }) {
  const [state, restore, restoring] = useActionState<ItemActionState, FormData>(restoreHomeSendItemAction, {});
  const words = labels.inbox;
  if (items.length === 0) return <EmptyState icon={Archive} tone="ai" title={words.archived.empty} description={words.archived.lede} />;
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--wh-foreground-muted)]">{words.archived.lede}</p>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.done === "restored" ? <Alert tone="info">{words.archived.restored}</Alert> : null}
      <Card className="p-2">
        <ul className="divide-y divide-[var(--wh-border)]">
          {items.map((item) => {
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
    </div>
  );
}
