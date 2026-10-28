"use client";

import { AlertTriangle, GraduationCap, PlugZap, Send } from "lucide-react";
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
 * Two honest paths: forward a circular or photo into HomeSend (any school, no
 * setup), or connect the school's website as a browser-automation *connection*.
 * Here you pick one of the household's connections, test it (WonderHome signs in
 * and files anything new in HomeSend to confirm), and jump to the Connections
 * page to create or manage them. No demo portal, no inline sign-in.
 */

export type SchoolConnectionView = { id: string; name: string; url: string | null; connectionState?: string | null };

const EMPTY: ActionState = {};

type PollPhase = { kind: "idle" } | { kind: "checking" } | { kind: "ok" } | { kind: "failed"; reason: string | null } | { kind: "slow" };

/** Poll the fetch outcome after Test, so the result resolves instead of hanging on "checking". */
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

/** Pick a connection, test it, see the result — the website path, driven from the school screen. */
function PortalConnect({ householdId, connections, connectionsHref, labels }: { householdId: string; connections: SchoolConnectionView[]; connectionsHref: string; labels: SchoolConnectLabels }) {
  const [selectedId, setSelectedId] = useState(connections[0]?.id ?? "");
  const [testState, test, testing] = useActionState(testConnectionAction, EMPTY);
  const poll = useFetchPoll(householdId, selectedId);
  useEffect(() => {
    if (testState.notice && !testState.error) poll.start();
  }, [testState]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = connections.find((c) => c.id === selectedId) ?? null;

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <IconTile icon={GraduationCap} tone="school" size="lg" />
        <div className="min-w-0 flex-1 space-y-3">
          {connections.length === 0 ? (
            <p className="text-sm text-[var(--wh-foreground-muted)]">{labels.portalNone}</p>
          ) : (
            <>
              <Select label={labels.choose} name="connectionPicker" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.url ? ` · ${c.url.replace(/^https?:\/\//, "")}` : ""}</option>
                ))}
              </Select>

              {selected?.connectionState === "reconnect_needed" ? (
                <Alert tone="attention" className="flex items-start gap-2">
                  <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
                  <span>{labels.reconnectNeeded}</span>
                </Alert>
              ) : null}

              <form action={test}>
                <input type="hidden" name="householdId" value={householdId} />
                <input type="hidden" name="connectionId" value={selectedId} />
                <Button type="submit" variant="secondary" disabled={testing || !selectedId} className="gap-2">
                  <PlugZap aria-hidden className="size-4" /> {labels.testConnection}
                </Button>
              </form>

              {poll.phase.kind === "idle" ? (
                testState.error ? <Alert tone="attention">{testState.error}</Alert> : testState.notice ? <Alert tone="info">{testState.notice}</Alert> : null
              ) : poll.phase.kind === "checking" ? (
                <Alert tone="info">{labels.pollChecking}</Alert>
              ) : poll.phase.kind === "slow" ? (
                <Alert tone="attention">{labels.pollSlow}</Alert>
              ) : poll.phase.kind === "ok" ? (
                <Alert tone="info">{labels.pollOk}</Alert>
              ) : (
                <Alert tone="attention">{labels.pollFailed}{poll.phase.reason ? ` ${poll.phase.reason}` : ""}</Alert>
              )}
            </>
          )}

          <div>
            <PillLink href={connectionsHref} tone="primary">{labels.portalManage}</PillLink>
          </div>
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
