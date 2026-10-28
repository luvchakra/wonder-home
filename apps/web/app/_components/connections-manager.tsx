"use client";

import { AlertTriangle, ExternalLink, FileText, Pencil, Plug, PlugZap, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Badge } from "@wonderhome/core/ui/pill";
import { Button } from "@wonderhome/core/ui/button";
import { Card } from "@wonderhome/core/ui/card";
import { Field } from "@wonderhome/core/ui/field";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Select } from "@wonderhome/core/ui/select";
import type { ConnectorType } from "@wonderhome/core/connectors/registry";

import {
  addConnectionScrapeUrlAction,
  connectionFetchStatusAction,
  createConnectionAction,
  deleteConnectionAction,
  removeConnectionScrapeUrlAction,
  setConnectionScrapeUrlEnabledAction,
  testConnectionAction,
  updateConnectionAction,
} from "../(auth)/connection-actions";
import type { ActionState } from "../(auth)/actions";
import type { ConnectionsLabels } from "../_lib/connections-labels";

export type ChildOption = { id: string; name: string };
export type ScrapeUrlView = { id: string; url: string; kind: string; childName: string | null; enabled: boolean };
export type ConnectionView = {
  id: string;
  name: string;
  connectorType: string;
  status: string;
  params: Record<string, string>;
  /** Worker fetch state for a browser-automation connection: connected / reconnect_needed / never / null. */
  connectionState?: string | null;
  /** Pages the worker reads for this connection (browser-automation only). */
  scrapeUrls?: ScrapeUrlView[];
};

const EMPTY: ActionState = {};

function Notice({ state }: { state: ActionState }) {
  if (state.error) return <Alert tone="attention" className="mt-2">{state.error}</Alert>;
  if (state.notice) return <Alert tone="info" className="mt-2">{state.notice}</Alert>;
  return null;
}

/** Render a connector type's parameter fields; prefills non-secret values on edit (a blank secret keeps the stored one). */
function ParamFields({ connector, values, labels, editing }: { connector: ConnectorType; values?: Record<string, string>; labels: ConnectionsLabels; editing: boolean }) {
  if (connector.creation.mode !== "params") return null;
  return (
    <>
      {connector.creation.params.map((p) => {
        const common = { label: p.label, name: `param.${p.key}`, hint: p.hint };
        if (p.kind === "secret") {
          return <Field key={p.key} {...common} type="password" autoComplete="off" placeholder={editing ? "••••••••" : undefined} hint={editing ? labels.keepSecret : p.hint} />;
        }
        return (
          <Field
            key={p.key}
            {...common}
            type={p.kind === "url" ? "url" : "text"}
            inputMode={p.kind === "url" ? "url" : undefined}
            defaultValue={values?.[p.key] ?? ""}
            placeholder={p.placeholder}
          />
        );
      })}
    </>
  );
}

/** The "New connection" flow: pick a type, then its params form (or a note for link-flow types). */
function CreateFlow({ householdId, connectors, labels, linkHrefs, onDone }: { householdId: string; connectors: ConnectorType[]; labels: ConnectionsLabels; linkHrefs: Record<string, string>; onDone: () => void }) {
  const [typeId, setTypeId] = useState(connectors[0]?.id ?? "");
  const [state, action, pending] = useActionState(createConnectionAction, EMPTY);
  const connector = connectors.find((c) => c.id === typeId) ?? null;
  const href = connector ? linkHrefs[connector.id] ?? null : null;

  return (
    <Card className="p-4">
      <div className="space-y-3">
        <Select label={labels.chooseType} name="connectorTypePicker" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          {connectors.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </Select>
        {connector ? <p className="text-xs text-[var(--wh-foreground-muted)]">{connector.description}</p> : null}

        {connector && connector.creation.mode === "params" ? (
          <form action={action} className="space-y-2">
            <input type="hidden" name="householdId" value={householdId} />
            <input type="hidden" name="connectorType" value={connector.id} />
            <Field label={labels.nameLabel} name="name" placeholder={labels.namePlaceholder} required />
            <ParamFields connector={connector} labels={labels} editing={false} />
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="submit" variant="primary" disabled={pending} className="gap-2">
                <Plug aria-hidden className="size-4" /> {labels.create}
              </Button>
              <Button type="button" variant="quiet" onClick={onDone}>{labels.cancel}</Button>
            </div>
            <Notice state={state} />
          </form>
        ) : connector ? (
          <div className="space-y-2">
            <Alert tone="info">{labels.linkHint}</Alert>
            {href ? (
              <a href={href} className="inline-flex items-center gap-1 text-sm font-medium text-[var(--wh-primary)]">
                <ExternalLink aria-hidden className="size-4" /> {connector.label}
              </a>
            ) : null}
            <div><Button type="button" variant="quiet" onClick={onDone}>{labels.cancel}</Button></div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

type PollPhase = { kind: "idle" } | { kind: "checking" } | { kind: "ok" } | { kind: "failed"; reason: string | null } | { kind: "slow" };

/** After "Test connection", poll the job outcome so the result shows instead of a message that never resolves. */
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

function PollNotice({ phase, labels }: { phase: PollPhase; labels: ConnectionsLabels }) {
  if (phase.kind === "idle") return null;
  if (phase.kind === "checking") return <Alert tone="info" className="mt-2">{labels.testChecking}</Alert>;
  if (phase.kind === "slow") return <Alert tone="attention" className="mt-2">{labels.testSlow}</Alert>;
  if (phase.kind === "ok") return <Alert tone="info" className="mt-2">{labels.testOk}</Alert>;
  return <Alert tone="attention" className="mt-2">{labels.testFailed}{phase.reason ? ` ${phase.reason}` : ""}</Alert>;
}

/** One tracked page of a connection. */
function ScrapeRow({ householdId, page, labels }: { householdId: string; page: ScrapeUrlView; labels: ConnectionsLabels }) {
  const [toggleState, toggle, toggling] = useActionState(setConnectionScrapeUrlEnabledAction, EMPTY);
  const [removeState, remove, removing] = useActionState(removeConnectionScrapeUrlAction, EMPTY);
  return (
    <li className="flex items-center gap-2 py-2">
      <IconTile icon={FileText} tone={page.enabled ? "handled" : "neutral"} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{page.url.replace(/^https?:\/\//, "")}</p>
        <p className="text-xs text-[var(--wh-foreground-muted)]">
          {labels.pageKind[page.kind] ?? page.kind}
          {page.childName ? ` · ${page.childName}` : ""}
          {page.enabled ? "" : ` · ${labels.pageStopped}`}
        </p>
        <Notice state={toggleState} />
        <Notice state={removeState} />
      </div>
      <form action={toggle}>
        <input type="hidden" name="householdId" value={householdId} />
        <input type="hidden" name="id" value={page.id} />
        <input type="hidden" name="enabled" value={page.enabled ? "false" : "true"} />
        <Button type="submit" variant="quiet" disabled={toggling} className="px-2 text-xs">{page.enabled ? labels.pageStop : labels.pageResume}</Button>
      </form>
      <form action={remove}>
        <input type="hidden" name="householdId" value={householdId} />
        <input type="hidden" name="id" value={page.id} />
        <Button type="submit" variant="quiet" disabled={removing} className="px-2 text-xs"><Trash2 aria-hidden className="size-4" /></Button>
      </form>
    </li>
  );
}

/** Test connection + pages-to-read, for a browser-automation connection. Works for any site, any module. */
function BrowserFetchSection({ householdId, connection, childOptions, labels }: { householdId: string; connection: ConnectionView; childOptions: ChildOption[]; labels: ConnectionsLabels }) {
  const [testState, test, testing] = useActionState(testConnectionAction, EMPTY);
  const [addState, add, adding] = useActionState(addConnectionScrapeUrlAction, EMPTY);
  const poll = useFetchPoll(householdId, connection.id);
  useEffect(() => {
    if (testState.notice && !testState.error) poll.start();
  }, [testState]); // eslint-disable-line react-hooks/exhaustive-deps
  const pages = connection.scrapeUrls ?? [];
  return (
    <div className="mt-2 space-y-3 ps-[3.25rem]">
      {connection.connectionState === "reconnect_needed" ? (
        <Alert tone="attention" className="flex items-start gap-2">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{labels.reconnectNeeded}</span>
        </Alert>
      ) : null}

      <form action={test}>
        <input type="hidden" name="householdId" value={householdId} />
        <input type="hidden" name="connectionId" value={connection.id} />
        <Button type="submit" variant="secondary" disabled={testing} className="gap-2"><PlugZap aria-hidden className="size-4" /> {labels.testConnection}</Button>
      </form>
      {poll.phase.kind === "idle" ? <Notice state={testState} /> : <PollNotice phase={poll.phase} labels={labels} />}

      <div className="rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] p-3">
        <p className="text-sm font-medium">{labels.pagesTitle}</p>
        <p className="text-xs text-[var(--wh-foreground-muted)]">{labels.pagesLede}</p>
        {pages.length > 0 ? (
          <ul className="mt-1 divide-y divide-[var(--wh-border)]">
            {pages.map((page) => <ScrapeRow key={page.id} householdId={householdId} page={page} labels={labels} />)}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-[var(--wh-foreground-subtle)]">{labels.pagesNone}</p>
        )}
        <form action={add} className="mt-3 space-y-2">
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="connectionId" value={connection.id} />
          <Field label={labels.pageUrlLabel} name="url" inputMode="url" placeholder={connection.params.url ?? "https://…"} />
          <Select label={labels.pageKindLabel} name="kind" defaultValue="generic">
            {(["homework", "calendar", "messages", "results", "generic"] as const).map((k) => (
              <option key={k} value={k}>{labels.pageKind[k] ?? k}</option>
            ))}
          </Select>
          <Select label={labels.pageForChild} name="childMemberId" defaultValue="">
            <option value="">{labels.pageAnyone}</option>
            {childOptions.map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}
          </Select>
          <Button type="submit" variant="secondary" disabled={adding} className="gap-2"><RefreshCw aria-hidden className="size-4" /> {labels.pageAdd}</Button>
          <Notice state={addState} />
        </form>
      </div>
    </div>
  );
}

/** One connection: its name, type and status, with inline edit and remove. */
function ConnectionRow({ householdId, connection, connector, childOptions, labels }: { householdId: string; connection: ConnectionView; connector: ConnectorType | null; childOptions: ChildOption[]; labels: ConnectionsLabels }) {
  const [editing, setEditing] = useState(false);
  const [editState, edit, saving] = useActionState(updateConnectionAction, EMPTY);
  const [removeState, remove, removing] = useActionState(deleteConnectionAction, EMPTY);
  const statusWord = labels.status[connection.status] ?? connection.status;

  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <IconTile icon={Plug} tone={connection.status === "connected" ? "handled" : connection.status === "reconnect_needed" || connection.status === "error" ? "neutral" : "care"} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium break-words">{connection.name}</p>
          <p className="text-xs text-[var(--wh-foreground-muted)]">
            {connector?.label ?? connection.connectorType}
            {connection.params.url ? ` · ${connection.params.url.replace(/^https?:\/\//, "")}` : ""}
          </p>
          <div className="mt-1"><Badge tone={connection.status === "connected" ? "handled" : connection.status === "reconnect_needed" || connection.status === "error" ? "attention" : "neutral"}>{statusWord}</Badge></div>
        </div>
        <div className="flex shrink-0 gap-1">
          {connector && connector.creation.mode === "params" ? (
            <Button type="button" variant="quiet" onClick={() => setEditing((v) => !v)} className="px-2 text-xs"><Pencil aria-hidden className="size-4" /></Button>
          ) : null}
          <form action={remove}>
            <input type="hidden" name="householdId" value={householdId} />
            <input type="hidden" name="id" value={connection.id} />
            <Button type="submit" variant="quiet" disabled={removing} className="px-2 text-xs"><Trash2 aria-hidden className="size-4" /></Button>
          </form>
        </div>
      </div>

      {editing && connector && connector.creation.mode === "params" ? (
        <form action={edit} className="mt-2 space-y-2 ps-[3.25rem]">
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="id" value={connection.id} />
          <input type="hidden" name="connectorType" value={connection.connectorType} />
          <Field label={labels.nameLabel} name="name" defaultValue={connection.name} required />
          <ParamFields connector={connector} values={connection.params} labels={labels} editing />
          <div className="flex gap-2">
            <Button type="submit" variant="secondary" disabled={saving}>{labels.save}</Button>
            <Button type="button" variant="quiet" onClick={() => setEditing(false)}>{labels.cancel}</Button>
          </div>
        </form>
      ) : null}
      <Notice state={editState} />
      <Notice state={removeState} />

      {connector && connector.capabilities.includes("portal-fetch") && !editing ? (
        <BrowserFetchSection householdId={householdId} connection={connection} childOptions={childOptions} labels={labels} />
      ) : null}
    </li>
  );
}

export function ConnectionsManager({
  householdId,
  canCreate,
  connectors,
  connections,
  childOptions,
  labels,
  linkHrefs,
}: {
  householdId: string;
  canCreate: boolean;
  connectors: ConnectorType[];
  connections: ConnectionView[];
  childOptions: ChildOption[];
  labels: ConnectionsLabels;
  linkHrefs: Record<string, string>;
}) {
  const [creating, setCreating] = useState(false);
  const byType = new Map(connectors.map((c) => [c.id, c]));

  return (
    <div className="space-y-3">
      {canCreate ? (
        creating ? (
          <CreateFlow householdId={householdId} connectors={connectors} labels={labels} linkHrefs={linkHrefs} onDone={() => setCreating(false)} />
        ) : (
          <Button type="button" variant="primary" onClick={() => setCreating(true)} className="gap-2">
            <Plug aria-hidden className="size-4" /> {labels.newConnection}
          </Button>
        )
      ) : null}

      <Card className="p-2">
        {connections.length === 0 ? (
          <p className="px-2 py-3 text-sm text-[var(--wh-foreground-muted)]">{labels.none}</p>
        ) : (
          <ul className="divide-y divide-[var(--wh-border)]">
            {connections.map((connection) => (
              <ConnectionRow key={connection.id} householdId={householdId} connection={connection} connector={byType.get(connection.connectorType) ?? null} childOptions={childOptions} labels={labels} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
