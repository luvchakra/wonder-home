"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { InstamartRefusal, type InstamartCart, type InstamartVariant } from "@wonderhome/core/commerce/instamart/client";
import { suggest } from "@wonderhome/core/commerce/instamart/match";
import {
  cartFingerprint,
  disconnectInstamart,
  instamartFor,
  InstamartUnavailable,
  placeInstamartOrder,
  refreshInstamartOrders,
  type Actor,
} from "@wonderhome/core/commerce/instamart/service";
import { listGroceries, markBought } from "@wonderhome/core/commerce/inventory";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { requireMembership } from "@wonderhome/core/identity/households";
import { hitRateLimit } from "@wonderhome/core/security/rate-limit";

/**
 * Ordering the shopping list on Swiggy Instamart (story 25-032).
 *
 * The browser only ever names choices — an address id Swiggy gave it, which
 * product and how many packs for which list line, the payment, and the
 * fingerprint of the cart it reviewed. Who is acting comes from the verified
 * membership; the list is read again here through the person's own session;
 * and Swiggy's cart is read again before anything is placed.
 */

/** A closed reason a screen turns into words; never Swiggy's prose except where Swiggy asks for it to be shown. */
export type Problem = "off" | "not_adult" | "not_connected" | "reconnect" | "busy" | "unreachable" | "nothing" | "invalid";

async function actorFor(householdId: string): Promise<{ actor: Actor; supabase: Awaited<ReturnType<typeof createClient>>; timeZone: string }> {
  const supabase = await createClient();
  const membership = await requireMembership(supabase, householdId);
  return { supabase, timeZone: membership.household.timezone, actor: { householdId, memberId: membership.memberId, memberType: membership.memberType } };
}

function problemOf(thrown: unknown): Problem {
  if (thrown instanceof InstamartUnavailable) return thrown.reason;
  return "unreachable";
}

// --- Connecting -----------------------------------------------------------------

export async function disconnectInstamartAction(formData: FormData): Promise<void> {
  const householdId = z.uuid().safeParse(formData.get("householdId"));
  if (!householdId.success) redirect("/groceries/order?problem=invalid");
  try {
    const { actor } = await actorFor(householdId.data);
    await disconnectInstamart(createAdminClient(), actor);
  } catch (thrown) {
    redirect(`/groceries/order?problem=${problemOf(thrown)}`);
  }
  revalidatePath("/groceries/order");
  revalidatePath("/settings");
  redirect("/groceries/order?done=disconnected");
}

// --- Matching the list to products ------------------------------------------------

export type ProductOption = Pick<InstamartVariant, "spinId" | "skuId" | "name" | "brand" | "pack" | "price" | "mrp" | "inStock" | "imageUrl" | "maxQuantity">;

export type MatchedLine = {
  entryId: string;
  itemId: string;
  name: string;
  quantity: number;
  unit: string;
  options: ProductOption[];
  pick: { spinId: string; packs: number } | null;
};

export type MatchResult = { lines: MatchedLine[] } | { problem: Problem };

const MAX_LINES = 25;

export async function matchListAction(input: { householdId: string; addressId: string }): Promise<MatchResult> {
  const parsed = z.object({ householdId: z.uuid(), addressId: z.string().min(1).max(200) }).safeParse(input);
  if (!parsed.success) return { problem: "invalid" };
  try {
    const { actor, supabase } = await actorFor(parsed.data.householdId);
    const admin = createAdminClient();
    if (!(await hitRateLimit(admin, "instamart.match", actor.memberId))) return { problem: "busy" };
    const [shop, items] = await Promise.all([instamartFor(admin, actor), listGroceries(supabase, actor.householdId)]);
    const toBuy = items.filter((item) => item.toBuy).slice(0, MAX_LINES);
    if (toBuy.length === 0) return { problem: "nothing" };
    // A few searches at a time: a person's list, not a burst against Swiggy.
    const lines: MatchedLine[] = [];
    for (let start = 0; start < toBuy.length; start += 4) {
      const batch = await Promise.all(
        toBuy.slice(start, start + 4).map(async (item) => {
          const line = { entryId: item.toBuy!.entryId, itemId: item.id, name: item.name, quantity: item.toBuy!.quantity, unit: item.toBuy!.unit };
          const results = await shop.search(item.name, parsed.data.addressId).catch((thrown) => {
            if (thrown instanceof InstamartRefusal) return [];
            throw thrown;
          });
          const pick = suggest(line, results);
          const options = results.filter((option) => option.inStock).slice(0, 8);
          return { ...line, options, pick: pick ? { spinId: pick.variant.spinId, packs: pick.packs } : null };
        }),
      );
      lines.push(...batch);
    }
    return { lines };
  } catch (thrown) {
    return { problem: problemOf(thrown) };
  }
}

// --- Reviewing and placing ---------------------------------------------------------

const picksSchema = z
  .array(z.object({ entryId: z.uuid(), spinId: z.string().min(1).max(120), skuId: z.string().min(1).max(120), packs: z.number().int().min(1).max(20) }))
  .min(1)
  .max(MAX_LINES);

export type CartView = InstamartCart & { fingerprint: string };

export type ReviewResult = { cart: CartView } | { problem: Problem } | { refused: string };

export async function reviewCartAction(input: { householdId: string; addressId: string; picks: z.input<typeof picksSchema> }): Promise<ReviewResult> {
  const parsed = z.object({ householdId: z.uuid(), addressId: z.string().min(1).max(200), picks: picksSchema }).safeParse(input);
  if (!parsed.success) return { problem: "invalid" };
  try {
    const { actor, supabase } = await actorFor(parsed.data.householdId);
    const admin = createAdminClient();
    if (!(await hitRateLimit(admin, "instamart.cart", actor.memberId))) return { problem: "busy" };
    // Only lines that are this household's and still to buy go into the cart.
    const open = new Set((await listGroceries(supabase, actor.householdId)).flatMap((item) => (item.toBuy ? [item.toBuy.entryId] : [])));
    const picks = parsed.data.picks.filter((pick) => open.has(pick.entryId));
    if (picks.length === 0) return { problem: "nothing" };
    const shop = await instamartFor(admin, actor);
    const cart = await shop.setCart(
      parsed.data.addressId,
      picks.map((pick) => ({ spinId: pick.spinId, skuId: pick.skuId, quantity: pick.packs })),
    );
    return { cart: { ...cart, fingerprint: cartFingerprint(cart) } };
  } catch (thrown) {
    if (thrown instanceof InstamartRefusal) return { refused: thrown.swiggyMessage };
    return { problem: problemOf(thrown) };
  }
}

export type PlaceResult =
  | { placed: { message: string | null; partial: boolean } }
  | { changed: true }
  | { unknown: true }
  | { refused: string }
  | { problem: Problem };

export async function placeOrderAction(input: {
  householdId: string;
  addressId: string;
  payment: "COD" | "SwiggyPay";
  reviewed: string;
  picks: z.input<typeof picksSchema>;
}): Promise<PlaceResult> {
  const parsed = z
    .object({ householdId: z.uuid(), addressId: z.string().min(1).max(200), payment: z.enum(["COD", "SwiggyPay"]), reviewed: z.string().regex(/^[0-9a-f]{32}$/), picks: picksSchema })
    .safeParse(input);
  if (!parsed.success) return { problem: "invalid" };
  try {
    const { actor, supabase } = await actorFor(parsed.data.householdId);
    const admin = createAdminClient();
    if (!(await hitRateLimit(admin, "instamart.cart", actor.memberId))) return { problem: "busy" };
    const list = new Map((await listGroceries(supabase, actor.householdId)).flatMap((item) => (item.toBuy ? [[item.toBuy.entryId, { itemId: item.id, ...item.toBuy }] as const] : [])));
    const sources = parsed.data.picks.flatMap((pick) => {
      const entry = list.get(pick.entryId);
      return entry ? [{ spinId: pick.spinId, entryId: pick.entryId, itemId: entry.itemId, listQuantity: entry.quantity, listUnit: entry.unit }] : [];
    });
    const result = await placeInstamartOrder(admin, actor, { addressId: parsed.data.addressId, payment: parsed.data.payment, reviewed: parsed.data.reviewed, sources });
    revalidatePath("/groceries/order");
    switch (result.kind) {
      case "placed":
        return { placed: { message: result.message, partial: result.partial } };
      case "replayed":
        return { placed: { message: null, partial: false } };
      case "changed":
        return { changed: true };
      case "refused":
        return { refused: result.swiggyMessage };
      case "unknown":
        return { unknown: true };
    }
  } catch (thrown) {
    if (thrown instanceof InstamartRefusal) return { refused: thrown.swiggyMessage };
    return { problem: problemOf(thrown) };
  }
}

// --- Following and stocking ----------------------------------------------------------

export async function refreshOrdersAction(formData: FormData): Promise<void> {
  const householdId = z.uuid().safeParse(formData.get("householdId"));
  if (!householdId.success) redirect("/groceries/order?problem=invalid");
  try {
    const { actor } = await actorFor(householdId.data);
    await refreshInstamartOrders(createAdminClient(), actor);
  } catch (thrown) {
    redirect(`/groceries/order?problem=${problemOf(thrown)}`);
  }
  revalidatePath("/groceries/order");
  redirect("/groceries/order");
}

/**
 * The delivery arrived: each line goes into what is at home and comes off the
 * list, through the same "Mark as bought" service Groceries uses — once, by
 * the order line's own key — and the order remembers it was stocked.
 */
export async function stockOrderAction(formData: FormData): Promise<void> {
  const parsed = z.object({ householdId: z.uuid(), orderId: z.uuid() }).safeParse({ householdId: formData.get("householdId"), orderId: formData.get("orderId") });
  if (!parsed.success) redirect("/groceries/order?problem=invalid");
  let stocked = 0;
  try {
    const { actor, supabase, timeZone } = await actorFor(parsed.data.householdId);
    if (actor.memberType !== "adult") redirect("/groceries/order?problem=not_adult");
    const { data: order } = await supabase.from("orders").select("id, status, stocked_at, provider").eq("id", parsed.data.orderId).eq("household_id", actor.householdId).maybeSingle();
    const row = order as { id: string; status: string; stocked_at: string | null; provider: string } | null;
    if (!row || row.stocked_at || !["placed", "confirmed", "shipped", "delivered"].includes(row.status)) redirect("/groceries/order");
    const { data: items } = await supabase.from("order_items").select("id, consumable_id, list_entry_id, list_quantity, list_unit").eq("order_id", row.id).limit(50);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
    for (const item of (items ?? []) as { id: string; consumable_id: string | null; list_entry_id: string | null; list_quantity: number | null; list_unit: string | null }[]) {
      if (!item.consumable_id || !item.list_entry_id || !item.list_quantity || !item.list_unit) continue;
      try {
        await markBought(supabase, {
          householdId: actor.householdId,
          entryId: item.list_entry_id,
          itemId: item.consumable_id,
          amount: { quantity: Number(item.list_quantity), unit: item.list_unit },
          purchasedOn: today,
          idempotencyKey: `instamart:${row.id}:${item.id}`,
          merchant: row.provider,
        });
        stocked += 1;
      } catch {
        // A line already bought another way stays as it is.
      }
    }
    await createAdminClient().from("orders").update({ stocked_at: new Date().toISOString() }).eq("id", row.id).is("stocked_at", null);
  } catch (thrown) {
    if (thrown && typeof thrown === "object" && "digest" in thrown) throw thrown;
    redirect(`/groceries/order?problem=${problemOf(thrown)}`);
  }
  revalidatePath("/groceries");
  revalidatePath("/groceries/order");
  redirect(`/groceries/order?done=stocked&count=${stocked}`);
}
