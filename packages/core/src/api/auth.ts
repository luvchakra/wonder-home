import { getVerifiedUser } from "../db/server";
import { ApiError } from "./errors";

/**
 * Authentication for /api/v1 handlers.
 *
 * The session token is verified locally against the project's signing keys
 * (see db/server.ts) rather than by asking the auth server per request, so a
 * forged or stale session still cannot pass — and a valid one costs nothing
 * on the wire. Authentication is only the first gate: household scope, role
 * and autonomy policy are checked separately by the domain services that
 * need them (architecture/SECURITY-BASELINE.md — server-side authorization is
 * authoritative, and RLS is defense in depth behind it).
 */
export type AuthenticatedActor = {
  userId: string;
  email: string | null;
};

export async function requireUser(): Promise<AuthenticatedActor> {
  const user = await getVerifiedUser();
  if (!user) throw ApiError.unauthenticated();

  return { userId: user.id, email: user.email };
}
