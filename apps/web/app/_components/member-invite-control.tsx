"use client";

import { Check, Copy, Mail, Share2, UserPlus } from "lucide-react";
import { useState, useTransition } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Pill } from "@wonderhome/core/ui/pill";
import { Sheet } from "@wonderhome/core/ui/sheet";

import { inviteMemberToSignInAction } from "../(auth)/household-actions";

export type MemberInviteLabels = {
  button: string;
  buttonLabel: string;
  title: string;
  lede: string;
  /** What signing in with their recorded email does, or how to add one. */
  hint: string;
  create: string;
  creating: string;
  ready: string;
  newLinkNote: string;
  sendEmail: string;
  share: string;
  copy: string;
  copied: string;
  failed: string;
  subject: string;
  /** The message before the link, in the inviter's language. */
  message: string;
};

/**
 * Invite a family member to sign in as themselves (Family member detail,
 * Admins only, for someone without an account yet).
 *
 * The link is made on request rather than when the sheet opens, because a
 * new link stops the earlier one and an Admin only looking should not undo a
 * link already sent. Then three ways to pass it on: the Admin's own email app
 * (WonderHome has no mail provider, so it never claims to send anything), the
 * phone's share sheet — WhatsApp and the rest — where the browser has one, and
 * a copy.
 */
export function MemberInviteControl({
  householdId,
  memberId,
  email,
  labels,
}: {
  householdId: string;
  memberId: string;
  email: string | null;
  labels: MemberInviteLabels;
}) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const create = () => {
    setFailed(false);
    startTransition(async () => {
      const result = await inviteMemberToSignInAction(householdId, memberId);
      if ("path" in result) setLink(`${window.location.origin}${result.path}`);
      else setFailed(true);
    });
  };

  const text = link ? `${labels.message}\n${link}` : "";
  const mailto = link ? `mailto:${email ? encodeURIComponent(email) : ""}?subject=${encodeURIComponent(labels.subject)}&body=${encodeURIComponent(text)}` : "#";

  return (
    <>
      <Pill type="button" tone="primary" onClick={() => setOpen(true)} aria-label={labels.buttonLabel}>
        <UserPlus aria-hidden className="size-3.5" /> {labels.button}
      </Pill>
      <Sheet open={open} onOpenChange={setOpen} title={labels.title} description={labels.lede}>
        <div className="space-y-4">
          <p className="text-sm text-[var(--wh-foreground-muted)]">{labels.hint}</p>
          {failed ? <Alert>{labels.failed}</Alert> : null}
          {link ? (
            <div className="space-y-3">
              <p className="text-sm font-medium" role="status">
                {labels.ready}
              </p>
              <p className="rounded-[var(--wh-radius-xs)] bg-[var(--wh-surface-muted)] px-3 py-2 text-xs break-all">{link}</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <a
                  href={mailto}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--wh-radius-sm)] bg-[var(--wh-primary)] px-4 text-sm font-medium text-[var(--wh-primary-foreground)] hover:bg-[var(--wh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]"
                >
                  <Mail aria-hidden className="size-4" /> {labels.sendEmail}
                </a>
                {canShare ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      navigator.share({ title: labels.subject, text: labels.message, url: link }).catch(() => undefined);
                    }}
                  >
                    <Share2 aria-hidden className="size-4" /> {labels.share}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    navigator.clipboard
                      ?.writeText(link)
                      .then(() => setCopied(true))
                      .catch(() => undefined);
                  }}
                >
                  {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />} {copied ? labels.copied : labels.copy}
                </Button>
              </div>
              <p className="text-xs text-[var(--wh-foreground-subtle)]">{labels.newLinkNote}</p>
            </div>
          ) : (
            <Button type="button" className="w-full" onClick={create} disabled={pending}>
              {pending ? labels.creating : labels.create}
            </Button>
          )}
        </div>
      </Sheet>
    </>
  );
}
