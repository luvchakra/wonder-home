"use client";

import { Check, ChevronRight, Copy, Download, Mail, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import type { HomeSendAddress } from "@wonderhome/core/homesend/items";
import { useInstallPrompt } from "@wonderhome/core/pwa/use-install-prompt";
import { Alert } from "@wonderhome/core/ui/alert";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Pill } from "@wonderhome/core/ui/pill";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { Sheet } from "@wonderhome/core/ui/sheet";
import { Button } from "@wonderhome/core/ui/button";

import {
  createHomeSendAddressAction,
  revokeHomeSendAddressAction,
  rotateHomeSendAddressAction,
  type HomeSendAddressState,
} from "../(auth)/homesend-address-actions";
import type { HomeSendPageLabels } from "../_lib/homesend-labels";

type ChannelLabels = HomeSendPageLabels["channels"];

/**
 * Other ways to send things in (Phase 5): forward email to the household's
 * own HomeSend address, or install the app so the phone's own share sheet
 * reaches HomeSend directly. Both are setup, done once and rarely touched
 * again — so this sits below the primary drop zone and the review queue,
 * not competing with them (CLAUDE.md rule 17).
 */
export function HomeSendChannels({
  householdId,
  isAdmin,
  emailConfigured,
  address,
  whatsapp = null,
  labels,
}: {
  /** The section's words in the viewer's language (`homesendPageLabels`). */
  labels: ChannelLabels;
  householdId: string;
  isAdmin: boolean;
  emailConfigured: boolean;
  address: HomeSendAddress | null;
  /** WonderHome's WhatsApp number, and whether this adult has linked theirs — null when WhatsApp isn't available to them. */
  whatsapp?: { number: string; connected: boolean } | null;
}) {
  const install = useInstallPrompt();

  if (!emailConfigured && !whatsapp && install.installed) return null;

  return (
    <section>
      <SectionHeader title={labels.title} />
      <div className="space-y-3">
        {whatsapp ? <WhatsAppChannel number={whatsapp.number} connected={whatsapp.connected} labels={labels} /> : null}
        {emailConfigured ? (
          <EmailChannel householdId={householdId} isAdmin={isAdmin} address={address} labels={labels} />
        ) : null}
        {!install.installed ? <InstallChannel labels={labels} /> : null}
      </div>
    </section>
  );
}

/**
 * WhatsApp (story 14-016): the whole row opens its settings, where a number
 * is connected or managed — connecting needs the one-time code, so it never
 * happens from here.
 */
function WhatsAppChannel({ number, connected, labels }: { number: string; connected: boolean; labels: ChannelLabels }) {
  // The number keeps its own figures, set apart from the words around it.
  const [before, after = ""] = labels.whatsappConnected.split("{number}");
  return (
    <Link href="/settings/whatsapp" className="block rounded-[var(--wh-radius)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]">
      <Card className="flex items-center gap-3 p-4 transition-colors hover:bg-[var(--wh-surface-muted)]">
        <IconTile icon={MessageCircle} tone="handled" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{labels.whatsappTitle}</p>
          <p className="mt-0.5 text-xs text-[var(--wh-foreground-muted)]">
            {connected ? (
              <>
                {before}
                <span className="tabular-nums" dir="ltr">
                  {number}
                </span>
                {after}
              </>
            ) : (
              labels.whatsappConnect
            )}
          </p>
        </div>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-[var(--wh-foreground-subtle)]" />
      </Card>
    </Link>
  );
}

function EmailChannel({
  householdId,
  isAdmin,
  address,
  labels,
}: {
  householdId: string;
  isAdmin: boolean;
  address: HomeSendAddress | null;
  labels: ChannelLabels;
}) {
  const [createState, createAction, creating] = useActionState<HomeSendAddressState, FormData>(createHomeSendAddressAction, {});
  const [rotateState, rotateAction, rotating] = useActionState<HomeSendAddressState, FormData>(rotateHomeSendAddressAction, {});
  const [revokeState, revokeAction, revoking] = useActionState<HomeSendAddressState, FormData>(revokeHomeSendAddressAction, {});
  const [copied, setCopied] = useState(false);
  const busy = creating || rotating || revoking;
  const error = createState.error ?? rotateState.error ?? revokeState.error;

  async function copyAddress(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The address is still selectable straight from the read-only field.
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start gap-3">
        <IconTile icon={Mail} tone="primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{labels.emailTitle}</p>
          <p className="mt-0.5 text-xs text-[var(--wh-foreground-muted)]">
            {address?.status === "active"
              ? labels.emailActive
              : address?.status === "revoked"
                ? labels.emailRevoked
                : isAdmin
                  ? labels.emailAdmin
                  : labels.emailAskAdmin}
          </p>
        </div>
      </div>

      {address?.status === "active" ? (
        <div className="flex items-center gap-2">
          <input readOnly value={address.address} className="min-w-0 flex-1 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface-muted)] px-3 py-2 text-sm" />
          <Pill type="button" tone="quiet" onClick={() => copyAddress(address.address)} aria-label={labels.copyAria}>
            {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
            {copied ? labels.copied : labels.copy}
          </Pill>
        </div>
      ) : null}

      {isAdmin ? (
        <div className="flex flex-wrap gap-2">
          {!address || address.status === "revoked" ? (
            <form action={address ? rotateAction : createAction}>
              <input type="hidden" name="householdId" value={householdId} />
              <Pill type="submit" tone="primary" disabled={busy}>
                {busy ? labels.working : address ? labels.turnBackOn : labels.setUp}
              </Pill>
            </form>
          ) : (
            <>
              <form action={rotateAction}>
                <input type="hidden" name="householdId" value={householdId} />
                <Pill type="submit" tone="quiet" disabled={busy}>
                  {rotating ? labels.rotating : labels.newAddress}
                </Pill>
              </form>
              <form action={revokeAction}>
                <input type="hidden" name="householdId" value={householdId} />
                <Pill type="submit" tone="quiet" disabled={busy}>
                  {revoking ? labels.turningOff : labels.turnOff}
                </Pill>
              </form>
            </>
          )}
        </div>
      ) : null}

      {error ? <Alert>{error}</Alert> : null}
    </Card>
  );
}

function InstallChannel({ labels }: { labels: ChannelLabels }) {
  const install = useInstallPrompt();
  const [guide, setGuide] = useState(false);

  return (
    <>
      <Card className="flex items-center gap-3 p-4">
        <IconTile icon={Download} tone="primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{labels.installTitle}</p>
          <p className="mt-0.5 text-xs text-[var(--wh-foreground-muted)]">{labels.installBody}</p>
        </div>
        <Pill
          type="button"
          tone="quiet"
          onClick={() => {
            if (install.canPrompt) void install.prompt();
            else setGuide(true);
          }}
        >
          {labels.install}
        </Pill>
      </Card>

      <Sheet
        open={guide}
        onOpenChange={setGuide}
        title={labels.installTitle}
        description={labels.installDescription}
      >
        <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--wh-foreground-muted)]">
          {(labels.installSteps[install.platform] ?? labels.installSteps.unknown).map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <Button type="button" className="mt-5 w-full" onClick={() => setGuide(false)}>
          {labels.gotIt}
        </Button>
      </Sheet>
    </>
  );
}
