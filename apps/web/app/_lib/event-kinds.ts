/**
 * The kinds of family-calendar event the "Add to the family calendar" sheet
 * offers: exactly the kinds the server accepts (`EVENT_KINDS` in the family
 * domain), so no choice in the picker can be refused on save. Re-exported
 * here, outside the sheet's `"use client"` module, so server code can read
 * the list too.
 */
export { EVENT_KINDS, type EventKind } from "@wonderhome/core/family/schedule";
