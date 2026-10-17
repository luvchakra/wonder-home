"use client";

import { Check, Copy, Pencil, Share2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { ChoiceChips } from "@wonderhome/core/ui/choice-chips";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import { updateEventAction } from "../(auth)/event-actions";
import type { EventKind } from "../_lib/event-kinds";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * A one-button form for an event action (cancel, answer, make a link, …):
 * the hidden fields it carries, its button, and the reason when it fails.
 */
export function EventActionButton({
  action,
  fields,
  children,
  tone = "quiet",
  pressed,
  label,
  className,
}: {
  action: Action;
  fields: Record<string, string>;
  children: ReactNode;
  tone?: "primary" | "soft" | "quiet";
  /** For a choice among several (yes, no, maybe): which one is the current answer. */
  pressed?: boolean;
  /** An accessible name, when the button shows only an icon. */
  label?: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  return (
    <form action={formAction} className="inline-flex flex-col gap-1">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Pill type="submit" tone={tone} disabled={pending} aria-pressed={pressed} aria-label={label} title={label} className={className}>
        {children}
      </Pill>
      {state.error ? <span role="alert" className="text-xs text-[var(--wh-risk)]">{state.error}</span> : null}
    </form>
  );
}

export type EventEditLabels = {
  edit: string;
  title: string;
  what: string;
  kind: string;
  kinds: Record<EventKind, string>;
  starts: string;
  ends: string;
  where: string;
  wherePlaceholder: string;
  notes: string;
  notesPlaceholder: string;
  save: string;
  saving: string;
};

/** Changing an event's details, in a sheet; also opened from a "Still to plan" row with that row's own words. */
export function EventEditForm({
  householdId,
  eventId,
  initial,
  labels,
  trigger,
}: {
  householdId: string;
  eventId: string;
  initial: { title: string; kind: EventKind; startsAt: string; endsAt: string; location: string; notes: string };
  labels: EventEditLabels;
  /** The opening button's words, when it is not "Edit details". */
  trigger?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateEventAction, {});
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending && !state.error) setOpen(false);
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <>
      <Pill type="button" tone={trigger ? "soft" : "quiet"} onClick={() => setOpen(true)}>
        {trigger ? null : <Pencil aria-hidden className="size-3.5" />} {trigger ?? labels.edit}
      </Pill>
      <Sheet open={open} onOpenChange={setOpen} title={labels.title}>
        <form action={formAction} className="space-y-4">
          {state.error ? <Alert>{state.error}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="eventId" value={eventId} />
          <Field label={labels.what} name="title" required defaultValue={initial.title} autoComplete="off" />
          <div className="space-y-1.5">
            <label htmlFor="event-kind" className="block text-sm font-medium">{labels.kind}</label>
            <select
              id="event-kind"
              name="kind"
              defaultValue={initial.kind}
              className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
            >
              {(Object.keys(labels.kinds) as EventKind[]).map((kind) => (
                <option key={kind} value={kind}>{labels.kinds[kind]}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={labels.starts} name="startsAt" type="datetime-local" required defaultValue={initial.startsAt} />
            <Field label={labels.ends} name="endsAt" type="datetime-local" required defaultValue={initial.endsAt} />
          </div>
          <Field label={labels.where} name="location" defaultValue={initial.location} placeholder={labels.wherePlaceholder} autoComplete="off" />
          <div className="space-y-1.5">
            <label htmlFor="event-notes" className="block text-sm font-medium">{labels.notes}</label>
            <textarea
              id="event-notes"
              name="notes"
              defaultValue={initial.notes}
              maxLength={1000}
              rows={3}
              placeholder={labels.notesPlaceholder}
              className="block w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 py-2 text-base"
            />
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? labels.saving : labels.save}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

/** Who in the household is asked: everyone as a checkbox chip, saved together. */
export function EventInviteesForm({
  action,
  householdId,
  eventId,
  members,
  selected,
  labels,
}: {
  action: Action;
  householdId: string;
  eventId: string;
  members: { id: string; name: string }[];
  selected: string[];
  labels: { choose: string; save: string; saving: string };
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="eventId" value={eventId} />
      <ChoiceChips legend={labels.choose} name="memberIds" type="checkbox" options={members.map((member) => ({ value: member.id, label: member.name }))} defaultValue={selected} />
      {state.error ? <Alert>{state.error}</Alert> : null}
      <Button type="submit" variant="secondary" disabled={pending} className="w-full sm:w-auto">
        {pending ? labels.saving : labels.save}
      </Button>
    </form>
  );
}

const noSubscription = () => () => undefined;

/** The live link: shown in full, copied in one tap, or handed to the phone's own share sheet. */
export function EventLinkShare({ path, title, labels }: { path: string; title: string; labels: { copy: string; copied: string; share: string; shareText: string } }) {
  // The origin and the share sheet exist only in the browser; the server renders the bare path.
  const origin = useSyncExternalStore(noSubscription, () => window.location.origin, () => "");
  const canShare = useSyncExternalStore(noSubscription, () => typeof navigator.share === "function", () => false);
  const url = `${origin}${path}`;
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-2">
      <p className="rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface-muted)] px-3 py-2 font-mono text-xs break-all">{url}</p>
      <div className="flex flex-wrap gap-2">
        <Pill
          type="button"
          tone="soft"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />} {copied ? labels.copied : labels.copy}
        </Pill>
        {canShare ? (
          <Pill type="button" tone="soft" onClick={() => void navigator.share({ title: labels.shareText.replace("{title}", title), url }).catch(() => undefined)}>
            <Share2 aria-hidden className="size-3.5" /> {labels.share}
          </Pill>
        ) : null}
      </div>
    </div>
  );
}
