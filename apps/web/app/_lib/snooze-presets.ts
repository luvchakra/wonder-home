/** The quick snooze choices a reminder offers, in the order they are shown. Shared by the server page and the client row. */
export const PRESET_KEYS = ["in_15_minutes", "in_1_hour", "later_today", "tomorrow_morning", "custom"] as const;
export type SnoozePreset = (typeof PRESET_KEYS)[number];
