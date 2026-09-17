import { z } from "zod";

/**
 * Feature configuration (story 00-010).
 *
 * Flags gate *rollout*, never authorization. A flag that is off must not be the
 * only thing standing between a member and data they may not see — entitlement
 * and permission checks are separate and server-side (module 20 and the
 * security baseline). Keeping that line explicit here is the point of the file.
 */

export const FLAG_DEFINITIONS = {
  /** Voice capture in the conversation surface (module 04). */
  voice_conversation: { default: false, description: "Speech input and conversational voice" },
  /** Proactive background agent runs (module 14). */
  proactive_agents: { default: false, description: "Background plan/execute/monitor loop" },
  /** WhatsApp as a notification channel (module 06/17). */
  whatsapp_channel: { default: false, description: "WhatsApp notification adapter" },
} as const satisfies Record<string, { default: boolean; description: string }>;

export type FlagName = keyof typeof FLAG_DEFINITIONS;

const BOOLEANS: Record<string, boolean> = {
  "1": true,
  true: true,
  on: true,
  yes: true,
  "0": false,
  false: false,
  off: false,
  no: false,
};

export const flagValueSchema = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .refine((value) => value in BOOLEANS, {
    error: `must be one of ${Object.keys(BOOLEANS).join(", ")}`,
  })
  .transform((value) => BOOLEANS[value] as boolean);

export function flagEnvName(flag: FlagName): string {
  return `WONDERHOME_FLAG_${flag.toUpperCase()}`;
}

/**
 * Resolves every flag. An unparseable value is a configuration error, not a
 * silent false — a typo in a deployment variable should be loud.
 */
export function resolveFlags(source: Record<string, string | undefined>): Record<FlagName, boolean> {
  const resolved = {} as Record<FlagName, boolean>;
  const problems: string[] = [];

  for (const flag of Object.keys(FLAG_DEFINITIONS) as FlagName[]) {
    const raw = source[flagEnvName(flag)];
    if (raw === undefined || raw === "") {
      resolved[flag] = FLAG_DEFINITIONS[flag].default;
      continue;
    }
    const parsed = flagValueSchema.safeParse(raw);
    if (!parsed.success) {
      problems.push(`  - ${flagEnvName(flag)}: ${parsed.error.issues[0]?.message ?? "invalid value"}`);
      continue;
    }
    resolved[flag] = parsed.data;
  }

  if (problems.length > 0) {
    throw new Error(["Invalid feature flag configuration for WonderHome:", ...problems].join("\n"));
  }

  return resolved;
}

export function flags(): Record<FlagName, boolean> {
  return resolveFlags(process.env as Record<string, string | undefined>);
}
