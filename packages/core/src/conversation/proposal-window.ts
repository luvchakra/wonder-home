/**
 * How long an action waits for a person (the owner, 2026-11-14): one
 * reminder after 24 hours, closed as not done after 48. Never approved
 * automatically. The sweep is `proposal-expiry.ts`.
 */
export const PROPOSAL_EXPIRY_HOURS = 48;
export const PROPOSAL_REMIND_AFTER_HOURS = 24;
