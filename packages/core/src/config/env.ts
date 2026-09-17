import { z } from "zod";

/**
 * WonderHome environment contract.
 *
 * Configuration is validated, not assumed: a missing or malformed value fails
 * fast with an actionable message naming the variable and where to set it
 * (backlogs/00, stories 00-004 and 00-010) rather than surfacing later as an
 * opaque runtime error.
 *
 * Public values are read through literal `process.env.NEXT_PUBLIC_*` property
 * accesses so Next.js can inline them into the client bundle. Server-only
 * values are never referenced from a module that reaches the browser.
 */

const urlSchema = z.url({ error: "must be an absolute URL, e.g. https://<ref>.supabase.co" });
const keySchema = z.string().min(20, { error: "looks too short to be a Supabase key" });

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: urlSchema,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: keySchema,
});

const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: keySchema,
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Formats a Zod failure into a message that says what to fix and where. */
export function formatEnvError(scope: string, error: z.ZodError): string {
  const lines = error.issues.map((issue) => {
    const name = issue.path.join(".") || "(root)";
    return `  - ${name}: ${issue.message}`;
  });
  return [
    `Invalid ${scope} configuration for WonderHome:`,
    ...lines,
    "Set these in .env.local for local development (see .env.example).",
  ].join("\n");
}

/** Validates the public (browser-safe) configuration. Throws if unusable. */
export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const result = publicEnvSchema.safeParse(source);
  if (!result.success) throw new Error(formatEnvError("public", result.error));
  return result.data;
}

/** Validates the server-only configuration. Throws if unusable. */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) throw new Error(formatEnvError("server", result.error));
  return result.data;
}

export function publicEnv(): PublicEnv {
  return parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

export function serverEnv(): ServerEnv {
  return parseServerEnv({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}
