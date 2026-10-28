"use client";

import { AlertTriangle, ChevronDown, ExternalLink, FileText, Pencil, Plug, PlugZap, RefreshCw, Send, Trash2 } from "lucide-react";
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
  testRestRequestAction,
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

const TEXTAREA_CLASS =
  "block w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 py-2 font-mono text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--wh-primary)]";

const REST_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

type RestResult = Awaited<ReturnType<typeof testRestRequestAction>>;

/** The request/response tester for a REST connection: compose a request, send it, inspect the response. */
function RestTesterSection({ householdId, connection, labels }: { householdId: string; connection: ConnectionView; labels: ConnectionsLabels }) {
  const [method, setMethod] = useState<(typeof REST_METHODS)[number]>("GET");
  const [path, setPath] = useState("");
  const [headersText, setHeadersText] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<RestResult | null>(null);

  const send = async () => {
    setSending(true);
    setResult(null);
    try {
      setResult(await testRestRequestAction({ householdId, connectionId: connection.id, method, path, headersText, body }));
    } catch {
      setResult({ ok: false, error: labels.testFailed });
    } finally {
      setSending(false);
    }
  };

  const bodyDisabled = method === "GET";

  return (
    <div className="mt-2 space-y-3 ps-[3.25rem]">
      <div className="rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] p-3">
        <p className="text-sm font-medium">{labels.restTitle}</p>
        <p className="text-xs text-[var(--wh-foreground-muted)]">{labels.restLede}</p>
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <div className="w-32 shrink-0">
              <Select label={labels.restMethod} name="restMethod" value={method} onChange={(e) => setMethod(e.target.value as (typeof REST_METHODS)[number])}>
                {REST_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
            </div>
            <div className="min-w-0 flex-1">
              <Field label={labels.restPath} name="restPath" value={path} onChange={(e) => setPath(e.target.value)} placeholder={labels.restPathPlaceholder} inputMode="url" autoComplete="off" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="restHeaders" className="block text-sm font-medium">{labels.restHeaders}</label>
            <textarea id="restHeaders" name="restHeaders" rows={2} value={headersText} onChange={(e) => setHeadersText(e.target.value)} placeholder={labels.restHeadersPlaceholder} className={TEXTAREA_CLASS} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="restBody" className="block text-sm font-medium">{labels.restBody}</label>
            <textarea id="restBody" name="restBody" rows={3} value={body} onChange={(e) => setBody(e.target.value)} disabled={bodyDisabled} className={`${TEXTAREA_CLASS}${bodyDisabled ? " opacity-50" : ""}`} />
          </div>
          <Button type="button" variant="secondary" onClick={() => void send()} disabled={sending} className="gap-2">
            <Send aria-hidden className="size-4" /> {sending ? labels.restSending : labels.restSend}
          </Button>
        </div>

        {result ? (
          result.ok ? (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{labels.restStatus}</span>
                <Badge tone={result.status < 300 ? "handled" : "attention"}>{result.status} {result.statusText}</Badge>
                <span className="text-xs text-[var(--wh-foreground-subtle)]">{labels.restTook} {result.durationMs} ms</span>
              </div>
              {Object.keys(result.headers).length > 0 ? (
                <pre className="overflow-x-auto rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] p-2 text-xs">{Object.entries(result.headers).map(([k, v]) => `${k}: ${v}`).join("\n")}</pre>
              ) : null}
              <div>
                <p className="text-xs font-medium text-[var(--wh-foreground-muted)]">{labels.restResponse}</p>
                <pre className="mt-1 max-h-80 overflow-auto rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] p-2 text-xs whitespace-pre-wrap break-words">{result.body}</pre>
                {result.truncated ? <p className="mt-1 text-xs text-[var(--wh-foreground-subtle)]">{labels.restTruncated}</p> : null}
              </div>
            </div>
          ) : (
            <Alert tone="attention" className="mt-3">{result.error}</Alert>
          )
        ) : null}
      </div>
    </div>
  );
}

/** One connection: its name, type and status, with inline edit and remove. */
function ConnectionRow({ householdId, connection, connector, childOptions, labels }: { householdId: string; connection: ConnectionView; connector: ConnectorType | null; childOptions: ChildOption[]; labels: ConnectionsLabels }) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editState, edit, saving] = useActionState(updateConnectionAction, EMPTY);
  const [removeState, remove, removing] = useActionState(deleteConnectionAction, EMPTY);
  const statusWord = labels.status[connection.status] ?? connection.status;
  const foldable = Boolean(connector && (connector.capabilities.includes("portal-fetch") || connector.capabilities.includes("rest-call")));

  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <IconTile icon={Plug} tone={connection.status === "connected" ? "handled" : connection.status === "reconnect_needed" || connection.status === "error" ? "neutral" : "care"} />
        <button
          type="button"
          onClick={foldable ? () => setExpanded((v) => !v) : undefined}
          aria-expanded={foldable ? expanded : undefined}
          className={`min-w-0 flex-1 text-start ${foldable ? "cursor-pointer" : "cursor-default"}`}
        >
          <p className="text-sm font-medium break-words">{connection.name}</p>
          <p className="text-xs text-[var(--wh-foreground-muted)]">
            {connector?.label ?? connection.connectorType}
            {connection.params.url ? ` · ${connection.params.url.replace(/^https?:\/\//, "")}` : ""}
          </p>
          <div className="mt-1"><Badge tone={connection.status === "connected" ? "handled" : connection.status === "reconnect_needed" || connection.status === "error" ? "attention" : "neutral"}>{statusWord}</Badge></div>
        </button>
        <div className="flex shrink-0 gap-1">
          {connector && connector.creation.mode === "params" ? (
            <Button type="button" variant="quiet" onClick={() => setEditing((v) => !v)} className="px-2 text-xs"><Pencil aria-hidden className="size-4" /></Button>
          ) : null}
          <form action={remove}>
            <input type="hidden" name="householdId" value={householdId} />
            <input type="hidden" name="id" value={connection.id} />
            <Button type="submit" variant="quiet" disabled={removing} className="px-2 text-xs"><Trash2 aria-hidden className="size-4" /></Button>
          </form>
          {foldable ? (
            <Button type="button" variant="quiet" onClick={() => setExpanded((v) => !v)} aria-label={labels.toggleDetails} aria-expanded={expanded} className="px-2 text-xs">
              <ChevronDown aria-hidden className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </Button>
          ) : null}
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

      {expanded && connector && connector.capabilities.includes("portal-fetch") && !editing ? (
        <BrowserFetchSection householdId={householdId} connection={connection} childOptions={childOptions} labels={labels} />
      ) : null}

      {expanded && connector && connector.capabilities.includes("rest-call") && !editing ? (
        <RestTesterSection householdId={householdId} connection={connection} labels={labels} />
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
