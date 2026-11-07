"use client";

import { MoreHorizontal } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Pill } from "@wonderhome/core/ui/pill";
import { ConfirmationSheet } from "@wonderhome/core/ui/sheet";
import { SwipeToDismiss } from "@wonderhome/core/ui/swipe-to-dismiss";

import { restoreArchivedHomeSendAction } from "../(auth)/home-send-clear-actions";
import { removeHomeSendItemsAction } from "../(auth)/home-send-remove-actions";
import { countWords, fillIn, type HomeSendPageLabels } from "../_lib/homesend-labels";

/**
 * Remove one HomeSend item on its own (the owner, 2026-11-03). Three doors to
 * the same job (rule 14: one control per row on a phone): a swipe (the
 * Groceries gesture), a "Remove" button in the row's detail, and — on a
 * computer only — a trailing ⋯ menu. Removing archives with an Undo; a group
 * of identical items asks once, saying how many. The server decides who may.
 */
type Removal = { ids: string[]; title: string };
type RemoveContext = {
  remove: (ids: string[], title: string) => Promise<boolean>;
  labels: HomeSendPageLabels["inbox"]["remove"];
};

const Ctx = createContext<RemoveContext | null>(null);

export function useRemove(): RemoveContext {
  const value = useContext(Ctx);
  if (!value) throw new Error("useRemove must be used within <RemoveProvider>");
  return value;
}

export function RemoveProvider({ householdId, labels, undoLabel, cancelLabel, children }: { householdId: string; labels: HomeSendPageLabels["inbox"]["remove"]; undoLabel: string; cancelLabel: string; children: ReactNode }) {
  const [notice, setNotice] = useState<{ text: string; ids: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState<(Removal & { resolve: (go: boolean) => void }) | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => () => void (timer.current && window.clearTimeout(timer.current)), []);

  const run = useCallback(
    async (ids: string[]): Promise<boolean> => {
      const data = new FormData();
      data.set("householdId", householdId);
      for (const id of ids) data.append("itemId", id);
      const result = await removeHomeSendItemsAction({}, data);
      if (result.error || result.done !== "removed") {
        setError(result.error ?? labels.notAllowed);
        return false;
      }
      setError(null);
      const count = result.count ?? ids.length;
      setNotice({ text: countWords((result.entries ?? 0) > 0 ? labels.removedEntry : labels.removed, count), ids: result.ids ?? ids });
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setNotice(null), 9000);
      return true;
    },
    [householdId, labels],
  );

  const remove = useCallback(
    (ids: string[], title: string): Promise<boolean> => {
      // One item goes at once; a group asks first, saying how many.
      if (ids.length <= 1) return run(ids);
      return new Promise<boolean>((resolve) => setAsking({ ids, title, resolve: (go) => (go ? void run(ids).then(resolve) : resolve(false)) }));
    },
    [run],
  );

  const undo = async () => {
    if (!notice) return;
    const data = new FormData();
    data.set("householdId", householdId);
    for (const id of notice.ids) data.append("itemId", id);
    setNotice(null);
    const result = await restoreArchivedHomeSendAction({}, data);
    if (result.error) setError(result.error);
  };

  const value = useMemo(() => ({ remove, labels }), [remove, labels]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {error ? (
        <div className="mt-2">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {notice ? (
        <div role="status" className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-3 shadow-[var(--wh-shadow-raised)] md:bottom-6">
          <span className="flex items-center gap-3">
            <span className="min-w-0 flex-1 text-sm">{notice.text}</span>
            <Pill type="button" tone="quiet" onClick={undo}>
              {undoLabel}
            </Pill>
          </span>
        </div>
      ) : null}
      <ConfirmationSheet
        open={asking !== null}
        onOpenChange={(open) => {
          if (!open && asking) {
            asking.resolve(false);
            setAsking(null);
          }
        }}
        title={asking ? countWords(labels.confirmTitle, asking.ids.length) : ""}
        description={labels.confirmBody}
        confirmLabel={labels.action}
        cancelLabel={cancelLabel}
        onConfirm={() => {
          const current = asking;
          setAsking(null);
          current?.resolve(true);
        }}
      />
    </Ctx.Provider>
  );
}

/** A list row that can be swiped away; the row as given when this person may not remove it. */
export function RemovableRow({ ids, title, canRemove, children, className }: { ids: string[]; title: string; canRemove: boolean; children: ReactNode; className?: string }) {
  const { remove, labels } = useRemove();
  if (!canRemove) return <li className={className}>{children}</li>;
  return (
    <SwipeToDismiss label={labels.action} onDismiss={() => remove(ids, title)} className={className}>
      {children}
    </SwipeToDismiss>
  );
}

/** The computer's trailing ⋯ with Remove in it. Not shown on a phone, where the swipe and the detail are the doors. */
export function RemoveMenu({ ids, title }: { ids: string[]; title: string }) {
  const { remove, labels } = useRemove();
  const [open, setOpen] = useState(false);
  return (
    <span className="relative hidden shrink-0 md:block">
      <button
        type="button"
        aria-label={fillIn(labels.menu, { title })}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="grid size-8 place-items-center rounded-[var(--wh-radius-pill)] text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]"
      >
        <MoreHorizontal aria-hidden className="size-4" />
      </button>
      {open ? (
        <span className="absolute right-0 z-10 mt-1 rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-1 shadow-[var(--wh-shadow-raised)]">
          <button
            type="button"
            aria-label={fillIn(labels.aria, { title })}
            onClick={() => {
              setOpen(false);
              void remove(ids, title);
            }}
            className="block w-full rounded-[var(--wh-radius-sm)] px-3 py-1.5 text-left text-sm hover:bg-[var(--wh-surface-muted)]"
          >
            {labels.action}
          </button>
        </span>
      ) : null}
    </span>
  );
}

/** "Remove" inside a row's detail, for the same job on a phone without a swipe. */
export function RemoveButton({ ids, title, onRemoved }: { ids: string[]; title: string; onRemoved?: () => void }) {
  const { remove, labels } = useRemove();
  return (
    <Pill
      type="button"
      tone="quiet"
      aria-label={fillIn(labels.aria, { title })}
      onClick={async () => {
        if (await remove(ids, title)) onRemoved?.();
      }}
    >
      {labels.action}
    </Pill>
  );
}
