import { createClient } from "../db/server";
import { ApiError } from "./errors";

/**
 * Authentication for /api/v1 handlers.
 *
 * `getUser()` verifies the token with the auth server rather than trusting a
 * decoded cookie, so a forged or stale session cannot pass as a signed-in
 * member. Authentication is only the first gate: household scope, role and
 * autonomy policy are checked separately by the domain services that need them
 * (architecture/SECURITY-BASELINE.md — server-side authorization is
 * authoritative, and RLS is defense in depth behind it).
 */
export type AuthenticatedActor = {
  userId: string;
  email: string | null;
};

export async function requireUser(): Promise<AuthenticatedActor> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) throw ApiError.unauthenticated();

  return { userId: data.user.id, email: data.user.email ?? null };
}
