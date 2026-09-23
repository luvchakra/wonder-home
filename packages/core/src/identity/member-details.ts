/**
 * The answers a household is offered for a member's gender. Offered, not
 * enforced: the column is open text and the picker always lets another
 * answer be written in (CLAUDE.md rule 20), so this list is a convenience,
 * never the boundary of what is true.
 */
export const GENDER_OPTIONS = ["Female", "Male", "Non-binary", "Prefer not to say"] as const;

/** The limits the database holds these to, so a form can say so before a round trip does. */
export const GENDER_MAX_LENGTH = 40;
export const MEMBER_NOTES_MAX_LENGTH = 500;
