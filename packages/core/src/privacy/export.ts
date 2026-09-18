import type { Permission } from "../identity/permissions";

/**
 * What a copy of your data contains (story 15-007).
 *
 * The rule that shapes everything here: **an export may not become a way to
 * read what you could not read.** It is the same data the screens would show
 * this person, in a file. So the export is assembled with the member's own
 * RLS-scoped client and each section additionally declares the permission it
 * needs — belt and braces, because an export is a single request that touches
 * every table at once, which is exactly the shape of request where one missing
 * policy becomes a whole household's finances in a child's downloads folder.
 *
 * The sections are declared as data rather than written as a sequence of
 * queries so that "what is in an export" is a list somebody can read and
 * check, and so the Privacy Centre can tell a person what they are about to
 * receive before they ask for it.
 */

export type ExportSection = {
  key: string;
  /** What this is, in the household's terms. */
  label: string;
  /** The table it comes from. */
  table: string;
  /** Columns to include. Never `*`: a new sensitive column must be opted in. */
  columns: readonly string[];
  /**
   * How the rows are narrowed. `household` takes everything in the household,
   * `member` only rows belonging to the person the export is about, and
   * `member_via` rows that reach the person through one hop — a message
   * belongs to a session, and the session is what carries the member.
   */
  scope: "household" | "member" | "member_via";
  /** The column that carries the member id, when the scope is `member`. */
  memberColumn?: string;
  /** The hop, when the scope is `member_via`. */
  via?: { table: string; idColumn: string; memberColumn: string; localColumn: string };
  /** Withheld from anyone without this. */
  requires?: Permission;
};

/**
 * Deliberately not everything.
 *
 * Absent by design: `household_ai_credentials` (a key is not data about you,
 * it is a key), `audit_events` (the trail exists so a household can check what
 * happened, and a trail you can carry off is one you can be pressured to hand
 * over), `step_up_verifications` and `idempotency_keys` (machinery), and the
 * token digests on invitations. A person who wants the audit trail reads it on
 * the Activity screen, where it stays in the household it describes.
 */
export const EXPORT_SECTIONS: readonly ExportSection[] = [
  {
    key: "profile",
    label: "Who you are in this household",
    table: "household_members",
    columns: ["id", "display_name", "member_type", "status", "created_at"],
    scope: "member",
    memberColumn: "id",
  },
  {
    key: "roles",
    label: "What you may do",
    table: "household_roles",
    columns: ["role", "created_at"],
    scope: "member",
    memberColumn: "member_id",
  },
  {
    key: "responsibilities",
    label: "What you look after",
    table: "responsibilities",
    columns: ["outcome_key", "ai_mode", "priority", "created_at", "updated_at"],
    scope: "member",
    memberColumn: "primary_member_id",
  },
  {
    key: "playbook",
    label: "How your home runs",
    table: "playbook_items",
    columns: ["outcome_key", "name", "outcome_definition", "cadence", "operating_window", "active", "created_at"],
    scope: "household",
  },
  {
    key: "policies",
    label: "Your household's rules",
    table: "policies",
    columns: ["category", "name", "rule", "version", "active", "created_at"],
    scope: "household",
  },
  {
    key: "conversations",
    label: "What you said to the assistant",
    table: "conversation_messages",
    columns: ["role", "content", "created_at"],
    // A message carries no member; its session does. Exporting the household's
    // messages instead would hand somebody every private conversation in the
    // house, which is the exact opposite of what this file is for.
    scope: "member_via",
    via: {
      table: "conversation_sessions",
      idColumn: "id",
      memberColumn: "member_id",
      localColumn: "session_id",
    },
  },
  {
    key: "memories",
    label: "What WonderHome learned about your home",
    table: "memories",
    columns: ["scope", "category", "key", "value", "status", "source_type", "created_at"],
    scope: "household",
  },
  {
    key: "notifications",
    label: "What you were told, and when",
    table: "notifications",
    columns: ["type", "priority", "title", "body", "status", "created_at", "seen_at"],
    scope: "member",
    memberColumn: "recipient_member_id",
  },
  {
    key: "availability",
    label: "When you said you were away",
    table: "availability_exceptions",
    columns: ["on_date", "available", "start_time", "end_time", "reason", "created_at"],
    scope: "member",
    memberColumn: "member_id",
  },
  {
    key: "obligations",
    label: "Bills and what was owed",
    table: "obligations",
    columns: ["name", "kind", "payee", "amount_minor", "currency", "due_on", "status", "created_at"],
    scope: "household",
    requires: "finance.view",
  },
  {
    key: "orders",
    label: "What was ordered",
    table: "orders",
    columns: ["provider", "status", "total_minor", "currency", "created_at"],
    scope: "household",
    requires: "finance.view",
  },
  {
    key: "integrations",
    label: "Accounts connected to your household",
    table: "integrations",
    columns: ["kind", "provider", "status", "created_at"],
    scope: "household",
    requires: "integrations.manage",
  },
];

/** The sections this person may actually receive. */
export function sectionsFor(permissions: readonly Permission[]): ExportSection[] {
  const held = new Set(permissions);
  return EXPORT_SECTIONS.filter((section) => !section.requires || held.has(section.requires));
}

/** What the Privacy Centre says is in the file, before anybody asks for it. */
export function describeExport(permissions: readonly Permission[]): string[] {
  const included = sectionsFor(permissions).map((section) => section.label);
  const withheld = EXPORT_SECTIONS.filter(
    (section) => section.requires && !permissions.includes(section.requires),
  );

  return [
    `Your copy will contain: ${included.join("; ")}.`,
    withheld.length > 0
      ? `Not included, because your household role does not cover it: ${withheld.map((section) => section.label.toLowerCase()).join("; ")}.`
      : "Nothing is held back — your role covers everything WonderHome exports.",
    "Never included: keys and passwords, and the household's audit trail, which stays in the household it describes.",
  ];
}

export type ExportFile = {
  /** Fixed, so an export from a year ago can still be read. */
  formatVersion: 1;
  generatedAt: string;
  household: { id: string; name: string };
  subject: { memberId: string; displayName: string };
  /** Present so a reader knows what was withheld rather than absent. */
  withheldSections: { label: string; because: string }[];
  sections: Record<string, unknown[]>;
};

/**
 * The name the file arrives under.
 *
 * Dated, because a person who exports twice wants to know which is which, and
 * a download called `export.json` is indistinguishable from every other one in
 * the folder.
 */
export function exportFilename(householdName: string, at: Date): string {
  const slug = householdName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "household";
  return `wonderhome-${slug}-${at.toISOString().slice(0, 10)}.json`;
}
