import type { AuditEventType } from "../api/audit";

/**
 * Which household actions leave a trail, and where each one is recorded
 * (story 15-006).
 *
 * The catalogue exists because of a specific failure mode. `AUDIT_EVENTS`
 * names the events the trail can hold, but naming an event is not recording
 * it, and an administrator reading a trail that quietly omits half of what
 * happened concludes that nothing happened. That is worse than no trail: a
 * gap in a record people trust reads as evidence of absence.
 *
 * So every sensitive action is declared here with the file that records it,
 * and `sensitive-actions.test.ts` opens that file and checks the event is
 * actually written. A declared action nobody emits fails the build. Adding an
 * action to the audit enum without wiring it up is no longer possible to do
 * quietly, which is the whole point.
 *
 * What counts as sensitive: anything that changes who may see or do what,
 * anything that moves money, anything that reaches outside the household, and
 * anything a person would want to be able to ask about afterwards.
 */

export type SensitiveAction = {
  event: AuditEventType;
  /** Why this one is sensitive. The reasoning, not a restatement. */
  because: string;
  /**
   * The file that writes it, relative to the repository root. Checked by the
   * coverage test — a path that no longer records this event fails.
   */
  recordedIn: string;
};

export const SENSITIVE_ACTIONS: readonly SensitiveAction[] = [
  {
    event: "household.created",
    because: "The beginning of everything else in the trail.",
    recordedIn: "supabase/migrations/20260917005443_identity_rls_and_creation.sql",
  },
  {
    event: "member.added",
    because: "One more person can now see the household.",
    recordedIn: "packages/core/src/identity/invitations.ts",
  },
  {
    event: "member.role_granted",
    because: "Changes what somebody may do, including to other people.",
    recordedIn: "packages/core/src/identity/households.ts",
  },
  {
    event: "member.role_revoked",
    because: "Takes away access. The person it happened to will want to know when.",
    recordedIn: "packages/core/src/identity/households.ts",
  },
  {
    event: "member.profile_updated",
    because: "Someone's own details — name, birthdate, relationship — changed on their behalf.",
    recordedIn: "packages/core/src/identity/households.ts",
  },
  {
    event: "member.locale_updated",
    because: "How WonderHome speaks to someone changed, possibly set for them by an Admin.",
    recordedIn: "packages/core/src/i18n/repository.ts",
  },
  {
    event: "household.locale_updated",
    because: "The household's region, currency, time zone or default language changed for everyone.",
    recordedIn: "packages/core/src/i18n/repository.ts",
  },
  {
    event: "invitation.created",
    because: "An outstanding invitation is a way into the household.",
    recordedIn: "packages/core/src/identity/invitations.ts",
  },
  {
    event: "invitation.revoked",
    because: "Closing that way in is as worth recording as opening it.",
    recordedIn: "packages/core/src/identity/invitations.ts",
  },
  {
    event: "invitation.accepted",
    because: "The moment a token became a member.",
    recordedIn: "supabase/migrations/20260917010739_household_invitations.sql",
  },
  {
    event: "child.created",
    because: "A child's record is the most protected thing the household holds.",
    recordedIn: "supabase/migrations/20260917011744_child_profiles_and_guardians.sql",
  },
  {
    event: "playbook.updated",
    because: "Changes what WonderHome plans for and when it speaks up.",
    recordedIn: "packages/core/src/household/configuration-repository.ts",
  },
  {
    event: "responsibility.updated",
    because: "Changes who is accountable and how far WonderHome may act alone.",
    recordedIn: "packages/core/src/household/configuration-repository.ts",
  },
  {
    event: "policy.updated",
    because: "The household's own rules, including what may be sent to a model provider.",
    recordedIn: "packages/core/src/household/configuration-repository.ts",
  },
  {
    event: "integration.connected",
    because: "Household data now flows to or from somewhere outside it.",
    recordedIn: "packages/core/src/integrations/repository.ts",
  },
  {
    event: "integration.disconnected",
    because: "Household data stops flowing to or from a provider — a decision someone made about the household.",
    recordedIn: "packages/core/src/integrations/repository.ts",
  },
  {
    event: "ai.key_set",
    because: "Changes which company's servers answer for this household.",
    recordedIn: "packages/core/src/ai/credentials.ts",
  },
  {
    event: "ai.key_removed",
    because: "Sends the household back to the platform key, under different terms.",
    recordedIn: "packages/core/src/ai/credentials.ts",
  },
  {
    event: "voice.key_set",
    because: "Moves who hears this household from WonderHome's speech service to the family's own Google account.",
    recordedIn: "packages/core/src/voice/repository.ts",
  },
  {
    event: "voice.key_removed",
    because: "Moves it back again, under different terms with the provider.",
    recordedIn: "packages/core/src/voice/repository.ts",
  },
  {
    event: "voice.settings_changed",
    because: "Decides whether what is said out loud leaves the browser at all, and in which language.",
    recordedIn: "packages/core/src/voice/repository.ts",
  },
  {
    event: "privacy.export_requested",
    because: "A copy of household data left the household. Somebody will ask when, and who asked for it.",
    recordedIn: "packages/core/src/privacy/repository.ts",
  },
  {
    event: "privacy.deletion_requested",
    because: "Starts a clock that ends with data gone. The grace window only helps if the household can see it running.",
    recordedIn: "packages/core/src/privacy/repository.ts",
  },
  {
    event: "privacy.deletion_cancelled",
    because: "Stopping the clock matters as much as starting it, and proves the window was real.",
    recordedIn: "packages/core/src/privacy/repository.ts",
  },
  {
    event: "privacy.deletion_fulfilled",
    because: "The moment the grace window ends and a member's data is actually scrubbed — the thing the earlier clock was counting down to.",
    recordedIn: "packages/core/src/privacy/fulfill-deletion.ts",
  },
  {
    event: "privacy.request_refused",
    because: "Staff said no to a household's own export or deletion request. The household is owed a reason and a record of when.",
    recordedIn: "packages/core/src/platform/privacy-requests.ts",
  },
  {
    event: "subscription.changed",
    because: "Changes what the household may do. Somebody will ask when a capability stopped, and why.",
    recordedIn: "packages/core/src/billing/repository.ts",
  },
  {
    event: "developer_key.created",
    because: "An app outside WonderHome was given a way in. The household can see who made the key and what it may do.",
    recordedIn: "packages/core/src/developer/keys.ts",
  },
  {
    event: "developer_key.revoked",
    because: "A way in was closed. Somebody will ask when an app stopped working, and who stopped it.",
    recordedIn: "packages/core/src/developer/keys.ts",
  },
  {
    event: "payment.refund_requested",
    because: "Platform staff sent money back to the household. The family can see who asked, why and how much.",
    recordedIn: "packages/core/src/platform/payments.ts",
  },
  {
    event: "support.access_granted",
    because: "Somebody outside the family was allowed in. The family can read this row.",
    recordedIn: "packages/core/src/platform/admin.ts",
  },
  {
    event: "feature_flag.changed",
    because: "Staff turned an experimental capability on or off for this household. The family can read this row.",
    recordedIn: "packages/core/src/platform/feature-flags.ts",
  },
  {
    event: "homesend.intake_received",
    because: "External content — a photo, file or pasted forward — entered the household from outside HomeTalk.",
    recordedIn: "packages/core/src/homesend/repository.ts",
  },
  {
    event: "homesend.security_rejected",
    because: "An upload's bytes did not match what it claimed to be. The household should be able to ask what was sent and why it was refused.",
    recordedIn: "packages/core/src/homesend/repository.ts",
  },
  {
    event: "homesend.applied",
    because: "A bill, school item or grocery item was written from outside content, not typed in by hand.",
    recordedIn: "packages/core/src/homesend/changes.ts",
  },
  {
    event: "homesend.dismissed",
    because: "A household decided something sent in was not worth acting on — as worth recording as acting on it.",
    recordedIn: "packages/core/src/homesend/repository.ts",
  },
  {
    event: "homesend.undone",
    because: "A HomeSend write was reversed. The reversal is a change to household data, same as the write it undoes.",
    recordedIn: "packages/core/src/homesend/changes.ts",
  },
  {
    event: "homesend.address_created",
    because: "A standing address that can write into this household exists from this moment on.",
    recordedIn: "packages/core/src/homesend/addresses.ts",
  },
  {
    event: "homesend.address_rotated",
    because: "The old address stops working and a new one starts — worth knowing when, the same as any other credential change.",
    recordedIn: "packages/core/src/homesend/addresses.ts",
  },
  {
    event: "homesend.address_revoked",
    because: "Closing the household's own way in by email is as worth recording as opening it.",
    recordedIn: "packages/core/src/homesend/addresses.ts",
  },
  {
    event: "webhook.subscription_created",
    because: "A signing secret that can authenticate outbound household events to an external system now exists.",
    recordedIn: "packages/core/src/webhooks/repository.ts",
  },
  {
    event: "webhook.secret_rotated",
    because: "The old secret stops working and a new one starts — worth knowing when, the same as any other credential change.",
    recordedIn: "packages/core/src/webhooks/repository.ts",
  },
  {
    event: "hometalk.executed",
    because: "Something said or typed to WonderHome changed the household — recorded with the channel it came through, so a voice assistant's change is told apart from the app's.",
    recordedIn: "packages/core/src/conversation/repository.ts",
  },
  {
    event: "voice_link.created",
    because: "A voice assistant can now speak for a member of this household, within the scopes they chose.",
    recordedIn: "apps/web/app/(auth)/voice-link-actions.ts",
  },
  {
    event: "voice_link.revoked",
    because: "A voice assistant stopped speaking for a member — every token it held stopped at once.",
    recordedIn: "apps/web/app/(auth)/voice-link-actions.ts",
  },
  {
    event: "whatsapp.connect_requested",
    because: "Someone asked for a one-time code that links a WhatsApp number to them in this household.",
    recordedIn: "apps/web/app/(auth)/whatsapp-actions.ts",
  },
  {
    event: "whatsapp.linked",
    because: "A WhatsApp number can now send things into this household's HomeSend as coming from a member.",
    recordedIn: "packages/core/src/whatsapp/intake.ts",
  },
  {
    event: "whatsapp.disconnected",
    because: "A WhatsApp number stopped reaching this household — nothing it sends is taken in any more.",
    recordedIn: "apps/web/app/(auth)/whatsapp-actions.ts",
  },
  {
    event: "webhook.subscription_disabled",
    because: "Stops an external system receiving this household's events. As worth recording as turning it on.",
    recordedIn: "packages/core/src/webhooks/repository.ts",
  },
  {
    event: "webhook.subscription_enabled",
    because: "Resumes sending this household's events to an external system.",
    recordedIn: "packages/core/src/webhooks/repository.ts",
  },
  {
    event: "health.profile_updated",
    because: "Changes who can see a member's health data or whether AI may help manage it — the privacy scope every later health entity is gated by.",
    recordedIn: "packages/core/src/health/repository.ts",
  },
  {
    event: "health.consent_granted",
    because: "Widens who can see a subject's selected_family health data — a deliberate exception to their own default privacy scope.",
    recordedIn: "packages/core/src/health/repository.ts",
  },
  {
    event: "health.consent_revoked",
    because: "Narrows health-data visibility back down — as worth recording as the grant it undoes.",
    recordedIn: "packages/core/src/health/repository.ts",
  },
  {
    event: "health.appointment_created",
    because: "A new health commitment for a member — who, when, and (when disclosed) why.",
    recordedIn: "packages/core/src/health/appointments.ts",
  },
  {
    event: "health.appointment_updated",
    because: "Changes an appointment's own details — provider, notes, reminder preferences.",
    recordedIn: "packages/core/src/health/appointments.ts",
  },
  {
    event: "health.appointment_status_changed",
    because: "Confirming, completing, cancelling or rescheduling an appointment — each one changes what the household believes is still coming up.",
    recordedIn: "packages/core/src/health/appointments.ts",
  },
  {
    event: "health.issue_created",
    because: "A new health observation about a member — who, and (when disclosed) what.",
    recordedIn: "packages/core/src/health/issues.ts",
  },
  {
    event: "health.issue_updated",
    because: "Changes an observation's own content — label, description, notes.",
    recordedIn: "packages/core/src/health/issues.ts",
  },
  {
    event: "health.issue_status_changed",
    because: "Moving an issue through its lifecycle — mentioned, active, monitoring, resolved, closed — is how the household tracks what is still being watched.",
    recordedIn: "packages/core/src/health/issues.ts",
  },
  {
    event: "health.checkup_created",
    because: "A new recurring preventive-care commitment for a member — who, what, and how often.",
    recordedIn: "packages/core/src/health/checkups.ts",
  },
  {
    event: "health.checkup_updated",
    because: "Changes a checkup's own content — label, type, cadence, notes.",
    recordedIn: "packages/core/src/health/checkups.ts",
  },
  {
    event: "health.checkup_rescheduled",
    because: "Moves when a checkup is next due — worth recording as the schedule change it is.",
    recordedIn: "packages/core/src/health/checkups.ts",
  },
  {
    event: "health.checkup_completed",
    because: "Marks a checkup done and, when a cadence is configured, advances it to its next occurrence.",
    recordedIn: "packages/core/src/health/checkups.ts",
  },
  {
    event: "health.checkup_dismissed",
    because: "Removes a checkup the household no longer wants tracked — reversible, but still a change worth recording.",
    recordedIn: "packages/core/src/health/checkups.ts",
  },
  {
    event: "health.checkup_reactivated",
    because: "Brings back a checkup that had been removed.",
    recordedIn: "packages/core/src/health/checkups.ts",
  },
  {
    event: "health.record_created",
    because: "A health document filed against a member — by hand or confirmed from HomeSend.",
    recordedIn: "packages/core/src/health/records.ts",
  },
  {
    event: "health.record_updated",
    because: "Changes a record's own content — label, type, document date, notes.",
    recordedIn: "packages/core/src/health/records.ts",
  },
  {
    event: "health.record_archived",
    because: "Removes a record the household no longer wants filed — reversible, but still a change worth recording.",
    recordedIn: "packages/core/src/health/records.ts",
  },
  {
    event: "health.record_reactivated",
    because: "Brings back a record that had been archived.",
    recordedIn: "packages/core/src/health/records.ts",
  },
  {
    event: "health.vital_recorded",
    because: "A new structured reading for a member — who, what was measured, and by hand or through HomeTalk.",
    recordedIn: "packages/core/src/health/vitals.ts",
  },
  {
    event: "health.vital_updated",
    because: "Corrects a reading's own content — value, unit, notes.",
    recordedIn: "packages/core/src/health/vitals.ts",
  },
  {
    event: "health.vital_archived",
    because: "Removes a mis-entered reading — reversible, but still a change worth recording.",
    recordedIn: "packages/core/src/health/vitals.ts",
  },
  {
    event: "health.vital_reactivated",
    because: "Brings back a reading that had been archived.",
    recordedIn: "packages/core/src/health/vitals.ts",
  },
  {
    event: "health.routine_created",
    because: "A new recurring measurement commitment for a member — who, what, and how often.",
    recordedIn: "packages/core/src/health/measurement-routines.ts",
  },
  {
    event: "health.routine_updated",
    because: "Changes a routine's own cadence, reminder policy or content.",
    recordedIn: "packages/core/src/health/measurement-routines.ts",
  },
  {
    event: "health.routine_completed",
    because: "Marks a routine done and records the real reading it represents, advancing it to its next occurrence.",
    recordedIn: "packages/core/src/health/measurement-routines.ts",
  },
  {
    event: "health.routine_dismissed",
    because: "Removes a routine the household no longer wants tracked — reversible, but still a change worth recording.",
    recordedIn: "packages/core/src/health/measurement-routines.ts",
  },
  {
    event: "health.routine_reactivated",
    because: "Brings back a routine that had been removed.",
    recordedIn: "packages/core/src/health/measurement-routines.ts",
  },
  {
    event: "health.fitness_goal_created",
    because: "A new consistency-oriented fitness intention for a member — who, what activity, and how often.",
    recordedIn: "packages/core/src/health/fitness.ts",
  },
  {
    event: "health.fitness_goal_updated",
    because: "Changes a goal's own target, frequency or preferred time.",
    recordedIn: "packages/core/src/health/fitness.ts",
  },
  {
    event: "health.fitness_goal_dismissed",
    because: "Removes a goal the household no longer wants tracked — reversible, but still a change worth recording.",
    recordedIn: "packages/core/src/health/fitness.ts",
  },
  {
    event: "health.fitness_goal_reactivated",
    because: "Brings back a goal that had been removed.",
    recordedIn: "packages/core/src/health/fitness.ts",
  },
  {
    event: "health.fitness_session_logged",
    because: "A new logged activity for a member — who, what, and by hand or through HomeTalk.",
    recordedIn: "packages/core/src/health/fitness.ts",
  },
  {
    event: "health.fitness_session_updated",
    because: "Corrects a session's own content — duration, distance, notes.",
    recordedIn: "packages/core/src/health/fitness.ts",
  },
  {
    event: "health.fitness_session_archived",
    because: "Removes a mis-logged session — reversible, but still a change worth recording.",
    recordedIn: "packages/core/src/health/fitness.ts",
  },
  {
    event: "health.fitness_session_reactivated",
    because: "Brings back a session that had been archived.",
    recordedIn: "packages/core/src/health/fitness.ts",
  },
];

/**
 * Events the enum names for work that is not built yet.
 *
 * Declared here rather than deleted from the enum, because the export and
 * deletion flows (story 15-007) will need them and removing them would mean
 * a migration to add them back. The coverage test asserts this list shrinks
 * to nothing as those stories land, so a permanent exemption is not possible
 * to create by accident.
 */
export const NOT_YET_BUILT: readonly { event: AuditEventType; story: string }[] = [
  { event: "member.removed", story: "removing a member is not built" },
  { event: "child.updated", story: "editing a child's record is not built" },
  {
    event: "household.updated",
    story: "no household-level setting (name, timezone, currency…) is editable yet — the Key Member designation that used to emit this was removed",
  },
];

/**
 * What the household reads in their activity trail.
 *
 * Plain sentences about people, not table names. The trail is for the family
 * whose household it describes, and "responsibility.updated on row 4f2b" is a
 * log line, not an answer to "what changed while I was away".
 */
export function describeAuditEvent(
  event: string,
  metadata: Record<string, unknown> = {},
): { title: string; detail: string | null } {
  switch (event) {
    case "household.created":
      return { title: "Household created", detail: null };
    case "household.updated":
      return { title: "Household settings changed", detail: null };
    case "member.added":
      return { title: "Somebody joined the household", detail: stringOr(metadata.role, null) };
    case "member.removed":
      return { title: "Somebody was removed from the household", detail: null };
    case "member.role_granted":
      return { title: "A role was granted", detail: stringOr(metadata.role, null) };
    case "member.role_revoked":
      return { title: "A role was taken away", detail: stringOr(metadata.role, null) };
    case "member.profile_updated":
      return { title: "A member's details were updated", detail: null };
    case "member.locale_updated":
      return { title: "Someone's language or formats were changed", detail: null };
    case "household.locale_updated":
      return { title: "The household's region, currency or time zone changed", detail: null };
    case "invitation.created":
      return { title: "An invitation was sent", detail: stringOr(metadata.role, null) };
    case "invitation.revoked":
      return { title: "An invitation was cancelled", detail: null };
    case "invitation.accepted":
      return { title: "An invitation was accepted", detail: null };
    case "child.created":
      return { title: "A child was added", detail: null };
    case "child.updated":
      return { title: "A child's details changed", detail: null };
    case "playbook.updated":
      return { title: "The playbook changed", detail: stringOr(metadata.outcomeKey, null) };
    case "responsibility.updated":
      return {
        title: "Who looks after something changed",
        detail: autonomyDetail(metadata),
      };
    case "policy.updated":
      return policyDescription(metadata);
    case "integration.connected":
      return { title: "An account was connected", detail: stringOr(metadata.provider, null) };
    case "integration.disconnected":
      return { title: "An account was disconnected", detail: stringOr(metadata.provider, null) };
    case "ai.key_set":
      return { title: "The household's own AI key was set", detail: stringOr(metadata.provider, null) };
    case "ai.key_removed":
      return { title: "The household's own AI key was removed", detail: "Back to the included assistant." };
    case "voice.key_set":
      return { title: "The household's own speech key was set", detail: stringOr(metadata.provider, null) };
    case "voice.key_removed":
      return { title: "The household's own speech key was removed", detail: "Back to WonderHome's speech service." };
    case "voice.settings_changed":
      return { title: "The household's voice was changed", detail: stringOr(metadata.language, null) };
    case "privacy.export_requested":
      return { title: "A copy of the data was requested", detail: null };
    case "privacy.deletion_requested":
      return {
        title: "Deletion was requested",
        detail: typeof metadata.graceDays === "number" ? `Acts in ${metadata.graceDays} days unless cancelled.` : null,
      };
    case "privacy.deletion_cancelled":
      return { title: "A deletion was called off", detail: null };
    case "privacy.deletion_fulfilled":
      return { title: "A deletion request was fulfilled", detail: "The member's personal details were removed." };
    case "privacy.request_refused":
      return { title: "A privacy request was refused", detail: null };
    case "developer_key.created":
      return {
        title: "A partner key was created",
        detail: Array.isArray(metadata.scopes) ? [stringOr(metadata.environment, null), (metadata.scopes as unknown[]).map(String).join(", ")].filter(Boolean).join(" · ") : null,
      };
    case "developer_key.revoked":
      return { title: "A partner key was revoked", detail: null };
    case "payment.refund_requested":
      return {
        title: "WonderHome support started a refund",
        detail: typeof metadata.amount === "number" && typeof metadata.currency === "string" ? `${metadata.amount} ${metadata.currency}` : null,
      };
    case "subscription.changed":
      // An Admin asking the provider to stop renewing (story 20-010): the plan
      // itself has not changed yet, so this says what did.
      if (metadata.source === "cancel_requested") {
        return { title: "The paid plan was set to end with its current period", detail: stringOr(metadata.to, null) };
      }
      return {
        title: "The household's plan changed",
        detail: [stringOr(metadata.from, null), stringOr(metadata.to, null)].filter(Boolean).join(" → ") || null,
      };
    case "support.access_granted":
      return {
        title: "Support was given access",
        detail: stringOr(metadata.reasonCode, "Read-only unless stated otherwise."),
      };
    case "feature_flag.changed":
      return {
        title: "A feature was turned " + (metadata.enabled ? "on" : "off"),
        detail: stringOr(metadata.flagKey, null),
      };
    case "homesend.intake_received":
      return { title: "Something was sent to HomeSend", detail: stringOr(metadata.source, null) };
    case "homesend.security_rejected":
      return { title: "A HomeSend upload was refused", detail: "It did not read as the file type it claimed to be." };
    case "homesend.applied":
      return { title: "HomeSend added something to the household", detail: stringOr(metadata.intakeId, null) };
    case "homesend.dismissed":
      return { title: "A HomeSend item was dismissed", detail: null };
    case "homesend.undone":
      return { title: "A HomeSend addition was undone", detail: null };
    case "homesend.address_created":
      return { title: "A HomeSend email address was set up", detail: null };
    case "homesend.address_rotated":
      return { title: "The HomeSend email address was rotated", detail: "The old address stopped working." };
    case "homesend.address_revoked":
      return { title: "The HomeSend email address was turned off", detail: null };
    case "webhook.subscription_created":
      return { title: "A webhook was set up", detail: stringOr(metadata.url, null) };
    case "webhook.secret_rotated":
      return { title: "A webhook's signing secret was rotated", detail: "The old secret stopped working." };
    case "hometalk.executed":
      return { title: "WonderHome made a change someone asked for", detail: typeof metadata.source === "string" ? `Asked through ${metadata.source === "web" ? "the app" : metadata.source.replace(/_/g, " ")}${metadata.modality === "voice" ? " by voice" : ""}.` : null };
    case "voice_link.created":
      return { title: "A voice assistant was linked", detail: Array.isArray(metadata.scopes) ? `It may: ${(metadata.scopes as unknown[]).filter((scope): scope is string => typeof scope === "string").join(", ")}` : null };
    case "voice_link.revoked":
      return { title: "A voice assistant was unlinked", detail: "Every token it held stopped working." };
    case "whatsapp.connect_requested":
      return { title: "A WhatsApp connection was started", detail: "A one-time code was issued. Nothing is linked until it is sent from the phone." };
    case "whatsapp.linked":
      return { title: "A WhatsApp number was connected", detail: "What it sends arrives in HomeSend for review." };
    case "whatsapp.disconnected":
      return { title: "A WhatsApp number was disconnected", detail: "What it already sent stays in HomeSend." };
    case "webhook.subscription_disabled":
      return { title: "A webhook was turned off", detail: null };
    case "webhook.subscription_enabled":
      return { title: "A webhook was turned back on", detail: null };
    case "health.profile_updated":
      return { title: "A health profile's settings changed", detail: null };
    case "health.consent_granted":
      return { title: "Health data was shared with another member", detail: null };
    case "health.consent_revoked":
      return { title: "Health-data sharing was revoked", detail: null };
    case "health.appointment_created":
      return { title: "A health appointment was booked", detail: stringOr(metadata.appointmentType, null) };
    case "health.appointment_updated":
      return { title: "A health appointment's details changed", detail: null };
    case "health.appointment_status_changed":
      return { title: "A health appointment's status changed", detail: metadata.to ? `Now ${stringOr(metadata.to, "")}` : null };
    case "health.issue_created":
      return { title: "A health issue was recorded", detail: null };
    case "health.issue_updated":
      return { title: "A health issue's details changed", detail: null };
    case "health.issue_status_changed":
      return { title: "A health issue's status changed", detail: metadata.to ? `Now ${stringOr(metadata.to, "")}` : null };
    case "health.checkup_created":
      return { title: "A checkup was added", detail: stringOr(metadata.checkupType, null) };
    case "health.checkup_updated":
      return { title: "A checkup's details changed", detail: null };
    case "health.checkup_rescheduled":
      return { title: "A checkup's due date changed", detail: stringOr(metadata.nextDueOn, null) };
    case "health.checkup_completed":
      return { title: "A checkup was marked done", detail: stringOr(metadata.nextDueOn, "No repeat — removed.") };
    case "health.checkup_dismissed":
      return { title: "A checkup was removed", detail: null };
    case "health.checkup_reactivated":
      return { title: "A checkup was brought back", detail: null };
    case "health.record_created":
      return { title: "A health record was filed", detail: stringOr(metadata.recordType, null) };
    case "health.record_updated":
      return { title: "A health record's details changed", detail: null };
    case "health.record_archived":
      return { title: "A health record was removed", detail: null };
    case "health.record_reactivated":
      return { title: "A health record was brought back", detail: null };
    case "health.vital_recorded":
      return { title: "A reading was recorded", detail: stringOr(metadata.vitalType, null) };
    case "health.vital_updated":
      return { title: "A reading's details changed", detail: null };
    case "health.vital_archived":
      return { title: "A reading was removed", detail: null };
    case "health.vital_reactivated":
      return { title: "A reading was brought back", detail: null };
    case "health.routine_created":
      return { title: "A measurement routine was set up", detail: stringOr(metadata.vitalType, null) };
    case "health.routine_updated":
      return { title: "A measurement routine's details changed", detail: null };
    case "health.routine_completed":
      return { title: "A measurement routine was marked done", detail: stringOr(metadata.nextDueOn, null) };
    case "health.routine_dismissed":
      return { title: "A measurement routine was removed", detail: null };
    case "health.routine_reactivated":
      return { title: "A measurement routine was brought back", detail: null };
    case "health.fitness_goal_created":
      return { title: "A fitness goal was set", detail: stringOr(metadata.activityType, null) };
    case "health.fitness_goal_updated":
      return { title: "A fitness goal's details changed", detail: null };
    case "health.fitness_goal_dismissed":
      return { title: "A fitness goal was removed", detail: null };
    case "health.fitness_goal_reactivated":
      return { title: "A fitness goal was brought back", detail: null };
    case "health.fitness_session_logged":
      return { title: "A fitness session was logged", detail: stringOr(metadata.activityType, null) };
    case "health.fitness_session_updated":
      return { title: "A fitness session's details changed", detail: null };
    case "health.fitness_session_archived":
      return { title: "A fitness session was removed", detail: null };
    case "health.fitness_session_reactivated":
      return { title: "A fitness session was brought back", detail: null };
    default:
      // An event nobody has described is still shown. A trail that hides what
      // it cannot phrase is a trail with a hole in it.
      return { title: event.replace(/[._]/g, " "), detail: null };
  }
}

/**
 * The data-use policy is the one policy change worth naming on sight: it is
 * the household's answer to "what may leave this house".
 */
function policyDescription(metadata: Record<string, unknown>): { title: string; detail: string | null } {
  const version = typeof metadata.version === "number" ? `Version ${metadata.version}.` : null;

  if (metadata.category === "privacy") {
    return { title: "What the assistant may share changed", detail: version };
  }
  return {
    title: "A household rule changed",
    detail: [stringOr(metadata.category, null), version].filter(Boolean).join(" ") || null,
  };
}

function autonomyDetail(metadata: Record<string, unknown>): string | null {
  const outcome = stringOr(metadata.outcomeKey, null);
  const mode = stringOr(metadata.aiMode, null);
  if (!outcome && !mode) return null;
  return [outcome, mode ? `WonderHome may: ${mode}` : null].filter(Boolean).join(" · ");
}

function stringOr(value: unknown, fallback: string | null): string | null {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}
