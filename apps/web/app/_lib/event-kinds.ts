/**
 * The kinds of family-calendar event the "Add to the family calendar" sheet
 * offers. Kept outside the sheet's `"use client"` module so server code can
 * read the list too (a client module hands the server only components).
 */
export const EVENT_KINDS = ["family_time", "outing", "birthday", "special_occasion", "visit", "travel", "appointment", "other"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
