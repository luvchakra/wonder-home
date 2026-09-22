/**
 * The outbound event shape (story 18-007).
 *
 * `eventVersion` follows the same fixed-literal pattern
 * `privacy/export.ts`'s `ExportFile.formatVersion` already uses: a number a
 * subscriber's own code can branch on, so a payload from today is still
 * readable by code written against an older version.
 *
 * The event types below are a deliberately small starting set — the
 * household actions already flowing through `auditChange`/`recordAuditEvent`
 * (`api/audit.ts`'s `AUDIT_EVENTS`) that another system plausibly wants to
 * react to in real time: someone joined or left, the plan changed, a
 * deletion finished, HomeSend routed something. `invitation.accepted` is
 * deliberately not one of these — its `recordAuditEvent` call happens
 * inside a SQL function (`wh.accept_invitation`), not application code, so
 * there is no TypeScript call site to dispatch a webhook event from without
 * either duplicating that SQL logic or adding a second round trip; the
 * `member.added` event fired from `identity/invitations.ts` right after
 * already covers "someone joined" for a subscriber's purposes. Adding
 * another event type later means adding it here and calling
 * `dispatchWebhookEvent` at that event's own call site — the same "declare,
 * then wire" shape `sensitive-actions.ts` already uses for the audit trail.
 */

export const WEBHOOK_EVENT_VERSION = 1 as const;

export const WEBHOOK_EVENT_TYPES = [
  "member.added",
  "member.removed",
  "subscription.changed",
  "privacy.deletion_fulfilled",
  "homesend.applied",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export type WebhookEventEnvelope = {
  eventVersion: typeof WEBHOOK_EVENT_VERSION;
  eventId: string;
  eventType: WebhookEventType;
  householdId: string;
  occurredAt: string;
  data: Record<string, unknown>;
};

export function isWebhookEventType(value: string): value is WebhookEventType {
  return (WEBHOOK_EVENT_TYPES as readonly string[]).includes(value);
}
