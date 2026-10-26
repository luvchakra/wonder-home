"use client";

import { ExternalLink, GraduationCap, Plug, Radio, Send } from "lucide-react";
import { useActionState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Badge, PillLink } from "@wonderhome/core/ui/pill";
import { Button } from "@wonderhome/core/ui/button";
import { Card } from "@wonderhome/core/ui/card";
import { Field } from "@wonderhome/core/ui/field";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Select } from "@wonderhome/core/ui/select";

import {
  connectSchoolPortalAction,
  disconnectSchoolPortalAction,
  setSchoolChannelActiveAction,
  trackSchoolChannelAction,
} from "../(auth)/school-actions";
import type { ActionState } from "../(auth)/actions";
import type { SchoolConnectLabels } from "../_lib/school-connect-labels";

export type ChannelView = { id: string; url: string; childName: string | null; active: boolean };

export type PortalView = {
  id: string;
  label: string;
  blurb: string;
  connected: boolean;
  integrationId: string | null;
  statusLabel: string | null;
  hasChannels: boolean;
  channelExample: string | null;
  portalUrl: string | null;
  channels: ChannelView[];
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

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <IconTile icon={GraduationCap} tone="school" size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{portal.label}</p>
            {portal.connected ? <Badge tone="handled">{labels.connectedBadge}</Badge> : <Badge>{labels.setupNeeded}</Badge>}
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

          <div className="mt-3">
            {portal.connected ? (
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

          {portal.connected ? (
            <p className="mt-3 text-xs text-[var(--wh-foreground-subtle)]">{labels.notLiveNote}</p>
          ) : null}

          {portal.connected && portal.hasChannels ? (
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
