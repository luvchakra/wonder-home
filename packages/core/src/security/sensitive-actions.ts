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
    event: "household.updated",
    because: "Changes something every member's own record is read against — who the household's Key Member is, so far.",
    recordedIn: "packages/core/src/identity/households.ts",
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
    event: "subscription.changed",
    because: "Changes what the household may do. Somebody will ask when a capability stopped, and why.",
    recordedIn: "packages/core/src/billing/repository.ts",
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
  { event: "integration.disconnected", story: "nothing disconnects an account yet; module 17" },
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
    case "subscription.changed":
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
