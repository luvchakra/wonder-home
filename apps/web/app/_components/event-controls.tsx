"use client";

import { Check, Contact, Copy, ImageIcon, Pencil, Share2 } from "lucide-react";
import { startTransition, type ReactNode, useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { ChoiceChips } from "@wonderhome/core/ui/choice-chips";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import { updateEventAction } from "../(auth)/event-actions";
import type { EventActionState } from "../(auth)/family-actions";
import type { EventKind } from "../_lib/event-kinds";
import { Select } from "@wonderhome/core/ui/select";
import { EventPlaceField, type EventCalendarLabels } from "./new-event-form";
import type { PlaceSearchLabels } from "./place-search-field";

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
  /** Google Maps for "Where", when this person may search; null types the place. */
  place: PlaceSearchLabels | null;
  notes: string;
  notesPlaceholder: string;
  save: string;
  saving: string;
  /** The calendar fields (story 12-009), as the add sheet words them. */
  calendar: EventCalendarLabels;
  clash: string;
  saveAnyway: string;
};

export type EventEditInitial = {
  title: string;
  kind: EventKind;
  startsAt: string;
  endsAt: string;
  location: string;
  /** The picked place's Google Maps id and address, so the sheet opens on it; null for a typed place. */
  locationPlaceId: string | null;
  locationAddress: string | null;
  notes: string;
  allDay: boolean;
  startDate: string;
  endDate: string;
  category: string;
  repeat: string;
  repeatUntil: string;
  visibility: string;
};

/**
 * Changing an event's details, in a sheet; also opened from a "Still to plan"
 * row with that row's own words. The same calendar fields as adding one; who
 * can see it is offered only to the event's owner, the only person RLS lets
 * narrow it. Moving it checks for clashes first, like adding does.
 */
export function EventEditForm({
  householdId,
  eventId,
  initial,
  labels,
  trigger,
  canNarrow = false,
}: {
  householdId: string;
  eventId: string;
  initial: EventEditInitial;
  labels: EventEditLabels;
  /** The opening button's words, when it is not "Edit details". */
  trigger?: string;
  /** Whether this person owns the event, and so may change who can see it. */
  canNarrow?: boolean;
}) {
  const words = labels.calendar;
  const [open, setOpen] = useState(false);
  const [allDay, setAllDay] = useState(initial.allDay);
  const [state, formAction, pending] = useActionState<EventActionState, FormData>(updateEventAction, {});
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending && !state.error && !state.clashes?.length) setOpen(false);
    wasPending.current = pending;
  }, [pending, state]);
  const [editedAfter, setEditedAfter] = useState<EventActionState | null>(null);
  const clashes = editedAfter === state ? [] : (state.clashes ?? []);

  return (
    <>
      <Pill type="button" tone={trigger ? "soft" : "quiet"} onClick={() => setOpen(true)}>
        {trigger ? null : <Pencil aria-hidden className="size-3.5" />} {trigger ?? labels.edit}
      </Pill>
      <Sheet open={open} onOpenChange={setOpen} title={labels.title}>
        <form
          onSubmit={(event) => {
            // Submitted by hand rather than as a form action, so a question
            // back (a clash, something already on the calendar) keeps what was
            // typed and "Add anyway" sends it again, instead of a reset form.
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            startTransition(() => formAction(data));
          }}
          onChange={() => setEditedAfter(state)}
          className="space-y-4"
        >
          {state.error ? <Alert>{state.error}</Alert> : null}
          {clashes.length > 0 ? (
            <Alert>
              <span className="block font-medium">{labels.clash}</span>
              <ul className="mt-1 list-disc ps-5">
                {clashes.map((clash) => (
                  <li key={clash}>{clash}</li>
                ))}
              </ul>
              <input type="hidden" name="confirmClash" value="on" />
            </Alert>
          ) : null}
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="eventId" value={eventId} />
          <Field label={labels.what} name="title" required defaultValue={initial.title} autoComplete="off" />
          <Select label={labels.kind} name="kind" defaultValue={initial.kind}>
            {(Object.keys(labels.kinds) as EventKind[]).map((kind) => (
              <option key={kind} value={kind}>{labels.kinds[kind]}</option>
            ))}
          </Select>
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
            <input type="checkbox" name="allDay" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} className="size-4 accent-[var(--wh-primary)]" />
            {words.allDay}
          </label>
          {allDay ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={words.date} name="startDate" type="date" required defaultValue={initial.startDate} />
              <Field label={words.endDate} name="endDate" type="date" defaultValue={initial.endDate} />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={labels.starts} name="startsAt" type="datetime-local" required defaultValue={initial.startsAt} />
              <Field label={labels.ends} name="endsAt" type="datetime-local" required defaultValue={initial.endsAt} />
            </div>
          )}
          <Select label={words.category} name="category" defaultValue={initial.category}>
            <option value="">{words.categoryFromKind}</option>
            {words.categories.map((category) => (
              <option key={category.value} value={category.value}>{category.label}</option>
            ))}
          </Select>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select label={words.repeat} name="repeat" defaultValue={initial.repeat}>
              {words.repeats.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
            <Field label={words.repeatUntil} name="repeatUntil" type="date" defaultValue={initial.repeatUntil} />
          </div>
          {canNarrow ? (
            <div className="space-y-1">
              <ChoiceChips legend={words.visibility} name="visibility" options={words.visibilities} defaultValue={initial.visibility} />
              <p className="text-xs text-[var(--wh-foreground-muted)]">{words.visibilityHint}</p>
            </div>
          ) : null}
          <EventPlaceField
            householdId={householdId}
            label={labels.where}
            placeholder={labels.wherePlaceholder}
            search={labels.place}
            initial={initial.location ? { text: initial.location, placeId: initial.locationPlaceId, detail: initial.locationAddress } : null}
          />
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
            {pending ? labels.saving : clashes.length > 0 ? labels.saveAnyway : labels.save}
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

/** The Contact Picker API (Android Chrome): one contact's name, chosen by the person, never the address book. */
type ContactPicker = { select: (properties: ["name"], options: { multiple: false }) => Promise<{ name?: string[] }[]> };
function contactPicker(): ContactPicker | null {
  const contacts = (navigator as Navigator & { contacts?: ContactPicker }).contacts;
  return contacts && typeof contacts.select === "function" ? contacts : null;
}

/** The live link: shown in full, copied in one tap, or handed to the phone's own share sheet. */
export function EventLinkShare({
  path,
  title,
  labels,
}: {
  path: string;
  title: string;
  labels: {
    copy: string;
    copied: string;
    share: string;
    shareText: string;
    shareTextFor: string;
    shareCard: string;
    saveCard: string;
    forLabel: string;
    forHint: string;
    pickContact: string;
  };
}) {
  // The origin, the share sheet and the contact picker exist only in the browser; the server renders the bare path.
  const origin = useSyncExternalStore(noSubscription, () => window.location.origin, () => "");
  const canShare = useSyncExternalStore(noSubscription, () => typeof navigator.share === "function", () => false);
  const canPickContact = useSyncExternalStore(noSubscription, () => contactPicker() !== null, () => false);
  // A phone's share sheet never tells the page who was picked, so the guest's
  // name is chosen here, before sharing, and travels in the link (`?to=`): the
  // invitation opens with "Your name" already filled in, and they can change it.
  const [guest, setGuest] = useState("");
  const name = guest.trim().replace(/\s+/g, " ").slice(0, 80);
  const url = `${origin}${path}${name ? `?to=${encodeURIComponent(name)}` : ""}`;
  const [copied, setCopied] = useState(false);
  const [sharingCard, setSharingCard] = useState(false);
  const text = (name ? labels.shareTextFor.replace("{name}", name) : labels.shareText).replace("{title}", title);

  const pickContact = async () => {
    const picker = contactPicker();
    if (!picker) return;
    try {
      const [contact] = await picker.select(["name"], { multiple: false });
      const picked = contact?.name?.find((value) => value.trim());
      if (picked) setGuest(picked.trim());
    } catch {
      // Closed without choosing: the field keeps what it had.
    }
  };

  // The invitation itself, as a tall picture with the link beside it: a chat
  // app shows it whole, the way a printed card is passed round. Where a
  // device cannot share a picture, the picture opens to save instead.
  const shareCard = async () => {
    setSharingCard(true);
    try {
      const response = await fetch(`${path}/card`);
      const blob = await response.blob();
      const file = new File([blob], "invitation.png", { type: "image/png" });
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: text, text: `${text}\n${url}` }).catch(() => undefined);
      } else {
        window.open(`${path}/card`, "_blank", "noopener");
      }
    } catch {
      window.open(`${path}/card`, "_blank", "noopener");
    } finally {
      setSharingCard(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Field
            label={labels.forLabel}
            name="invite_for"
            value={guest}
            onChange={(event) => setGuest(event.target.value)}
            maxLength={80}
            autoComplete="off"
            aria-describedby="invite_for-hint"
          />
        </div>
        {canPickContact ? (
          <Pill type="button" tone="soft" aria-label={labels.pickContact} title={labels.pickContact} onClick={() => void pickContact()} className="min-h-11 px-3">
            <Contact aria-hidden className="size-4" />
          </Pill>
        ) : null}
      </div>
      <p id="invite_for-hint" className="text-xs text-[var(--wh-foreground-subtle)]">{labels.forHint}</p>
      <p className="rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface-muted)] px-3 py-2 font-mono text-xs break-all">{url}</p>
      <div className="flex flex-wrap gap-2">
        <Pill type="button" tone="primary" disabled={sharingCard} onClick={() => void shareCard()}>
          <ImageIcon aria-hidden className="size-3.5" /> {canShare ? labels.shareCard : labels.saveCard}
        </Pill>
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
          <Pill type="button" tone="soft" onClick={() => void navigator.share({ title: text, url }).catch(() => undefined)}>
            <Share2 aria-hidden className="size-3.5" /> {labels.share}
          </Pill>
        ) : null}
      </div>
    </div>
  );
}
