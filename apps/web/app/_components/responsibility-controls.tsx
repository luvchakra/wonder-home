"use client";

import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef, useState, type ReactNode } from "react";

import { AUTONOMY_MODES, type AutonomyMode } from "@wonderhome/core/household/autonomy";
import { cn } from "@wonderhome/core/lib/cn";
import { ResponsibilityCard, type ResponsibilityCardProps } from "@wonderhome/core/ui/outcome-card";
import { Pill } from "@wonderhome/core/ui/pill";
import { ConfirmationSheet, Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import { acceptRebalanceAction, removeResponsibilityAction, saveResponsibilityAction, setGroupAutonomyAction } from "../(auth)/configuration-actions";
import { iconForOutcome } from "../_lib/outcome-icons";
import { ResponsibilityForm, type ConfigFormLabels, type MemberOption, type ResponsibilityInitial } from "./config-forms";

/**
 * The Responsibilities controls' words in the viewer's language, built on
 * the server by `responsibilityLabels` (story 22-004). `{name}` stays a
 * placeholder, filled in here with a name the household gave.
 */
export type ResponsibilityLabels = {
  add: string;
  addTitle: string;
  addLede: string;
  owner: string;
  backup: string;
  frequency: string;
  adminOnly: string;
  remove: string;
  removeTitle: string;
  removeLede: string;
  removeConfirm: string;
  giveTo: string;
  swapping: string;
  swap: string;
  form: ConfigFormLabels;
};

const withName = (template: string, name: string) => template.replace(/\{name\}/g, () => name);

/** "Add responsibility" as a sheet, so the list stays where it was (rule 6). */
export function AddResponsibilityButton({
  householdId,
  members,
  outcomes,
  labels,
}: {
  householdId: string;
  members: MemberOption[];
  outcomes: { key: string; label: string }[];
  labels: ResponsibilityLabels;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pill type="button" onClick={() => setOpen(true)} tone="primary">
        <Plus aria-hidden className="size-3.5" /> {labels.add}
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title={labels.addTitle} description={labels.addLede}>
        <ResponsibilityForm action={saveResponsibilityAction} householdId={householdId} members={members} outcomes={outcomes} labels={labels.form} />
      </Sheet>
    </>
  );
}

/**
 * What a helper looks after, on their own card (Househelper): each outcome a
 * chip that opens it — change who owns it or backs it up, or take it off —
 * and "Add" for another one, starting with this helper as its owner. The same
 * form and the same actions as Manage Household → Responsibilities, never a
 * second write path (rule 12: add, change and remove, all three).
 */
export function HelperLooksAfter({
  householdId,
  helperId,
  owned,
  outcomes,
  members,
  editable,
  emptyText,
  labels,
}: {
  householdId: string;
  helperId: string;
  owned: (ResponsibilityInitial & { definition?: string })[];
  outcomes: { key: string; label: string }[];
  members: MemberOption[];
  editable: boolean;
  emptyText: string;
  labels: ResponsibilityLabels;
}) {
  const [adding, setAdding] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const open = owned.find((item) => item.outcomeKey === openKey) ?? null;

  return (
    <div className="space-y-2">
      {owned.length === 0 ? (
        <p className="text-sm text-[var(--wh-foreground-muted)]">{emptyText}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {owned.map((item) => (
            <li key={item.outcomeKey}>
              {editable ? (
                <button
                  type="button"
                  onClick={() => setOpenKey(item.outcomeKey)}
                  className="min-h-8 rounded-[var(--wh-radius-pill)] bg-[var(--wh-surface-muted)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--wh-primary-soft)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]"
                >
                  {item.outcomeLabel}
                </button>
              ) : (
                <span className="inline-block rounded-[var(--wh-radius-pill)] bg-[var(--wh-surface-muted)] px-2.5 py-1 text-xs font-medium">{item.outcomeLabel}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable ? (
        <Pill type="button" tone="soft" onClick={() => setAdding(true)}>
          <Plus aria-hidden className="size-3.5" /> {labels.add}
        </Pill>
      ) : null}

      <Sheet open={adding} onOpenChange={setAdding} title={labels.addTitle} description={labels.addLede}>
        <ResponsibilityForm action={saveResponsibilityAction} householdId={householdId} members={members} outcomes={outcomes} defaultOwnerId={helperId} labels={labels.form} />
      </Sheet>
      <Sheet open={open !== null} onOpenChange={(next) => setOpenKey(next ? openKey : null)} title={open?.outcomeLabel ?? ""} description={open?.definition}>
        {open ? (
          <div className="space-y-4">
            <ResponsibilityForm action={saveResponsibilityAction} householdId={householdId} members={members} initial={open} labels={labels.form} />
            <RemoveResponsibilityControl householdId={householdId} outcomeKey={open.outcomeKey} outcomeLabel={open.outcomeLabel} onRemoved={() => setOpenKey(null)} labels={labels} />
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}

/**
 * A responsibility row that opens on tap — what "expand" means here, since
 * there is nothing behind it but what the sheet already shows: what good
 * looks like, and the same owner/backup/autonomy fields the row summarises.
 *
 * Takes `outcomeKey` rather than a resolved `icon`/`tone`, and looks the
 * presentation up itself, client-side. A React icon component is a function,
 * and a Server Component cannot hand a function to a Client Component as a
 * prop value — only through JSX it renders itself. `outcomeKey` is a plain
 * string, so it survives the crossing; everywhere else that reads
 * `iconForOutcome` server-side (Family, Notifications, Activity) renders
 * `IconTile` directly, in the server component's own JSX, and never had this
 * problem — this was the one place the same icon ended up inside a prop
 * object handed to a client component instead.
 */
export function ResponsibilityRow({
  card,
  outcomeKey,
  definition,
  editable,
  householdId,
  members,
  initial,
  autoOpen,
  labels,
}: {
  card: Omit<ResponsibilityCardProps, "onExpand" | "icon" | "tone">;
  labels: ResponsibilityLabels;
  outcomeKey: string;
  /** "What good looks like", from the playbook entry — not shown collapsed. */
  definition?: string;
  /** Whether this viewer may change it (household admins only). */
  editable: boolean;
  householdId: string;
  members: MemberOption[];
  initial: ResponsibilityInitial;
  /** A link elsewhere pointed straight at this one — open its detail without making the visitor find and tap it themselves. */
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen ?? false);
  const presentation = iconForOutcome(outcomeKey);

  return (
    <>
      <ResponsibilityCard {...card} icon={presentation.icon} tone={presentation.tone} onExpand={() => setOpen(true)} />

      <Sheet open={open} onOpenChange={setOpen} title={initial.outcomeLabel} description={definition}>
        {editable ? (
          <div className="space-y-4">
            <ResponsibilityForm action={saveResponsibilityAction} householdId={householdId} members={members} initial={initial} labels={labels.form} />
            <RemoveResponsibilityControl householdId={householdId} outcomeKey={outcomeKey} outcomeLabel={initial.outcomeLabel} onRemoved={() => setOpen(false)} labels={labels} />
          </div>
        ) : (
          <ReadOnlyDetail card={card} labels={labels} />
        )}
      </Sheet>
    </>
  );
}

/**
 * The other half of adding a responsibility: once assigned, it can also be
 * taken off the matrix entirely, not just reassigned to "Nobody yet" (which
 * leaves a dead row nothing can replace — see `removeResponsibility`).
 */
function RemoveResponsibilityControl({
  householdId,
  outcomeKey,
  outcomeLabel,
  onRemoved,
  labels,
}: {
  householdId: string;
  outcomeKey: string;
  outcomeLabel: string;
  onRemoved: () => void;
  labels: ResponsibilityLabels;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(removeResponsibilityAction, {});
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current && !pending && !state.error) {
      setOpen(false);
      onRemoved();
    }
  }, [pending, state.error, onRemoved]);

  return (
    <>
      <Pill type="button" tone="quiet" onClick={() => setOpen(true)} className="text-[var(--wh-risk)]">
        <Trash2 aria-hidden className="size-3.5" /> {labels.remove}
      </Pill>

      <ConfirmationSheet
        open={open}
        onOpenChange={setOpen}
        title={withName(labels.removeTitle, outcomeLabel)}
        description={labels.removeLede}
        confirmLabel={labels.removeConfirm}
        destructive
        pending={pending}
        onConfirm={() => {
          submitted.current = true;
          const formData = new FormData();
          formData.set("householdId", householdId);
          formData.set("outcomeKey", outcomeKey);
          startTransition(() => formAction(formData));
        }}
      >
        {state.error ? <p className="text-sm text-[var(--wh-risk)]">{state.error}</p> : null}
      </ConfirmationSheet>
    </>
  );
}

function ReadOnlyDetail({ card, labels }: { card: Omit<ResponsibilityCardProps, "onExpand" | "icon" | "tone">; labels: ResponsibilityLabels }) {
  return (
    <dl className="space-y-3 text-sm">
      <div>
        <dt className="text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{labels.owner}</dt>
        <dd>{card.owner}</dd>
      </div>
      {card.backup ? (
        <div>
          <dt className="text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{labels.backup}</dt>
          <dd>{card.backup}</dd>
        </div>
      ) : null}
      {card.frequency ? (
        <div>
          <dt className="text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{labels.frequency}</dt>
          <dd>{card.frequency}</dd>
        </div>
      ) : null}
      <p className="text-xs text-[var(--wh-foreground-subtle)]">
        {labels.adminOnly}
      </p>
    </dl>
  );
}

/**
 * Accepting one suggested swap (story 03-008). A single tap: the swap is one
 * the household already half-made — the person taking it is its named
 * backup — and it can be swapped straight back from the row itself.
 */
/** The words for the group card's dropdown, in the viewer's language: each mode's heading and what it lets WonderHome do. */
export type GroupAutonomyLabels = {
  title: string;
  options: Record<AutonomyMode, { heading: string; how: string }>;
};

/**
 * A group label on Responsibilities: a thin card that starts collapsed. Opened,
 * it shows the dropdown of the four autonomy choices (admins only) above the
 * responsibilities under that label. Choosing one sets every responsibility in
 * the group to that choice.
 */
export function ResponsibilityGroup({
  title,
  count,
  outcomeKeys,
  currentMode,
  editable,
  householdId,
  labels,
  children,
}: {
  title: string;
  count: number;
  outcomeKeys: readonly string[];
  /** The mode every responsibility in the group shares, or null when they differ. */
  currentMode: AutonomyMode | null;
  editable: boolean;
  householdId: string;
  labels: GroupAutonomyLabels;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-4 text-left text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase transition-colors hover:bg-[var(--wh-surface-muted)]"
      >
        <span>
          {title} · {count}
        </span>
        <ChevronDown aria-hidden className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="space-y-2">
          {editable ? <GroupAutonomyChooser outcomeKeys={outcomeKeys} currentMode={currentMode} householdId={householdId} labels={labels} /> : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}

function GroupAutonomyChooser({
  outcomeKeys,
  currentMode,
  householdId,
  labels,
}: {
  outcomeKeys: readonly string[];
  currentMode: AutonomyMode | null;
  householdId: string;
  labels: GroupAutonomyLabels;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(setGroupAutonomyAction, {});

  return (
    <details className="group rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)]">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <span>{labels.title}</span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-[var(--wh-foreground-subtle)] transition-transform group-open:rotate-180" />
      </summary>
      <form action={formAction} className="divide-y divide-[var(--wh-border)] border-t border-[var(--wh-border)]">
        <input type="hidden" name="householdId" value={householdId} />
        <input type="hidden" name="outcomeKeys" value={outcomeKeys.join(",")} />
        {AUTONOMY_MODES.map((mode) => (
          <button
            key={mode}
            type="submit"
            name="aiMode"
            value={mode}
            disabled={pending}
            aria-pressed={currentMode === mode}
            className={cn(
              "block w-full px-4 py-3 text-left transition-colors hover:bg-[var(--wh-surface-muted)] disabled:opacity-60",
              currentMode === mode && "bg-[var(--wh-primary-soft)]/40",
            )}
          >
            <span className="block text-sm font-semibold">{labels.options[mode].heading}</span>
            <span className="block text-xs text-[var(--wh-foreground-muted)]">{labels.options[mode].how}</span>
          </button>
        ))}
      </form>
      {state.error ? <p className="px-4 pb-3 text-xs text-[var(--wh-attention)]" role="alert">{state.error}</p> : null}
      {state.notice && !state.error ? <p className="px-4 pb-3 text-xs text-[var(--wh-handled)]" role="status">{state.notice}</p> : null}
    </details>
  );
}

export function AcceptRebalanceButton({
  householdId,
  outcomeKey,
  fromMemberId,
  toMemberId,
  toName,
  labels,
}: {
  householdId: string;
  outcomeKey: string;
  fromMemberId: string;
  toMemberId: string;
  toName: string;
  labels: Pick<ResponsibilityLabels, "giveTo" | "swapping" | "swap">;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(acceptRebalanceAction, {});

  if (state.notice) return <p className="text-xs text-[var(--wh-handled)]" role="status">{state.notice}</p>;

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="outcomeKey" value={outcomeKey} />
      <input type="hidden" name="fromMemberId" value={fromMemberId} />
      <input type="hidden" name="toMemberId" value={toMemberId} />
      <Pill type="submit" tone="primary" disabled={pending} aria-label={withName(labels.giveTo, toName)}>
        {pending ? labels.swapping : labels.swap}
      </Pill>
      {state.error ? <p className="max-w-48 text-right text-xs text-[var(--wh-risk)]" role="alert">{state.error}</p> : null}
    </form>
  );
}
