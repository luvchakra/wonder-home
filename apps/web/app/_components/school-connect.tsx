"use client";

import { AlertTriangle, CheckCircle2, DownloadCloud, PlugZap, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Badge, PillLink } from "@wonderhome/core/ui/pill";
import { Button } from "@wonderhome/core/ui/button";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Select } from "@wonderhome/core/ui/select";

import { connectionFetchStatusAction, testConnectionAction } from "../(auth)/connection-actions";
import type { ActionState } from "../(auth)/actions";
import type { SchoolConnectLabels } from "../_lib/school-connect-labels";

/**
 * Connect school (redesigned around the Connections framework, 2026-10-28).
 *
 * Forward a circular or photo into HomeSend (any school, no setup), or connect
 * the school's website as a browser-automation connection: pick one, press
 * Connect (WonderHome signs in; once in, it shows "Connected"), then Fetch now
 * in the area below to read the pages set up for it and file anything new in
 * HomeSend to confirm.
 */

export type SchoolConnectionView = { id: string; name: string; url: string | null; connectionState?: string | null };

const EMPTY: ActionState = {};

type PollPhase = { kind: "idle" } | { kind: "checking" } | { kind: "ok" } | { kind: "failed"; reason: string | null } | { kind: "slow" };

/** Poll the fetch outcome after Connect/Fetch, so the result resolves instead of hanging. */
function useFetchPoll(householdId: string, connectionId: string) {
  const router = useRouter();
  const [phase, setPhase] = useState<PollPhase>({ kind: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => stop, [stop]);
  const start = useCallback(() => {
    stop();
    setPhase({ kind: "checking" });
    const startedAt = Date.now();
    const tick = async () => {
      let result: Awaited<ReturnType<typeof connectionFetchStatusAction>> | null = null;
      try {
        result = await connectionFetchStatusAction({ householdId, connectionId });
      } catch {
        result = null;
      }
      if (result?.status === "done") {
        setPhase({ kind: "ok" });
        router.refresh();
        return;
      }
      if (result?.status === "failed") {
        setPhase({ kind: "failed", reason: result.reason });
        router.refresh();
        return;
      }
      if (Date.now() - startedAt > 60_000) {
        setPhase({ kind: "slow" });
        return;
      }
      timer.current = setTimeout(() => void tick(), 3_000);
    };
    timer.current = setTimeout(() => void tick(), 2_500);
  }, [householdId, connectionId, router, stop]);
  return { phase, start };
}

/** Render a poll phase (or the raw action state before polling starts). */
function PollResult({ phase, state, okLabel, labels }: { phase: PollPhase; state: ActionState; okLabel: string; labels: SchoolConnectLabels }) {
  if (phase.kind === "idle") {
    if (state.error) return <Alert tone="attention">{state.error}</Alert>;
    if (state.notice) return <Alert tone="info">{state.notice}</Alert>;
    return null;
  }
  if (phase.kind === "checking") return <Alert tone="info">{labels.pollChecking}</Alert>;
  if (phase.kind === "slow") return <Alert tone="attention">{labels.pollSlow}</Alert>;
  if (phase.kind === "ok") return <Alert tone="info">{okLabel}</Alert>;
  return <Alert tone="attention">{labels.pollFailed}{phase.reason ? ` ${phase.reason}` : ""}</Alert>;
}

/** Pick a connection, connect it, then fetch — driven from the school screen. */
function PortalConnect({ householdId, connections, connectionsHref, labels }: { householdId: string; connections: SchoolConnectionView[]; connectionsHref: string; labels: SchoolConnectLabels }) {
  const [selectedId, setSelectedId] = useState(connections[0]?.id ?? "");
  const selected = connections.find((c) => c.id === selectedId) ?? null;
  const connected = selected?.connectionState === "connected";
  const reconnect = selected?.connectionState === "reconnect_needed";

  const [connectState, connect, connecting] = useActionState(testConnectionAction, EMPTY);
  const connectPoll = useFetchPoll(householdId, selectedId);
  useEffect(() => {
    if (connectState.notice && !connectState.error) connectPoll.start();
  }, [connectState]); // eslint-disable-line react-hooks/exhaustive-deps

  const [fetchState, fetchNow, fetching] = useActionState(testConnectionAction, EMPTY);
  const fetchPoll = useFetchPoll(householdId, selectedId);
  useEffect(() => {
    if (fetchState.notice && !fetchState.error) fetchPoll.start();
  }, [fetchState]); // eslint-disable-line react-hooks/exhaustive-deps

  if (connections.length === 0) {
    return (
      <Card className="p-4">
        <div className="min-w-0 space-y-3">
          <p className="text-sm text-[var(--wh-foreground-muted)]">{labels.portalNone}</p>
          <PillLink href={connectionsHref} tone="primary">{labels.portalManage}</PillLink>
        </div>
      </Card>
    );
  }

  return (
    <Card className="space-y-3 p-4">
      <Select label={labels.choose} name="connectionPicker" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
        {connections.map((c) => (
          <option key={c.id} value={c.id}>{c.name}{c.url ? ` · ${c.url.replace(/^https?:\/\//, "")}` : ""}</option>
        ))}
      </Select>

      {/* Connect / Connected */}
      {connected ? (
        <Badge tone="handled" className="gap-1"><CheckCircle2 aria-hidden className="size-4" /> {labels.connectedBadge}</Badge>
      ) : (
        <>
          {reconnect ? (
            <Alert tone="attention" className="flex items-start gap-2">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>{labels.reconnectNeeded}</span>
            </Alert>
          ) : null}
          <form action={connect}>
            <input type="hidden" name="householdId" value={householdId} />
            <input type="hidden" name="connectionId" value={selectedId} />
            <Button type="submit" variant="primary" disabled={connecting || !selectedId} className="gap-2">
              <PlugZap aria-hidden className="size-4" /> {labels.connect}
            </Button>
          </form>
          <PollResult phase={connectPoll.phase} state={connectState} okLabel={labels.connectOk} labels={labels} />
        </>
      )}

      {/* Fetch area */}
      <div className="rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] p-3">
        <p className="text-sm font-medium">{labels.fetchTitle}</p>
        <p className="text-xs text-[var(--wh-foreground-muted)]">{labels.fetchLede}</p>
        <form action={fetchNow} className="mt-3">
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="connectionId" value={selectedId} />
          <Button type="submit" variant="secondary" disabled={fetching || !selectedId} className="gap-2">
            <DownloadCloud aria-hidden className="size-4" /> {labels.fetchNow}
          </Button>
        </form>
        <div className="mt-2">
          <PollResult phase={fetchPoll.phase} state={fetchState} okLabel={labels.fetchOk} labels={labels} />
        </div>
      </div>
    </Card>
  );
}

export function SchoolConnect({
  householdId,
  connections,
  connectionsHref,
  forwardHref,
  labels,
}: {
  householdId: string;
  connections: SchoolConnectionView[];
  connectionsHref: string;
  forwardHref: string;
  labels: SchoolConnectLabels;
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
              <PillLink href={forwardHref} tone="primary">{labels.forwardCta}</PillLink>
            </div>
          </div>
        </div>
      </Card>

      <section>
        <p className="text-sm font-semibold">{labels.portalTitle}</p>
        <p className="mb-2 text-xs text-[var(--wh-foreground-muted)]">{labels.portalLede}</p>
        <PortalConnect householdId={householdId} connections={connections} connectionsHref={connectionsHref} labels={labels} />
      </section>
    </div>
  );
}
