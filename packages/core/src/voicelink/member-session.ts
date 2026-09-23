import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

import { publicEnv } from "../config/env";

/**
 * The linked member's own session, for exactly one voice turn (voice
 * phase 2, "do not weaken RLS").
 *
 * A voice request carries no browser cookie, and the admin client would read
 * past every row-level policy — a child's linked speaker must not hear what
 * the admin client can see. So the turn runs as the member themself: Supabase
 * Auth issues a one-time sign-in token for their account (the same mechanism
 * a magic-link email uses, without the email), it is exchanged for a real
 * session here on the server, the turn runs under that session's RLS, and the
 * session is signed out when the turn ends. Nothing about it is stored, and it
 * never leaves this function.
 */
export async function withMemberSession<T>(admin: SupabaseClient, profileId: string, run: (supabase: SupabaseClient) => Promise<T>): Promise<T> {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } = publicEnv();

  const { data: user, error: userError } = await admin.auth.admin.getUserById(profileId);
  const email = user?.user?.email;
  if (userError || !email) throw new Error("member session: account not found");

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) throw new Error("member session: could not issue a one-time token");

  const exchange = createSupabaseClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: verified, error: verifyError } = await exchange.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  const session = verified?.session;
  if (verifyError || !session || verified.user?.id !== profileId) throw new Error("member session: sign-in did not resolve to the member");

  const member = createSupabaseClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  });
  // `requireMembership` and friends ask auth for the user; answer from this session.
  await member.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token }).catch(() => undefined);

  try {
    return await run(member);
  } finally {
    await admin.auth.admin.signOut(session.access_token, "local").catch(() => undefined);
  }
}
