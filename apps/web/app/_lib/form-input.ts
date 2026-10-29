import { z } from "zod";

/**
 * Small readers for the fields every Server Action takes from a form (SEC-03):
 * an id is a UUID, a free-text field has a ceiling. A value that fails comes
 * back `null`, so the action refuses with its own, existing message; nothing
 * about the bad value is ever echoed.
 */
const uuid = z.uuid();

export function formUuid(formData: FormData, key: string): string | null {
  const parsed = uuid.safeParse(formData.get(key));
  return parsed.success ? parsed.data : null;
}

/** A string field capped at `max` characters, trimmed. Missing is "", too long is `null`. */
export function formText(formData: FormData, key: string, max: number): string | null {
  const raw = formData.get(key);
  if (raw === null) return "";
  const parsed = z.string().max(max).safeParse(raw);
  return parsed.success ? parsed.data.trim() : null;
}
