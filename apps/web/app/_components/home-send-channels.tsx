"use client";

import { Check, Copy, Download, Mail } from "lucide-react";
import { useActionState, useState } from "react";

import type { HomeSendAddress } from "@wonderhome/core/homesend/items";
import { installInstructions, useInstallPrompt } from "@wonderhome/core/pwa/use-install-prompt";
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
}: {
  householdId: string;
  isAdmin: boolean;
  emailConfigured: boolean;
  address: HomeSendAddress | null;
}) {
  const install = useInstallPrompt();

  if (!emailConfigured && install.installed) return null;

  return (
    <section>
      <SectionHeader title="Other ways to send things in" />
      <div className="space-y-3">
        {emailConfigured ? (
          <EmailChannel householdId={householdId} isAdmin={isAdmin} address={address} />
        ) : null}
        {!install.installed ? <InstallChannel /> : null}
      </div>
    </section>
  );
}

function EmailChannel({
  householdId,
  isAdmin,
  address,
}: {
  householdId: string;
  isAdmin: boolean;
  address: HomeSendAddress | null;
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
          <p className="text-sm font-semibold">Forward it by email</p>
          <p className="mt-0.5 text-xs text-[var(--wh-foreground-muted)]">
            {address?.status === "active"
              ? "Anything forwarded here lands in your review queue."
              : address?.status === "revoked"
                ? "Turned off — forwarded mail no longer reaches this household."
                : isAdmin
                  ? "Get an address that forwards straight into HomeSend."
                  : "Ask an admin to set this up."}
          </p>
        </div>
      </div>

      {address?.status === "active" ? (
        <div className="flex items-center gap-2">
          <input readOnly value={address.address} className="min-w-0 flex-1 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface-muted)] px-3 py-2 text-sm" />
          <Pill type="button" tone="quiet" onClick={() => copyAddress(address.address)} aria-label="Copy the address">
            {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Pill>
        </div>
      ) : null}

      {isAdmin ? (
        <div className="flex flex-wrap gap-2">
          {!address || address.status === "revoked" ? (
            <form action={address ? rotateAction : createAction}>
              <input type="hidden" name="householdId" value={householdId} />
              <Pill type="submit" tone="primary" disabled={busy}>
                {busy ? "Working…" : address ? "Turn back on" : "Set up email forwarding"}
              </Pill>
            </form>
          ) : (
            <>
              <form action={rotateAction}>
                <input type="hidden" name="householdId" value={householdId} />
                <Pill type="submit" tone="quiet" disabled={busy}>
                  {rotating ? "Rotating…" : "Get a new address"}
                </Pill>
              </form>
              <form action={revokeAction}>
                <input type="hidden" name="householdId" value={householdId} />
                <Pill type="submit" tone="quiet" disabled={busy}>
                  {revoking ? "Turning off…" : "Turn off"}
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

function InstallChannel() {
  const install = useInstallPrompt();
  const [guide, setGuide] = useState(false);

  return (
    <>
      <Card className="flex items-center gap-3 p-4">
        <IconTile icon={Download} tone="primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Install WonderHome</p>
          <p className="mt-0.5 text-xs text-[var(--wh-foreground-muted)]">
            Installed, your phone&rsquo;s own share button can send a photo or message here directly.
          </p>
        </div>
        <Pill
          type="button"
          tone="quiet"
          onClick={() => {
            if (install.canPrompt) void install.prompt();
            else setGuide(true);
          }}
        >
          Install
        </Pill>
      </Card>

      <Sheet
        open={guide}
        onOpenChange={setGuide}
        title="Install WonderHome"
        description="Put it on your home screen and it opens like an app — full screen, no address bar."
      >
        <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--wh-foreground-muted)]">
          {installInstructions(install.platform).map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <Button type="button" className="mt-5 w-full" onClick={() => setGuide(false)}>
          Got it
        </Button>
      </Sheet>
    </>
  );
}
