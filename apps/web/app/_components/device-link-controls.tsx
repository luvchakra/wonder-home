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

const CATEGORIES = [
  { value: "appliance", label: "Appliance" },
  { value: "fixture", label: "Fixture (a door, a tap, a tank)" },
  { value: "electronics", label: "Electronics" },
  { value: "vehicle", label: "Vehicle" },
  { value: "furniture", label: "Furniture" },
  { value: "other", label: "Something else" },
];

export function DeviceLinkControls({ householdId, device, assets }: { householdId: string; device: Device; assets: Asset[] }) {
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
      <Pill type="button" tone="quiet" onClick={() => setLinkOpen(true)} aria-label={`Which appliance is ${device.label}?`} title={`Which appliance is ${device.label}?`}>
        <Link2 aria-hidden className="size-3.5" />
      </Pill>
      {device.ignored ? (
        <Pill type="button" tone="quiet" disabled={ignorePending} onClick={() => setIgnored(false)} aria-label={`Use ${device.label} again`} title={`Use ${device.label} again`}>
          <Eye aria-hidden className="size-3.5" />
        </Pill>
      ) : (
        <Pill type="button" tone="quiet" onClick={() => setIgnoreOpen(true)} aria-label={`Ignore ${device.label}`} title={`Ignore ${device.label}`}>
          <EyeOff aria-hidden className="size-3.5" />
        </Pill>
      )}

      <Sheet open={linkOpen} onOpenChange={setLinkOpen} title={`Which appliance is ${device.label}?`} description="Its readings only count once you say. WonderHome never guesses which machine a device is.">
        <form action={linkAction} className="space-y-3">
          {linkState.error ? <Alert>{linkState.error}</Alert> : null}
          {linkState.notice ? <Alert tone="info">{linkState.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="linkId" value={device.id} />
          <Select label="Appliance" name="asset" value={choice} onChange={(event) => setChoice(event.target.value)}>
            <option value="">Not linked to anything</option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>{asset.name}</option>
            ))}
            <option value="new">Something not listed — add it</option>
          </Select>
          {choice === "new" ? (
            <>
              <Field label="What is it called?" name="newName" required maxLength={120} placeholder="Washing machine" autoComplete="off" />
              <Select label="What kind of thing" name="newCategory" defaultValue="appliance">
                {CATEGORIES.map((category) => (
                  <option key={category.value} value={category.value}>{category.label}</option>
                ))}
              </Select>
            </>
          ) : null}
          <Button type="submit" disabled={linkPending} className="w-full">
            {linkPending ? "Saving…" : "Save"}
          </Button>
        </form>
      </Sheet>

      <ConfirmationSheet
        open={ignoreOpen}
        onOpenChange={setIgnoreOpen}
        title={`Ignore ${device.label}?`}
        description="Nothing it reports will be used. Readings already recorded age out on their own, and you can stop ignoring it at any time."
        confirmLabel="Ignore"
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
