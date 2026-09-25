"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { ChannelPreference, DeliveryChannel } from "@wonderhome/core/notifications/channels";
import { Alert } from "@wonderhome/core/ui/alert";
import { Card } from "@wonderhome/core/ui/card";
import { Field } from "@wonderhome/core/ui/field";
import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";
import { Select } from "@wonderhome/core/ui/select";
import { Button } from "@wonderhome/core/ui/button";
import { Bell, Mail, MessageCircle, Smartphone } from "lucide-react";

import type { ActionState } from "../(auth)/actions";

// A component reference cannot cross the server/client boundary as a prop
// (React can only serialize plain data there) — so the mapping lives here,
// inside the client component, keyed on the one plain value that can:
// `preference.channel`.
const CHANNEL_ICONS: Record<DeliveryChannel, typeof Bell> = {
  in_app: Bell,
  push: Smartphone,
  email: Mail,
  whatsapp: MessageCircle,
};

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/** One channel card's words in the viewer's language, built on the server (story 22-004). */
export type ChannelPreferenceLabels = {
  /** The channel's own name: "In-app", "Email", "WhatsApp". */
  name: string;
  description: string;
  notConnected: string;
  sendHere: string;
  whatsappNumber: string;
  whatsappHint: string;
  quietFrom: string;
  quietUntil: string;
  off: string;
  save: string;
  saving: string;
};

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

/**
 * One channel's preference, as its own small form (story 06-008).
 *
 * Every channel is shown and every channel is genuinely settable — a
 * preference saved now for push, email or WhatsApp takes effect the moment
 * this deployment has a real provider behind that adapter, with no further
 * change needed here. What must never happen is implying delivery that
 * is not real: `live` says which channel actually reaches someone today,
 * and the copy for the other three says so plainly rather than pretending
 * a toggle that already does something it does not (design rule 10).
 */
export function ChannelPreferenceCard({
  householdId,
  tone,
  preference,
  live,
  labels,
  save,
}: {
  householdId: string;
  tone: IconTone;
  preference: ChannelPreference;
  live: boolean;
  labels: ChannelPreferenceLabels;
  save: (state: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, action] = useActionState(save, {});

  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <IconTile icon={CHANNEL_ICONS[preference.channel]} tone={tone} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{labels.name}</p>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{labels.description}</p>
          {!live ? <p className="mt-1 text-xs text-[var(--wh-foreground-subtle)]">{labels.notConnected}</p> : null}
        </div>
      </div>

      <form action={action} className="space-y-3">
        <input type="hidden" name="householdId" value={householdId} />
        <input type="hidden" name="channel" value={preference.channel} />

        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={preference.enabled}
            className="size-5 rounded border-[var(--wh-border-strong)] accent-[var(--wh-primary)]"
          />
          <span>{labels.sendHere}</span>
        </label>

        {preference.channel === "whatsapp" ? (
          <Field
            label={labels.whatsappNumber}
            name="target"
            type="tel"
            placeholder="+15551234567"
            defaultValue={preference.target ?? ""}
            hint={labels.whatsappHint}
          />
        ) : null}

        {preference.channel === "in_app" ? (
          // In-app quiet hours are the "Quiet hours" card above; carried through unchanged here.
          <>
            <input type="hidden" name="quietFrom" value={preference.quietFrom ?? ""} />
            <input type="hidden" name="quietUntil" value={preference.quietUntil ?? ""} />
            <input type="hidden" name="quietFromMinute" value={preference.quietFromMinute ?? 0} />
            <input type="hidden" name="quietUntilMinute" value={preference.quietUntilMinute ?? 0} />
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Select label={labels.quietFrom} name="quietFrom" defaultValue={preference.quietFrom ?? ""}>
              <option value="">{labels.off}</option>
              {HOURS.map((hour) => (
                <option key={hour} value={hour}>
                  {String(hour).padStart(2, "0")}:00
                </option>
              ))}
            </Select>
            <Select label={labels.quietUntil} name="quietUntil" defaultValue={preference.quietUntil ?? ""}>
              <option value="">{labels.off}</option>
              {HOURS.map((hour) => (
                <option key={hour} value={hour}>
                  {String(hour).padStart(2, "0")}:00
                </option>
              ))}
            </Select>
          </div>
        )}

        {state.error ? <Alert>{state.error}</Alert> : null}
        {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}

        <Submit label={labels.save} pendingLabel={labels.saving} />
      </form>
    </Card>
  );
}
