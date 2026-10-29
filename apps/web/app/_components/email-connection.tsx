"use client";

import { Check, Copy, Mail, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";

import type { AllowlistEntry, StoredAllowlistEntry } from "@wonderhome/core/homesend/email-allowlist";
import type { HomeSendAddress } from "@wonderhome/core/homesend/items";
import { Alert } from "@wonderhome/core/ui/alert";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Badge, Pill } from "@wonderhome/core/ui/pill";
import { SectionHeader } from "@wonderhome/core/ui/section-header";

import {
  createHomeSendAddressAction,
  revokeHomeSendAddressAction,
  rotateHomeSendAddressAction,
  type HomeSendAddressState,
} from "../(auth)/homesend-address-actions";
import {
  addAllowlistSenderAction,
  removeAllowlistSenderAction,
  type AllowlistActionState,
} from "../(auth)/homesend-allowlist-actions";

export type EmailConnectionLabels = {
  address: {
    heading: string;
    explain: string;
    off: string;
    revoked: string;
    setUp: string;
    turnBackOn: string;
    newAddress: string;
    turnOff: string;
    working: string;
  };
  copy: string;
  copied: string;
  copyAria: string;
  allow: {
    heading: string;
    explain: string;
    empty: string;
    placeholder: string;
    add: string;
    adding: string;
    remove: string;
    removeAria: string;
    addressBadge: string;
    domainBadge: string;
  };
  rules: {
    heading: string;
    neverSignIn: string;
    onlyApproved: string;
    spoof: string;
    alwaysWait: string;
  };
  oauthNote: string;
};

/** How an entry reads back to a person (a domain shows its leading "@"). Kept here, pure, so this client file never imports the allowlist module's server side. */
function describeEntry(entry: AllowlistEntry): string {
  return entry.kind === "domain" ? `@${entry.value}` : entry.value;
}

/**
 * The Email connection on the Connections page (story 17-016): the
 * household's private forwarding address, and the one control that decides
 * what WonderHome ever reads — the approved-sender allowlist. Admin-only; the
 * server gates the section, and every action here is admin-only server-side
 * too. The copy is plain about the two things that keep it private: WonderHome
 * never signs in to the inbox, and it reads only approved senders.
 */
export function EmailConnection({
  householdId,
  household,
  address,
  entries,
  labels,
}: {
  householdId: string;
  household: string;
  address: HomeSendAddress | null;
  entries: StoredAllowlistEntry[];
  labels: EmailConnectionLabels;
}) {
  return (
    <div className="space-y-4">
      <AddressPanel householdId={householdId} household={household} address={address} labels={labels} />
      <AllowlistPanel householdId={householdId} entries={entries} labels={labels} />
      <RulesCard labels={labels} />
    </div>
  );
}

function AddressPanel({
  householdId,
  household,
  address,
  labels,
}: {
  householdId: string;
  household: string;
  address: HomeSendAddress | null;
  labels: EmailConnectionLabels;
}) {
  const [createState, createAction, creating] = useActionState<HomeSendAddressState, FormData>(createHomeSendAddressAction, {});
  const [rotateState, rotateAction, rotating] = useActionState<HomeSendAddressState, FormData>(rotateHomeSendAddressAction, {});
  const [revokeState, revokeAction, revoking] = useActionState<HomeSendAddressState, FormData>(revokeHomeSendAddressAction, {});
  const [copied, setCopied] = useState(false);
  const busy = creating || rotating || revoking;
  const error = createState.error ?? rotateState.error ?? revokeState.error;
  const active = address?.status === "active";

  async function copyAddress(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Still selectable from the read-only field.
    }
  }

  // The {household} placeholder is substituted here so the sentence reads warmly.
  const explain = labels.address.explain.replace("{household}", household);

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start gap-3">
        <IconTile icon={Mail} tone="primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{labels.address.heading}</p>
          <p className="mt-0.5 text-xs text-[var(--wh-foreground-muted)]">
            {active ? explain : address?.status === "revoked" ? labels.address.revoked : labels.address.off}
          </p>
        </div>
      </div>

      {active ? (
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={address!.address}
            dir="ltr"
            className="min-w-0 flex-1 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface-muted)] px-3 py-2 text-sm"
          />
          <Pill type="button" tone="quiet" onClick={() => copyAddress(address!.address)} aria-label={labels.copyAria}>
            {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
            {copied ? labels.copied : labels.copy}
          </Pill>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {!active ? (
          <form action={address ? rotateAction : createAction}>
            <input type="hidden" name="householdId" value={householdId} />
            <Pill type="submit" tone="primary" disabled={busy}>
              {busy ? labels.address.working : address ? labels.address.turnBackOn : labels.address.setUp}
            </Pill>
          </form>
        ) : (
          <>
            <form action={rotateAction}>
              <input type="hidden" name="householdId" value={householdId} />
              <Pill type="submit" tone="quiet" disabled={busy}>
                {rotating ? labels.address.working : labels.address.newAddress}
              </Pill>
            </form>
            <form action={revokeAction}>
              <input type="hidden" name="householdId" value={householdId} />
              <Pill type="submit" tone="quiet" disabled={busy}>
                {revoking ? labels.address.working : labels.address.turnOff}
              </Pill>
            </form>
          </>
        )}
      </div>

      {error ? <Alert>{error}</Alert> : null}
    </Card>
  );
}

function AllowlistPanel({
  householdId,
  entries,
  labels,
}: {
  householdId: string;
  entries: StoredAllowlistEntry[];
  labels: EmailConnectionLabels;
}) {
  const [addState, addAction, adding] = useActionState<AllowlistActionState, FormData>(addAllowlistSenderAction, {});
  const [removeState, removeAction] = useActionState<AllowlistActionState, FormData>(removeAllowlistSenderAction, {});
  const error = addState.error ?? removeState.error;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start gap-3">
        <IconTile icon={ShieldCheck} tone="primary" />
        <div className="min-w-0 flex-1">
          <SectionHeader title={labels.allow.heading} count={entries.length || undefined} />
          <p className="mt-0.5 text-xs text-[var(--wh-foreground-muted)]">{labels.allow.explain}</p>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] px-3 py-2.5 text-xs text-[var(--wh-foreground-muted)]">
          {labels.allow.empty}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--wh-border)]">
          {entries.map((entry) => {
            const shown = describeEntry(entry);
            return (
              <li key={entry.id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" dir="ltr">
                    {shown}
                  </p>
                </div>
                <Badge tone="neutral">{entry.kind === "domain" ? labels.allow.domainBadge : labels.allow.addressBadge}</Badge>
                <form action={removeAction}>
                  <input type="hidden" name="householdId" value={householdId} />
                  <input type="hidden" name="id" value={entry.id} />
                  <Pill type="submit" tone="quiet" aria-label={labels.allow.removeAria.replace("{sender}", shown)}>
                    <Trash2 aria-hidden className="size-3.5" />
                    {labels.allow.remove}
                  </Pill>
                </form>
              </li>
            );
          })}
        </ul>
      )}

      <form action={addAction} className="flex items-center gap-2">
        <input type="hidden" name="householdId" value={householdId} />
        <input
          name="sender"
          type="text"
          required
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          dir="ltr"
          placeholder={labels.allow.placeholder}
          className="min-w-0 flex-1 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 py-2 text-sm"
        />
        <Pill type="submit" tone="primary" disabled={adding}>
          <Plus aria-hidden className="size-3.5" />
          {adding ? labels.allow.adding : labels.allow.add}
        </Pill>
      </form>

      {error ? <Alert>{error}</Alert> : null}
    </Card>
  );
}

function RulesCard({ labels }: { labels: EmailConnectionLabels }) {
  return (
    <Card className="flex items-start gap-3 p-4">
      <IconTile icon={ShieldCheck} tone="primary" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">{labels.rules.heading}</p>
        <ul className="mt-1 list-disc space-y-1 ps-4 text-[var(--wh-foreground-muted)]">
          <li>{labels.rules.neverSignIn}</li>
          <li>{labels.rules.onlyApproved}</li>
          <li>{labels.rules.spoof}</li>
          <li>{labels.rules.alwaysWait}</li>
        </ul>
        <p className="mt-2 text-xs text-[var(--wh-foreground-subtle)]">{labels.oauthNote}</p>
      </div>
    </Card>
  );
}
