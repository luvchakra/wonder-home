import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "../../observability/logger";
import { canTransition, type OrderStatus } from "../orders";
import { fixtureInstamart, InstamartRefusal, liveInstamart, McpError, orderStatusFrom, type InstamartCart, type InstamartPayment, type InstamartPort } from "./client";
import { instamartEndpoint, instamartMode, instamartRedirectUri } from "./config";
import { authorizeUrl, exchangeCode, hashState, needsRefresh, newAuthorization, refreshTokens, registerClient, SwiggyAuthError } from "./oauth";

/**
 * Ordering the shopping list on Swiggy Instamart (story 25-032), server side.
 *
 * Everything here runs with the service role, because tokens live where no
 * session can read them — so every function takes the member it acts for
 * from the caller's own verified membership, never from the browser. The
 * rules it keeps:
 *   * only an adult, on their own Swiggy account, ever orders;
 *   * an order is placed only by a tap on the reviewed cart, and only when
 *     Swiggy's cart is still exactly what the person reviewed;
 *   * a placement is attempted once: a double tap finds the same order row
 *     (the household's idempotency key), and a placement whose outcome is
 *     unknown is never retried — the person is told to look in Swiggy first;
 *   * no Swiggy address, phone number or response body is stored.
 */

export const INSTAMART_PROVIDER = "Swiggy Instamart";

export type Actor = { householdId: string; memberId: string; memberType: string };

export type InstamartConnection = { status: "connected" | "needs_reconnect" | "disconnected"; connectedAt: string | null } | null;

export class InstamartUnavailable extends Error {
  constructor(readonly reason: "off" | "not_adult" | "not_connected" | "reconnect") {
    super(`instamart unavailable: ${reason}`);
  }
}

function requireAdult(actor: Actor): void {
  if (instamartMode() === "off") throw new InstamartUnavailable("off");
  if (actor.memberType !== "adult") throw new InstamartUnavailable("not_adult");
}

export async function connectionFor(admin: SupabaseClient, memberId: string): Promise<InstamartConnection> {
  const { data } = await admin.from("instamart_connections").select("status, connected_at").eq("member_id", memberId).maybeSingle();
  const row = data as { status: "connected" | "needs_reconnect" | "disconnected"; connected_at: string } | null;
  return row ? { status: row.status, connectedAt: row.connected_at } : null;
}

// --- Signing in ------------------------------------------------------------------

/** Where to send the person to sign in to Swiggy, with a ten-minute, single-use state. */
export async function startInstamartSignIn(admin: SupabaseClient, actor: Actor, origin: string): Promise<string> {
  requireAdult(actor);
  const redirectUri = instamartRedirectUri(origin);
  const attempt = newAuthorization();
  await admin.from("instamart_oauth_states").delete().eq("member_id", actor.memberId);
  const { error } = await admin.from("instamart_oauth_states").insert({
    state_hash: attempt.stateHash,
    household_id: actor.householdId,
    member_id: actor.memberId,
    code_verifier: attempt.codeVerifier,
    redirect_uri: redirectUri,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) throw new Error(`instamart sign-in state: ${error.code ?? "unknown"}`);
  // The stand-in has no Swiggy page: it comes straight back with a code of its own.
  if (instamartMode() === "fixture") {
    const back = new URL(redirectUri);
    back.searchParams.set("code", "fixture-code");
    back.searchParams.set("state", attempt.state);
    return back.toString();
  }
  const clientId = await clientFor(admin, redirectUri);
  return authorizeUrl({ clientId, redirectUri, state: attempt.state, codeChallenge: attempt.codeChallenge });
}

async function clientFor(admin: SupabaseClient, redirectUri: string): Promise<string> {
  const { data } = await admin.from("instamart_oauth_clients").select("client_id").eq("redirect_uri", redirectUri).maybeSingle();
  const known = (data as { client_id: string } | null)?.client_id;
  if (known) return known;
  const clientId = await registerClient(redirectUri);
  await admin.from("instamart_oauth_clients").upsert({ redirect_uri: redirectUri, client_id: clientId }, { onConflict: "redirect_uri" });
  return clientId;
}

/**
 * Swiggy sent the person back. The state must be one this member started in
 * the last ten minutes; it is spent whatever happens next.
 */
export async function completeInstamartSignIn(admin: SupabaseClient, actor: Actor, input: { state: string; code: string }): Promise<"connected" | "expired" | "refused"> {
  requireAdult(actor);
  const stateHash = hashState(input.state);
  const { data } = await admin.from("instamart_oauth_states").select("member_id, household_id, code_verifier, redirect_uri, expires_at").eq("state_hash", stateHash).maybeSingle();
  await admin.from("instamart_oauth_states").delete().eq("state_hash", stateHash);
  const row = data as { member_id: string; household_id: string; code_verifier: string; redirect_uri: string; expires_at: string } | null;
  if (!row || row.member_id !== actor.memberId || row.household_id !== actor.householdId) return "refused";
  if (Date.parse(row.expires_at) < Date.now()) return "expired";

  let tokens: { accessToken: string; refreshToken: string | null; expiresAt: Date };
  if (instamartMode() === "fixture") {
    tokens = { accessToken: `fixture:${actor.memberId}`, refreshToken: null, expiresAt: new Date(Date.now() + 5 * 86_400_000) };
  } else {
    try {
      const clientId = await clientFor(admin, row.redirect_uri);
      tokens = await exchangeCode({ clientId, code: input.code, codeVerifier: row.code_verifier, redirectUri: row.redirect_uri });
    } catch (thrown) {
      log.warn("instamart sign-in failed", { code: thrown instanceof SwiggyAuthError ? thrown.code : "unknown" });
      return "refused";
    }
  }
  await saveTokens(admin, actor, tokens);
  const now = new Date().toISOString();
  await admin
    .from("instamart_connections")
    .upsert({ member_id: actor.memberId, household_id: actor.householdId, status: "connected", connected_at: now, disconnected_at: null, updated_at: now }, { onConflict: "member_id" });
  return "connected";
}

async function saveTokens(admin: SupabaseClient, actor: Pick<Actor, "householdId" | "memberId">, tokens: { accessToken: string; refreshToken: string | null; expiresAt: Date }): Promise<void> {
  const { error } = await admin.from("instamart_tokens").upsert(
    { member_id: actor.memberId, household_id: actor.householdId, access_token: tokens.accessToken, refresh_token: tokens.refreshToken, expires_at: tokens.expiresAt.toISOString(), updated_at: new Date().toISOString() },
    { onConflict: "member_id" },
  );
  if (error) throw new Error(`instamart tokens: ${error.code ?? "unknown"}`);
}

/** Forgets this member's Swiggy tokens. Their orders stay on record. */
export async function disconnectInstamart(admin: SupabaseClient, actor: Actor): Promise<void> {
  await admin.from("instamart_tokens").delete().eq("member_id", actor.memberId);
  await admin.from("instamart_oauth_states").delete().eq("member_id", actor.memberId);
  const now = new Date().toISOString();
  await admin.from("instamart_connections").update({ status: "disconnected", disconnected_at: now, updated_at: now }).eq("member_id", actor.memberId);
}

// --- Talking to Instamart as this member -----------------------------------------

/** Instamart as this member: their own token, refreshed when it is about to run out. */
export async function instamartFor(admin: SupabaseClient, actor: Actor): Promise<InstamartPort> {
  requireAdult(actor);
  const { data } = await admin.from("instamart_tokens").select("access_token, refresh_token, expires_at").eq("member_id", actor.memberId).maybeSingle();
  const row = data as { access_token: string; refresh_token: string | null; expires_at: string } | null;
  if (!row) throw new InstamartUnavailable("not_connected");
  if (instamartMode() === "fixture") return guarded(admin, actor, fixtureInstamart(actor.memberId));
  let accessToken = row.access_token;
  if (needsRefresh(new Date(row.expires_at))) {
    if (!row.refresh_token) return markReconnect(admin, actor);
    try {
      const fresh = await refreshTokens(row.refresh_token);
      await saveTokens(admin, actor, fresh);
      accessToken = fresh.accessToken;
    } catch {
      return markReconnect(admin, actor);
    }
  }
  return guarded(admin, actor, liveInstamart({ endpoint: instamartEndpoint(), accessToken }));
}

async function markReconnect(admin: SupabaseClient, actor: Actor): Promise<never> {
  await admin.from("instamart_connections").update({ status: "needs_reconnect", updated_at: new Date().toISOString() }).eq("member_id", actor.memberId);
  throw new InstamartUnavailable("reconnect");
}

/** A 401 from Swiggy means the person signs in again; it never looks like an empty cart. */
function guarded(admin: SupabaseClient, actor: Actor, port: InstamartPort): InstamartPort {
  const wrap =
    <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      try {
        const result = await fn(...args);
        void admin.from("instamart_connections").update({ last_used_at: new Date().toISOString() }).eq("member_id", actor.memberId);
        return result;
      } catch (thrown) {
        if (thrown instanceof McpError && thrown.code === "unauthorized") return markReconnect(admin, actor);
        throw thrown;
      }
    };
  return {
    addresses: wrap(port.addresses),
    search: wrap(port.search),
    setCart: wrap(port.setCart),
    cart: wrap(port.cart),
    checkout: wrap(port.checkout),
    order: wrap(port.order),
  };
}

// --- Placing an order --------------------------------------------------------------

/**
 * What the person reviewed: every line and quantity, and what it costs. An
 * order is placed only while Swiggy's cart still has this fingerprint.
 */
export function cartFingerprint(cart: Pick<InstamartCart, "items" | "total">): string {
  const lines = cart.items
    .map((item) => `${item.spinId}x${item.quantity}`)
    .sort()
    .join("|");
  return createHash("sha256").update(`${lines}#${cart.total ?? "?"}`).digest("hex").slice(0, 32);
}

export type LineSource = { spinId: string; entryId: string; itemId: string; listQuantity: number; listUnit: string };

export type PlaceResult =
  | { kind: "placed"; orderId: string; message: string | null; partial: boolean }
  | { kind: "replayed"; orderId: string }
  | { kind: "changed" }
  | { kind: "refused"; swiggyMessage: string }
  | { kind: "unknown"; orderId: string };

export async function placeInstamartOrder(
  admin: SupabaseClient,
  actor: Actor,
  input: { addressId: string; payment: InstamartPayment; reviewed: string; sources: readonly LineSource[] },
): Promise<PlaceResult> {
  const shop = await instamartFor(admin, actor);
  const cart = await shop.cart();
  if (cart.items.length === 0 || cartFingerprint(cart) !== input.reviewed) return { kind: "changed" };
  if (!cart.payments.includes(input.payment)) return { kind: "changed" };

  // Reserve the order first: the same reviewed cart is one order, however many taps.
  const idempotencyKey = `instamart:${actor.memberId}:${input.reviewed}`;
  const { data: reserved, error } = await admin
    .from("orders")
    .insert({ household_id: actor.householdId, provider: INSTAMART_PROVIDER, status: "draft", currency: "INR", total_minor: toMinor(cart.total), idempotency_key: idempotencyKey, placed_by_member_id: actor.memberId })
    .select("id")
    .single();
  if (error) {
    const { data: existing } = await admin.from("orders").select("id").eq("household_id", actor.householdId).eq("idempotency_key", idempotencyKey).maybeSingle();
    if (existing) return { kind: "replayed", orderId: (existing as { id: string }).id };
    throw new Error(`instamart order: ${error.code ?? "unknown"}`);
  }
  const orderId = (reserved as { id: string }).id;
  const bySpin = new Map(input.sources.map((source) => [source.spinId, source]));
  await admin.from("order_items").insert(
    cart.items.map((item) => {
      const source = bySpin.get(item.spinId);
      return {
        household_id: actor.householdId,
        order_id: orderId,
        consumable_id: source?.itemId ?? null,
        description: [item.name, item.variant].filter(Boolean).join(" · ").slice(0, 200),
        quantity: item.quantity,
        unit_price_minor: Math.round((item.price / Math.max(1, item.quantity)) * 100),
        list_entry_id: source?.entryId ?? null,
        list_quantity: source && source.listQuantity > 0 ? source.listQuantity : null,
        list_unit: source?.listUnit ?? null,
      };
    }),
  );

  try {
    const placed = await shop.checkout(input.addressId, input.payment);
    const now = new Date().toISOString();
    if (placed.orderIds.length === 0) {
      await admin.from("orders").delete().eq("id", orderId);
      return { kind: "refused", swiggyMessage: placed.message ?? "Instamart did not place the order." };
    }
    await admin
      .from("orders")
      .update({
        status: "placed",
        external_id: placed.orderIds.join(",").slice(0, 200),
        total_minor: toMinor(placed.total ?? cart.total),
        placed_at: now,
        approved_by_member_id: actor.memberId,
        approved_at: now,
      })
      .eq("id", orderId);
    return { kind: "placed", orderId, message: placed.message, partial: placed.failed > 0 };
  } catch (thrown) {
    if (thrown instanceof InstamartRefusal) {
      // Swiggy said no and nothing was ordered: the reserved row goes, so no
      // "cancelled" notice arrives and the person can fix the cart and try again.
      await admin.from("orders").delete().eq("id", orderId);
      return { kind: "refused", swiggyMessage: thrown.swiggyMessage };
    }
    // No answer: it may or may not have been placed. Never retried; the person checks Swiggy.
    await admin.from("orders").update({ status: "pending_approval", failure_code: "outcome_unknown" }).eq("id", orderId);
    log.warn("instamart checkout without an answer", { code: thrown instanceof McpError ? thrown.code : "unknown" });
    return { kind: "unknown", orderId };
  }
}

/** Rupees to paise, at the boundary where the orders table needs a minor unit (rule 22). */
function toMinor(rupees: number | null): number {
  return rupees !== null && rupees > 0 ? Math.round(rupees * 100) : 0;
}

// --- Following an order -------------------------------------------------------------

const OPEN: OrderStatus[] = ["placed", "confirmed", "shipped"];

/** Reads where this member's open Instamart orders are, and moves each one forward only. */
export async function refreshInstamartOrders(admin: SupabaseClient, actor: Actor): Promise<number> {
  const { data } = await admin
    .from("orders")
    .select("id, status, external_id")
    .eq("household_id", actor.householdId)
    .eq("provider", INSTAMART_PROVIDER)
    .eq("placed_by_member_id", actor.memberId)
    .in("status", OPEN)
    .order("placed_at", { ascending: false })
    .limit(5);
  const rows = (data ?? []) as { id: string; status: OrderStatus; external_id: string | null }[];
  if (rows.length === 0) return 0;
  const shop = await instamartFor(admin, actor);
  let moved = 0;
  for (const row of rows) {
    const swiggyId = row.external_id?.split(",")[0];
    if (!swiggyId) continue;
    const state = await shop.order(swiggyId).catch(() => null);
    const next = state ? orderStatusFrom(state.statusText) : null;
    if (!next || next === row.status || !canTransition(row.status, next)) continue;
    const patch: Record<string, unknown> = { status: next };
    if (next === "delivered") patch.delivered_at = new Date().toISOString();
    if (next === "failed") patch.failure_code = "swiggy_failed";
    await admin.from("orders").update(patch).eq("id", row.id).eq("status", row.status);
    moved += 1;
  }
  return moved;
}
