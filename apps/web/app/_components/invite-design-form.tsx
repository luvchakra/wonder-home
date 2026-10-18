"use client";

import { Check, Eye } from "lucide-react";
import { useActionState, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { isInviteTemplate, type InviteTemplate } from "@wonderhome/core/family/invite-templates";
import { InvitationCard, type InvitationCardWords } from "@wonderhome/core/ui/invitation-card";
import { Pill } from "@wonderhome/core/ui/pill";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";

export type InviteDesignOption = {
  key: string;
  name: string;
  /** The design's corner drawing, as an image source. */
  image: string;
  paper: string;
  accent: string;
};

export type InviteDesignLabels = {
  design: string;
  message: string;
  messageHint: string;
  save: string;
  saving: string;
  saved: string;
  preview: string;
  previewTitle: string;
  previewLede: string;
};

/** What the preview needs: the event's own words, and each design's kind line. */
export type InvitePreview = {
  /** The design "auto" stands for. */
  suggested: InviteTemplate;
  words: Omit<InvitationCardWords, "kindLine" | "message">;
  kindLines: Record<InviteTemplate, string>;
};

/**
 * Pick how an event's invitation looks (story 26-009), and write the one line
 * guests see on it. The first choice follows the event — a "Diwali at ours"
 * gets lanterns without anyone choosing — and the others fix a design. A
 * picked design, never a typed one (rule 20); "Classic" is the design for
 * anything the others don't fit.
 */
export function InviteDesignForm({
  action,
  householdId,
  eventId,
  options,
  selected,
  message,
  labels,
  preview,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  householdId: string;
  eventId: string;
  /** "auto" first, then every design. */
  options: InviteDesignOption[];
  selected: string;
  message: string;
  labels: InviteDesignLabels;
  preview: InvitePreview;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const [choice, setChoice] = useState(selected);
  const [line, setLine] = useState(message);
  const [previewing, setPreviewing] = useState(false);
  // The preview shows what is picked and typed now, saved or not.
  const shown: InviteTemplate = isInviteTemplate(choice) ? choice : preview.suggested;
  const previewLine = line.trim() ? line.trim().slice(0, 300) : null;

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="eventId" value={eventId} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{labels.design}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {options.map((option) => {
            const on = option.key === choice;
            return (
              <label
                key={option.key}
                className={`relative flex min-h-11 cursor-pointer gap-2 rounded-[var(--wh-radius-sm)] border px-2 py-2 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--wh-primary)] ${
                  on ? "border-[var(--wh-primary)] bg-[var(--wh-primary-soft)]/40" : "border-[var(--wh-border)] bg-[var(--wh-surface)]"
                } ${option.key === "auto" ? "col-span-2 items-center sm:col-span-3" : "flex-col items-center text-center"}`}
              >
                <input type="radio" name="template" value={option.key} checked={on} onChange={() => setChoice(option.key)} className="sr-only" />
                <span aria-hidden className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-[var(--wh-radius-sm)] border" style={{ background: option.paper, borderColor: option.accent }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- an inline SVG drawing */}
                  <img src={option.image} alt="" className="size-8" />
                </span>
                <span className="min-w-0 flex-1 leading-tight [overflow-wrap:anywhere]">{option.name}</span>
                {on ? <Check aria-hidden className={`size-4 shrink-0 text-[var(--wh-primary)] ${option.key === "auto" ? "" : "absolute top-1.5 right-1.5"}`} /> : null}
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="space-y-1.5">
        <label htmlFor={`invite-message-${eventId}`} className="block text-sm font-medium">{labels.message}</label>
        <textarea
          id={`invite-message-${eventId}`}
          name="message"
          value={line}
          onChange={(event) => setLine(event.target.value)}
          maxLength={300}
          rows={2}
          aria-describedby={`invite-message-hint-${eventId}`}
          className="block w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 py-2 text-base"
        />
        <p id={`invite-message-hint-${eventId}`} className="text-xs text-[var(--wh-foreground-muted)]">{labels.messageHint}</p>
      </div>
      {state.error ? <Alert tone="risk">{state.error}</Alert> : null}
      {state.notice && !pending ? (
        <p role="status" className="flex items-center gap-1.5 text-xs text-[var(--wh-handled)]">
          <Check aria-hidden className="size-3.5" /> {labels.saved}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? labels.saving : labels.save}
        </Button>
        <Pill type="button" tone="soft" onClick={() => setPreviewing(true)}>
          <Eye aria-hidden className="size-3.5" /> {labels.preview}
        </Pill>
      </div>
      <Sheet open={previewing} onOpenChange={setPreviewing} title={labels.previewTitle} description={labels.previewLede}>
        <InvitationCard template={shown} words={{ ...preview.words, kindLine: preview.kindLines[shown], message: previewLine }} />
      </Sheet>
    </form>
  );
}
