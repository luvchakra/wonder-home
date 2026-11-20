/** What the reset action answers (story 15-014): a code the screen turns into words in the person's language. */
export const RESET_ERROR_CODES = ["invalid", "not_owner", "name_mismatch", "wrong", "reauth", "limited", "unavailable", "not_available", "failed"] as const;
export type ResetErrorCode = (typeof RESET_ERROR_CODES)[number];
export type ResetState = { code?: ResetErrorCode };
