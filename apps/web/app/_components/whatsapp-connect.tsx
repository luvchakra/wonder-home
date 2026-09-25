"use client";

import { Check, CheckCircle2, Copy, MessageCircle, Unlink } from "lucide-react";
import { startTransition, useActionState, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button, ButtonLink } from "@wonderhome/core/ui/button";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Pill } from "@wonderhome/core/ui/pill";
import { ConfirmationSheet } from "@wonderhome/core/ui/sheet";

import {
  checkWhatsAppLinkAction,
  disconnectWhatsAppAction,
  startWhatsAppLinkAction,
  type WhatsAppConnectState,
} from "../(auth)/whatsapp-actions";

/**
 * Connecting your own WhatsApp (story 14-016, brief screens 1–4).
 *
 * Three steps, the brief's own: what WonderHome can take from WhatsApp, how
 * to send the one-time CONNECT message, and the confirmation. Nothing here
 * ever marks a number connected: only WhatsApp delivering the code from the
 * person's own phone does that, and "I've sent the message" just looks again.
 */

/** The connect card's words in the viewer's language, built on the server (story 22-004). */
export type WhatsAppConnectLabels = {
  whatYouCanSend: string[];
  number: string;
  copyAria: string;
  copyTitle: string;
  copied: string;
  connectToo: string;
  connectTitle: string;
  connectTooBody: string;
  connectBody: string;
  gettingCode: string;
  letsConnect: string;
  linkTitle: string;
  linkBody: string;
  step1: string;
  step2: string;
  step2Hint: string;
  step3: string;
  open: string;
  waiting: string;
  checking: string;
  sent: string;
  newCode: string;
  gettingNewCode: string;
};

/** The confirmation's words. `phone` carries a `{phone}` placeholder, filled in here. */
export type WhatsAppLinkedLabels = { title: string; phone: string; number: string; lines: string[]; goHomeSend: string };

/** Ending a link, in full sentences with the person's name already in them. */
export type WhatsAppDisconnectLabels = { aria: string; title: string; description: string; confirm: string; cancel: string };

function CopyNumber({ number, display, labels }: { number: string; display: string; labels: WhatsAppConnectLabels }) {
  const [copied, setCopied] = useState(false);
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The number is still readable and selectable beside the button.
    }
  }
  return (
    <Card className="flex items-center gap-3 p-4">
      <IconTile icon={MessageCircle} tone="handled" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{labels.number}</p>
        <p className="mt-0.5 text-base font-medium whitespace-nowrap tabular-nums select-all">
          {display}
        </p>
      </div>
      <Pill
        type="button"
        tone="quiet"
        onClick={copy}
        aria-label={labels.copyAria}
        title={labels.copyTitle}
      >
        {copied ? (
          <Check aria-hidden className="size-3.5" />
        ) : (
          <Copy aria-hidden className="size-3.5" />
        )}
      </Pill>
      <span className="sr-only" aria-live="polite">
        {copied ? labels.copied : ""}
      </span>
    </Card>
  );
}

export function WhatsAppConnect({
  householdId,
  businessNumber,
  businessNumberDisplay,
  someoneElseConnected,
  labels,
}: {
  householdId: string;
  businessNumber: string;
  businessNumberDisplay: string;
  /** Another adult already linked: the intro speaks to the second adult (screen 4). */
  someoneElseConnected: boolean;
  labels: WhatsAppConnectLabels;
}) {
  const [started, start, starting] = useActionState<
    WhatsAppConnectState,
    FormData
  >(startWhatsAppLinkAction, {});
  const [checked, check, checking] = useActionState<
    WhatsAppConnectState,
    FormData
  >(checkWhatsAppLinkAction, {});


  if (!started.code) {
    return (
      <Card className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <IconTile icon={MessageCircle} tone="handled" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">
              {someoneElseConnected ? labels.connectToo : labels.connectTitle}
            </h2>
            <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">
              {someoneElseConnected ? labels.connectTooBody : labels.connectBody}
            </p>
          </div>
        </div>
        <ul className="space-y-2 text-sm">
          {labels.whatYouCanSend.map((line) => (
            <li key={line} className="flex gap-2">
              <Check
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-[var(--wh-handled)]"
              />
              <span>{line}</span>
            </li>
          ))}
        </ul>
        {started.error ? <Alert>{started.error}</Alert> : null}
        <form action={start}>
          <input type="hidden" name="householdId" value={householdId} />
          <Button type="submit" className="w-full" disabled={starting}>
            {starting ? labels.gettingCode : labels.letsConnect}
          </Button>
        </form>
      </Card>
    );
  }

  const again = () => {
    const formData = new FormData();
    formData.set("householdId", householdId);
    startTransition(() => start(formData));
  };

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="text-base font-semibold">{labels.linkTitle}</h2>
        <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{labels.linkBody}</p>
      </div>
      <CopyNumber number={businessNumber} display={businessNumberDisplay} labels={labels} />
      <ol className="space-y-3 text-sm">
        <li className="flex gap-3">
          <span
            aria-hidden
            className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--wh-primary-soft)] text-xs font-semibold text-[var(--wh-primary)]"
          >
            1
          </span>
          <span>{labels.step1}</span>
        </li>
        <li className="flex gap-3">
          <span
            aria-hidden
            className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--wh-primary-soft)] text-xs font-semibold text-[var(--wh-primary)]"
          >
            2
          </span>
          <span>
            {labels.step2}
            <span className="mt-1 block rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] px-3 py-2 font-mono text-base tracking-wider break-all select-all">
              {started.message}
            </span>
            <span className="mt-1 block text-xs text-[var(--wh-foreground-muted)]">{labels.step2Hint}</span>
          </span>
        </li>
        <li className="flex gap-3">
          <span
            aria-hidden
            className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--wh-primary-soft)] text-xs font-semibold text-[var(--wh-primary)]"
          >
            3
          </span>
          <span>{labels.step3}</span>
        </li>
      </ol>
      {started.chatLink ? (
        <ButtonLink
          href={started.chatLink}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full"
        >
          <MessageCircle aria-hidden className="size-4" />
          {labels.open}
        </ButtonLink>
      ) : null}
      {checked.status === "waiting" ? (
        <Alert tone="attention">{labels.waiting}</Alert>
      ) : null}
      {checked.error ? <Alert>{checked.error}</Alert> : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <form action={check}>
          <input type="hidden" name="householdId" value={householdId} />
          <Button
            type="submit"
            variant="quiet"
            className="w-full sm:w-auto"
            disabled={checking}
          >
            {checking ? labels.checking : labels.sent}
          </Button>
        </form>
        <Button
          type="button"
          variant="quiet"
          onClick={again}
          disabled={starting}
        >
          {starting ? labels.gettingNewCode : labels.newCode}
        </Button>
      </div>
    </Card>
  );
}

/**
 * The confirmation after a link (brief screen 3). Shown once, from the
 * server's own record of the link — never from anything the browser said.
 */
export function WhatsAppLinkedNotice({ phone, labels }: { phone: string | null; labels: WhatsAppLinkedLabels }) {
    // The number keeps its own emphasis wherever the sentence puts it.
    const [before, after] = labels.phone.split("{phone}");
    return (
      <Card className="space-y-4 p-5 text-center">
        <div role="status" className="space-y-4">
          <CheckCircle2
            aria-hidden
            className="mx-auto size-12 text-[var(--wh-handled)]"
          />
          <div>
            <h2 className="text-lg font-semibold">{labels.title}</h2>
            <p className="mt-1 text-sm text-[var(--wh-foreground-muted)]">
              {phone ? (
                <>
                  {before}
                  <span className="font-medium tabular-nums text-[var(--wh-foreground)]">
                    {phone}
                  </span>
                  {after}
                </>
              ) : (
                labels.number
              )}
            </p>
          </div>
        </div>
        <ul className="space-y-2 text-left text-sm">
          {labels.lines.map((line) => (
            <li key={line} className="flex gap-2">
              <Check
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-[var(--wh-handled)]"
              />
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <ButtonLink href="/home-send" className="w-full">
          {labels.goHomeSend}
        </ButtonLink>
      </Card>
    );
}

/** Ending a link — your own, or anyone's in the household for an admin. */
export function WhatsAppDisconnect({
  householdId,
  identityId,
  labels,
}: {
  householdId: string;
  identityId: string;
  labels: WhatsAppDisconnectLabels;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<
    { error?: string; done?: boolean },
    FormData
  >(disconnectWhatsAppAction, {});
  const disconnect = () => {
    const formData = new FormData();
    formData.set("householdId", householdId);
    formData.set("identityId", identityId);
    startTransition(() => action(formData));
    setOpen(false);
  };
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={labels.aria}
        className="grid size-11 shrink-0 place-items-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)] hover:text-[var(--wh-risk)]"
      >
        <Unlink className="size-5" aria-hidden />
      </button>
      <ConfirmationSheet
        open={open}
        onOpenChange={setOpen}
        title={labels.title}
        description={labels.description}
        confirmLabel={labels.confirm}
        cancelLabel={labels.cancel}
        destructive
        pending={pending}
        onConfirm={disconnect}
      />
      {state.error ? (
        <span className="sr-only" role="alert">
          {state.error}
        </span>
      ) : null}
      {state.error ? (
        <p className="text-xs text-[var(--wh-risk)]">{state.error}</p>
      ) : null}
    </>
  );
}
