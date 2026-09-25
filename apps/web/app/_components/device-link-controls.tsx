"use client";

import { EyeOff, Eye, Link2 } from "lucide-react";
import { startTransition, useActionState, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Select } from "@wonderhome/core/ui/select";
import { ConfirmationSheet, Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import { ignoreDeviceAction, linkDeviceAction } from "../(auth)/device-actions";

/**
 * One device's controls on the Integrations screen (story 17-008): say which
 * appliance it is — picked from the household's own, or added right there
 * when it isn't listed — and ignore or stop ignoring it. A device is never
 * deleted here; it goes when its provider is disconnected.
 */

type Asset = { id: string; name: string };
type Device = { id: string; label: string; assetId: string | null; ignored: boolean };

const CATEGORIES = ["appliance", "fixture", "electronics", "vehicle", "furniture", "other"] as const;

/**
 * The controls' words in the viewer's language, built on the server by
 * `deviceLinkLabels` (story 22-004). `{name}` is filled in here with the
 * device's own label, which is the provider's and never translated.
 */
export type DeviceLinkLabels = {
  which: string;
  useAgain: string;
  ignore: string;
  whichLede: string;
  appliance: string;
  notLinked: string;
  notListed: string;
  newName: string;
  newNamePlaceholder: string;
  newCategory: string;
  categories: Record<(typeof CATEGORIES)[number], string>;
  saving: string;
  save: string;
  ignoreTitle: string;
  ignoreLede: string;
  ignoreConfirm: string;
};

const withName = (template: string, name: string) => template.replace(/\{name\}/g, () => name);

export function DeviceLinkControls({ householdId, device, assets, labels }: { householdId: string; device: Device; assets: Asset[]; labels: DeviceLinkLabels }) {
  const which = withName(labels.which, device.label);
  const [linkOpen, setLinkOpen] = useState(false);
  const [ignoreOpen, setIgnoreOpen] = useState(false);
  const [choice, setChoice] = useState(device.assetId ?? "");
  const [linkState, linkAction, linkPending] = useActionState<ActionState, FormData>(linkDeviceAction, {});
  const [ignoreState, ignoreAction, ignorePending] = useActionState<ActionState, FormData>(ignoreDeviceAction, {});

  const setIgnored = (ignored: boolean) => {
    const formData = new FormData();
    formData.set("householdId", householdId);
    formData.set("linkId", device.id);
    formData.set("ignored", String(ignored));
    // A hand-built call, not a form's `action`, so it needs its own transition
    // for `pending` to mean anything.
    startTransition(() => ignoreAction(formData));
  };

  return (
    <div className="flex items-center gap-1.5">
      <Pill type="button" tone="quiet" onClick={() => setLinkOpen(true)} aria-label={which} title={which}>
        <Link2 aria-hidden className="size-3.5" />
      </Pill>
      {device.ignored ? (
        <Pill type="button" tone="quiet" disabled={ignorePending} onClick={() => setIgnored(false)} aria-label={withName(labels.useAgain, device.label)} title={withName(labels.useAgain, device.label)}>
          <Eye aria-hidden className="size-3.5" />
        </Pill>
      ) : (
        <Pill type="button" tone="quiet" onClick={() => setIgnoreOpen(true)} aria-label={withName(labels.ignore, device.label)} title={withName(labels.ignore, device.label)}>
          <EyeOff aria-hidden className="size-3.5" />
        </Pill>
      )}

      <Sheet open={linkOpen} onOpenChange={setLinkOpen} title={which} description={labels.whichLede}>
        <form action={linkAction} className="space-y-3">
          {linkState.error ? <Alert>{linkState.error}</Alert> : null}
          {linkState.notice ? <Alert tone="info">{linkState.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="linkId" value={device.id} />
          <Select label={labels.appliance} name="asset" value={choice} onChange={(event) => setChoice(event.target.value)}>
            <option value="">{labels.notLinked}</option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>{asset.name}</option>
            ))}
            <option value="new">{labels.notListed}</option>
          </Select>
          {choice === "new" ? (
            <>
              <Field label={labels.newName} name="newName" required maxLength={120} placeholder={labels.newNamePlaceholder} autoComplete="off" />
              <Select label={labels.newCategory} name="newCategory" defaultValue="appliance">
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>{labels.categories[category]}</option>
                ))}
              </Select>
            </>
          ) : null}
          <Button type="submit" disabled={linkPending} className="w-full">
            {linkPending ? labels.saving : labels.save}
          </Button>
        </form>
      </Sheet>

      <ConfirmationSheet
        open={ignoreOpen}
        onOpenChange={setIgnoreOpen}
        title={withName(labels.ignoreTitle, device.label)}
        description={labels.ignoreLede}
        confirmLabel={labels.ignoreConfirm}
        pending={ignorePending}
        onConfirm={() => {
          setIgnored(true);
          setIgnoreOpen(false);
        }}
      >
        {ignoreState.error ? <p className="text-sm text-[var(--wh-risk)]">{ignoreState.error}</p> : null}
      </ConfirmationSheet>
      {!ignoreOpen && ignoreState.error ? <span className="sr-only" role="alert">{ignoreState.error}</span> : null}
    </div>
  );
}
