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
import { sendTestNotificationAction } from "../(auth)/notification-preferences-actions";

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

/** Minutes after midnight as "HH:MM", the value the time picker uses. */
function clockOf(minute: number | undefined): string {
  const total = minute ?? 450;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

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
  /** The morning summary on this channel (story 27-008). */
  digest: string;
  digestHint: string;
  digestAt: string;
  off: string;
  save: string;
  saving: string;
};

/** Whether this channel will reach the person and, when it may not, why in plain words (story 27-003). */
export type ChannelCheckView = {
  /** Delivery switched this channel off on its own, and why (story 27-009). */
  notice?: string;
  ready: string;
  problems: string;
  reasons: string[];
  /** A test can be sent from this card (email and WhatsApp; push has its own on this device). */
  testable: boolean;
  sendTest: string;
  sending: string;
  testSent: string;
};

function TestButton({ householdId, channel, view }: { householdId: string; channel: DeliveryChannel; view: ChannelCheckView }) {
  const [state, action] = useActionState<ActionState, FormData>(sendTestNotificationAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="channel" value={channel} />
      <TestSubmit label={view.sendTest} pendingLabel={view.sending} />
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.notice === "sent" ? <Alert tone="info">{view.testSent}</Alert> : null}
    </form>
  );
}

function TestSubmit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="quiet" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

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
  check,
  digestTimes,
  save,
}: {
  householdId: string;
  tone: IconTone;
  preference: ChannelPreference;
  live: boolean;
  labels: ChannelPreferenceLabels;
  check?: ChannelCheckView;
  /** The times a morning summary can go, on the household's clock; offered on the channels beyond the app. */
  digestTimes?: { value: string; label: string }[];
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

        {digestTimes && preference.channel !== "in_app" ? (
          <div className="space-y-2">
            <label className="flex min-h-11 items-start gap-3 text-sm">
              <input type="checkbox" name="digest" defaultChecked={preference.digest === true} className="mt-0.5 size-5 shrink-0 rounded border-[var(--wh-border-strong)] accent-[var(--wh-primary)]" />
              <span>
                {labels.digest}
                <span className="block text-xs text-[var(--wh-foreground-muted)]">{labels.digestHint}</span>
              </span>
            </label>
            <Select label={labels.digestAt} name="digestAt" defaultValue={clockOf(preference.digestMinute)}>
              {digestTimes.map((time) => (
                <option key={time.value} value={time.value}>
                  {time.label}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        {state.error ? <Alert>{state.error}</Alert> : null}
        {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}

        <Submit label={labels.save} pendingLabel={labels.saving} />
      </form>

      {check?.notice ? <Alert tone="attention">{check.notice}</Alert> : null}

      {check ? (
        <div className="space-y-2 border-t border-[var(--wh-border)] pt-3 text-sm">
          {check.reasons.length === 0 ? (
            <p className="text-[var(--wh-foreground-muted)]">{check.ready}</p>
          ) : (
            <>
              <p className="font-medium">{check.problems}</p>
              <ul className="list-disc space-y-1 ps-5 text-[var(--wh-foreground-muted)]">
                {check.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </>
          )}
          {check.testable ? <TestButton householdId={householdId} channel={preference.channel} view={check} /> : null}
        </div>
      ) : null}
    </Card>
  );
}
