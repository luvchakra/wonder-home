import { settingDefinition } from "./registry";
import type { StoredSettings } from "./runtime-env";

/** Only registry keys, each as the reader expects it: what `runtimeEnv()` lays over the environment. */
export function overlayOf(rows: StoredSettings): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(rows)) {
    const entry = settingDefinition(key);
    if (!entry || typeof value !== "string") continue;
    out[key] = entry.emptyWhen !== undefined && value === entry.emptyWhen ? "" : value;
  }
  return out;
}
