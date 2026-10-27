"use client";

import { AlertTriangle, CheckCircle2, ExternalLink, FileText, GraduationCap, Pencil, Plug, PlugZap, Radio, RefreshCw, Send } from "lucide-react";
import { useActionState, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Badge, PillLink } from "@wonderhome/core/ui/pill";
import { Button } from "@wonderhome/core/ui/button";
import { Card } from "@wonderhome/core/ui/card";
import { Field } from "@wonderhome/core/ui/field";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Select } from "@wonderhome/core/ui/select";

import {
  addPortalScrapeUrlAction,
  connectSchoolPortalAction,
  connectSchoolPortalWithCredentialsAction,
  disconnectSchoolPortalAction,
  fetchSchoolPortalNowAction,
  removePortalScrapeUrlAction,
  setPortalScrapeUrlEnabledAction,
  setSchoolChannelActiveAction,
  testSchoolPortalConnectionAction,
  trackSchoolChannelAction,
  updateSchoolPortalCredentialsAction,
} from "../(auth)/school-actions";
import type { ActionState } from "../(auth)/actions";
import type { SchoolConnectLabels } from "../_lib/school-connect-labels";

export type ChannelView = { id: string; url: string; childName: string | null; active: boolean };
export type ScrapeUrlView = { id: string; url: string; kind: string; childName: string | null; enabled: boolean };

export type PortalView = {
  id: string;
  label: string;
  blurb: string;
  /** How the portal is connected: a sign-in ("credentials") or just a registered integration. */
  auth: "manual" | "credentials" | "oauth";
  connected: boolean;
  /** For a credentials portal: the username it is signed in as, or null when not. */
  connectedAs: string | null;
  /** For a credentials portal: the stored portal URL (never the password), to prefill the edit form. */
  connectedUrl: string | null;
  /** The worker's connection state: connected / reconnect_needed / never — or null if no session yet. */
  connectionState: "connected" | "reconnect_needed" | "never" | null;
  /** Whether a live data fetch exists for this provider yet. */
  adapterReady: boolean;
  integrationId: string | null;
  statusLabel: string | null;
  hasChannels: boolean;
  channelExample: string | null;
  portalUrl: string | null;
  channels: ChannelView[];
  /** Post-auth pages the worker reads for this connection. */
  scrapeUrls: ScrapeUrlView[];
};

export type ChildOption = { id: string; name: string };

const EMPTY: ActionState = {};

function Notice({ state }: { state: ActionState }) {
  if (state.error) return <Alert tone="attention" className="mt-2">{state.error}</Alert>;
  if (state.notice) return <Alert tone="info" className="mt-2">{state.notice}</Alert>;
  return null;
}

function ChannelRow({ householdId, channel, labels }: { householdId: string; channel: ChannelView; labels: SchoolConnectLabels }) {
  const [state, action, pending] = useActionState(setSchoolChannelActiveAction, EMPTY);
  return (
    <li className="flex items-center gap-2 py-2">
      <IconTile icon={Radio} tone={channel.active ? "school" : "neutral"} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{channel.url.replace(/^https?:\/\//, "")}</p>
        <p className="text-xs text-[var(--wh-foreground-muted)]">
          {channel.childName ?? labels.channelAnyChild}
          {channel.active ? "" : ` · ${labels.channelStoppedBadge}`}
        </p>
        <Notice state={state} />
      </div>
      <form action={action}>
        <input type="hidden" name="householdId" value={householdId} />
        <input type="hidden" name="id" value={channel.id} />
        <input type="hidden" name="active" value={channel.active ? "false" : "true"} />
        <Button type="submit" variant="quiet" disabled={pending} className="px-3">
          {channel.active ? labels.channelStop : labels.channelResume}
        </Button>
      </form>
    </li>
  );
}

function TrackChannelForm({
  householdId,
  portal,
  childOptions,
  labels,
}: {
  householdId: string;
  portal: PortalView;
  childOptions: ChildOption[];
  labels: SchoolConnectLabels;
}) {
  const [state, action, pending] = useActionState(trackSchoolChannelAction, EMPTY);
  return (
    <form action={action} className="mt-3 space-y-2">
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="integrationId" value={portal.integrationId ?? ""} />
      <input type="hidden" name="provider" value={portal.id} />
      <Field
        label={labels.channelUrlLabel}
        name="url"
        inputMode="url"
        placeholder={portal.channelExample ?? "https://…/channel/…"}
      />
      <Select label={labels.channelForChild} name="childMemberId" defaultValue="">
        <option value="">{labels.channelAnyChild}</option>
        {childOptions.map((child) => (
          <option key={child.id} value={child.id}>
            {child.name}
          </option>
        ))}
      </Select>
      <Button type="submit" variant="secondary" disabled={pending} className="gap-2">
        <Plug aria-hidden className="size-4" /> {labels.channelAdd}
      </Button>
      <Notice state={state} />
    </form>
  );
}

/** The sign-in form for a portal you connect with a username and password. */
function PortalSignInForm({ householdId, portal, labels }: { householdId: string; portal: PortalView; labels: SchoolConnectLabels }) {
  const [state, action, pending] = useActionState(connectSchoolPortalWithCredentialsAction, EMPTY);
  return (
    <form action={action} className="mt-3 space-y-2">
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="provider" value={portal.id} />
      <Field label={labels.urlLabel} name="url" inputMode="url" defaultValue={portal.portalUrl ?? ""} placeholder="https://www.looplearning.com" />
      <Field label={labels.usernameLabel} name="username" autoComplete="off" />
      <Field label={labels.passwordLabel} name="password" type="password" autoComplete="off" />
      <p className="text-[0.6875rem] text-[var(--wh-foreground-subtle)]">{labels.credentialsNote}</p>
      <Button type="submit" variant="secondary" disabled={pending} className="gap-2">
        <Plug aria-hidden className="size-4" /> {labels.signIn}
      </Button>
      <Notice state={state} />
    </form>
  );
}

/** The edit form for a connected portal: change the URL, username, or password (blank keeps it). */
function PortalEditForm({
  householdId,
  portal,
  labels,
  onDone,
}: {
  householdId: string;
  portal: PortalView;
  labels: SchoolConnectLabels;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(updateSchoolPortalCredentialsAction, EMPTY);
  return (
    <form action={action} className="mt-2 space-y-2">
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="integrationId" value={portal.integrationId ?? ""} />
      <input type="hidden" name="provider" value={portal.id} />
      <Field label={labels.urlLabel} name="url" inputMode="url" defaultValue={portal.connectedUrl ?? portal.portalUrl ?? ""} />
      <Field label={labels.usernameLabel} name="username" autoComplete="off" defaultValue={portal.connectedAs ?? ""} />
      <Field label={labels.passwordLabel} name="password" type="password" autoComplete="off" placeholder={labels.keepPassword} />
      <div className="flex items-center gap-2">
        <Button type="submit" variant="secondary" disabled={pending}>
          {labels.editSave}
        </Button>
        <Button type="button" variant="quiet" onClick={onDone} className="px-3">
          {labels.editCancel}
        </Button>
      </div>
      <Notice state={state} />
    </form>
  );
}

/** One tracked page: its address, what it is, who it's for, and stop/remove. */
function ScrapeRow({ householdId, page, labels }: { householdId: string; page: ScrapeUrlView; labels: SchoolConnectLabels }) {
  const [toggleState, toggle, toggling] = useActionState(setPortalScrapeUrlEnabledAction, EMPTY);
  const [removeState, remove, removing] = useActionState(removePortalScrapeUrlAction, EMPTY);
  return (
    <li className="flex items-center gap-2 py-2">
      <IconTile icon={FileText} tone={page.enabled ? "school" : "neutral"} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{page.url.replace(/^https?:\/\//, "")}</p>
        <p className="text-xs text-[var(--wh-foreground-muted)]">
          {labels.pageKind[page.kind] ?? page.kind}
          {page.childName ? ` · ${page.childName}` : ""}
          {page.enabled ? "" : ` · ${labels.pageStoppedBadge}`}
        </p>
        <Notice state={toggleState} />
        <Notice state={removeState} />
      </div>
      <form action={toggle}>
        <input type="hidden" name="householdId" value={householdId} />
        <input type="hidden" name="id" value={page.id} />
        <input type="hidden" name="enabled" value={page.enabled ? "false" : "true"} />
        <Button type="submit" variant="quiet" disabled={toggling} className="px-2 text-xs">
          {page.enabled ? labels.pageStop : labels.pageResume}
        </Button>
      </form>
      <form action={remove}>
        <input type="hidden" name="householdId" value={householdId} />
        <input type="hidden" name="id" value={page.id} />
        <Button type="submit" variant="quiet" disabled={removing} className="px-2 text-xs">
          {labels.pageRemove}
        </Button>
      </form>
    </li>
  );
}

/** Add a post-auth page for the worker to read. */
function AddScrapeForm({
  householdId,
  portal,
  childOptions,
  labels,
}: {
  householdId: string;
  portal: PortalView;
  childOptions: ChildOption[];
  labels: SchoolConnectLabels;
}) {
  const [state, action, pending] = useActionState(addPortalScrapeUrlAction, EMPTY);
  return (
    <form action={action} className="mt-3 space-y-2">
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="integrationId" value={portal.integrationId ?? ""} />
      <Field label={labels.pageUrlLabel} name="url" inputMode="url" placeholder={portal.connectedUrl ?? "https://…"} />
      <Select label={labels.pageKindLabel} name="kind" defaultValue="generic">
        {(["homework", "calendar", "messages", "results", "generic"] as const).map((k) => (
          <option key={k} value={k}>
            {labels.pageKind[k] ?? k}
          </option>
        ))}
      </Select>
      <Select label={labels.pageForChild} name="childMemberId" defaultValue="">
        <option value="">{labels.pageAnyChild}</option>
        {childOptions.map((child) => (
          <option key={child.id} value={child.id}>
            {child.name}
          </option>
        ))}
      </Select>
      <Button type="submit" variant="secondary" disabled={pending} className="gap-2">
        <Plug aria-hidden className="size-4" /> {labels.pageAdd}
      </Button>
      <Notice state={state} />
    </form>
  );
}

/** The "pages to read" section of a connected portal. */
function PagesToRead({
  householdId,
  portal,
  childOptions,
  labels,
}: {
  householdId: string;
  portal: PortalView;
  childOptions: ChildOption[];
  labels: SchoolConnectLabels;
}) {
  return (
    <div className="rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] p-3">
      <p className="text-sm font-medium">{labels.pagesTitle}</p>
      <p className="text-xs text-[var(--wh-foreground-muted)]">{labels.pagesLede}</p>
      {portal.scrapeUrls.length > 0 ? (
        <ul className="mt-1 divide-y divide-[var(--wh-border)]">
          {portal.scrapeUrls.map((page) => (
            <ScrapeRow key={page.id} householdId={householdId} page={page} labels={labels} />
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-[var(--wh-foreground-subtle)]">{labels.pagesNone}</p>
      )}
      <AddScrapeForm householdId={householdId} portal={portal} childOptions={childOptions} labels={labels} />
    </div>
  );
}

/** The connected state for a credentials portal: who and where it is signed in, edit, test, fetch, disconnect. */
function PortalConnected({
  householdId,
  portal,
  childOptions,
  labels,
}: {
  householdId: string;
  portal: PortalView;
  childOptions: ChildOption[];
  labels: SchoolConnectLabels;
}) {
  const [editing, setEditing] = useState(false);
  const [fetchState, fetchNow, fetching] = useActionState(fetchSchoolPortalNowAction, EMPTY);
  const [testState, test, testing] = useActionState(testSchoolPortalConnectionAction, EMPTY);
  const [disconnectState, disconnect, disconnecting] = useActionState(disconnectSchoolPortalAction, EMPTY);
  return (
    <div className="mt-3 space-y-3">
      <div>
        <p className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--wh-handled)]">
          <CheckCircle2 aria-hidden className="size-4" /> {labels.connectedAs} {portal.connectedAs}
        </p>
        {portal.connectedUrl ? (
          <p className="truncate text-xs text-[var(--wh-foreground-muted)]">{portal.connectedUrl.replace(/^https?:\/\//, "")}</p>
        ) : null}
      </div>

      {portal.connectionState === "reconnect_needed" ? (
        <Alert tone="attention" className="flex items-start gap-2">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{labels.reconnectNeeded}</span>
        </Alert>
      ) : null}

      {editing ? (
        <PortalEditForm householdId={householdId} portal={portal} labels={labels} onDone={() => setEditing(false)} />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => setEditing(true)} className="gap-2">
            <Pencil aria-hidden className="size-4" /> {labels.edit}
          </Button>
          <form action={test}>
            <input type="hidden" name="householdId" value={householdId} />
            <input type="hidden" name="integrationId" value={portal.integrationId ?? ""} />
            <Button type="submit" variant="secondary" disabled={testing} className="gap-2">
              <PlugZap aria-hidden className="size-4" /> {labels.test}
            </Button>
          </form>
        </div>
      )}
      <Notice state={testState} />

      <PagesToRead householdId={householdId} portal={portal} childOptions={childOptions} labels={labels} />

      <div className="rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] p-3">
        <p className="text-sm font-medium">{labels.fetchTitle}</p>
        <p className="text-xs text-[var(--wh-foreground-muted)]">{labels.fetchLede}</p>
        <form action={fetchNow} className="mt-2">
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="integrationId" value={portal.integrationId ?? ""} />
          <Button type="submit" variant="secondary" disabled={fetching} className="gap-2">
            <RefreshCw aria-hidden className="size-4" /> {labels.fetchNow}
          </Button>
        </form>
        <Notice state={fetchState} />
      </div>
      <form action={disconnect}>
        <input type="hidden" name="householdId" value={householdId} />
        <input type="hidden" name="provider" value={portal.id} />
        <Button type="submit" variant="quiet" disabled={disconnecting} className="px-3">
          {labels.disconnect}
        </Button>
      </form>
      <Notice state={disconnectState} />
    </div>
  );
}

function PortalCard({
  householdId,
  portal,
  childOptions,
  labels,
}: {
  householdId: string;
  portal: PortalView;
  childOptions: ChildOption[];
  labels: SchoolConnectLabels;
}) {
  const [connectState, connect, connecting] = useActionState(connectSchoolPortalAction, EMPTY);
  const [disconnectState, disconnect, disconnecting] = useActionState(disconnectSchoolPortalAction, EMPTY);
  const isCredentials = portal.auth === "credentials";
  const connected = isCredentials ? portal.connectedAs !== null : portal.connected;

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <IconTile icon={GraduationCap} tone="school" size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{portal.label}</p>
            {connected ? <Badge tone="handled">{labels.connectedBadge}</Badge> : <Badge>{labels.setupNeeded}</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-[var(--wh-foreground-muted)]">{portal.blurb}</p>
          {portal.portalUrl ? (
            <a
              href={portal.portalUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--wh-primary)]"
            >
              <ExternalLink aria-hidden className="size-3.5" /> {labels.visitPortal}
            </a>
          ) : null}

          {isCredentials ? (
            connected ? (
              <PortalConnected householdId={householdId} portal={portal} childOptions={childOptions} labels={labels} />
            ) : (
              <PortalSignInForm householdId={householdId} portal={portal} labels={labels} />
            )
          ) : (
            <>
              <div className="mt-3">
                {connected ? (
                  <form action={disconnect}>
                    <input type="hidden" name="householdId" value={householdId} />
                    <input type="hidden" name="provider" value={portal.id} />
                    <Button type="submit" variant="quiet" disabled={disconnecting} className="px-3">
                      {labels.disconnect}
                    </Button>
                  </form>
                ) : (
                  <form action={connect}>
                    <input type="hidden" name="householdId" value={householdId} />
                    <input type="hidden" name="provider" value={portal.id} />
                    <Button type="submit" variant="secondary" disabled={connecting} className="gap-2">
                      <Plug aria-hidden className="size-4" /> {labels.connect}
                    </Button>
                  </form>
                )}
                <Notice state={connectState} />
                <Notice state={disconnectState} />
              </div>
              {connected ? <p className="mt-3 text-xs text-[var(--wh-foreground-subtle)]">{labels.notLiveNote}</p> : null}
            </>
          )}

          {connected && portal.hasChannels ? (
            <div className="mt-3 border-t border-[var(--wh-border)] pt-3">
              <p className="text-sm font-medium">{labels.channelsTitle}</p>
              <p className="text-xs text-[var(--wh-foreground-muted)]">{labels.channelsLede}</p>
              {portal.channels.length > 0 ? (
                <ul className="mt-1 divide-y divide-[var(--wh-border)]">
                  {portal.channels.map((channel) => (
                    <ChannelRow key={channel.id} householdId={householdId} channel={channel} labels={labels} />
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-[var(--wh-foreground-subtle)]">{labels.channelNone}</p>
              )}
              <TrackChannelForm householdId={householdId} portal={portal} childOptions={childOptions} labels={labels} />
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

export function SchoolConnect({
  householdId,
  portals,
  childOptions,
  labels,
  forwardHref,
}: {
  householdId: string;
  portals: PortalView[];
  childOptions: ChildOption[];
  labels: SchoolConnectLabels;
  forwardHref: string;
}) {
  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <IconTile icon={Send} tone="handled" size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">{labels.forwardTitle}</p>
              <Badge tone="handled">{labels.availableNow}</Badge>
            </div>
            <p className="mt-0.5 text-xs text-[var(--wh-foreground-muted)]">{labels.forwardBody}</p>
            <div className="mt-3">
              <PillLink href={forwardHref} tone="primary">
                {labels.forwardCta}
              </PillLink>
            </div>
          </div>
        </div>
      </Card>

      <section>
        <p className="text-sm font-semibold">{labels.portals}</p>
        <p className="mb-2 text-xs text-[var(--wh-foreground-muted)]">{labels.portalsLede}</p>
        <div className="space-y-3">
          {portals.map((portal) => (
            <PortalCard key={portal.id} householdId={householdId} portal={portal} childOptions={childOptions} labels={labels} />
          ))}
        </div>
      </section>
    </div>
  );
}
