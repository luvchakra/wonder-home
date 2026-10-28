"use client";

import { ExternalLink, Pencil, Plug, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Badge } from "@wonderhome/core/ui/pill";
import { Button } from "@wonderhome/core/ui/button";
import { Card } from "@wonderhome/core/ui/card";
import { Field } from "@wonderhome/core/ui/field";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Select } from "@wonderhome/core/ui/select";
import type { ConnectorType } from "@wonderhome/core/connectors/registry";

import { createConnectionAction, deleteConnectionAction, updateConnectionAction } from "../(auth)/connection-actions";
import type { ActionState } from "../(auth)/actions";
import type { ConnectionsLabels } from "../_lib/connections-labels";

export type ConnectionView = { id: string; name: string; connectorType: string; status: string; params: Record<string, string> };

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

/** One connection: its name, type and status, with inline edit and remove. */
function ConnectionRow({ householdId, connection, connector, labels }: { householdId: string; connection: ConnectionView; connector: ConnectorType | null; labels: ConnectionsLabels }) {
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
    </li>
  );
}

export function ConnectionsManager({
  householdId,
  canCreate,
  connectors,
  connections,
  labels,
  linkHrefs,
}: {
  householdId: string;
  canCreate: boolean;
  connectors: ConnectorType[];
  connections: ConnectionView[];
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
              <ConnectionRow key={connection.id} householdId={householdId} connection={connection} connector={byType.get(connection.connectorType) ?? null} labels={labels} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
