import { McpError, mcpSession, type McpSession, type ToolEnvelope } from "./mcp";

/**
 * Instamart as WonderHome sees it (story 25-032): the handful of Swiggy tools
 * the order flow uses, each answer read into a small typed shape. Only what a
 * screen shows is kept, and only for the request: an address line and a
 * phone number are shown to the person who owns that Swiggy account and
 * never stored.
 *
 * `InstamartPort` is the seam. `liveInstamart` calls Swiggy's MCP server with
 * one member's access token; `fixtureInstamart` is a deterministic stand-in
 * for tests and local QA that never places a real order.
 */

export type InstamartAddress = { id: string; label: string | null; line: string };

export type InstamartVariant = {
  spinId: string;
  skuId: string;
  name: string;
  brand: string | null;
  /** Swiggy's own wording of the pack: "500 g", "1 L", "6 pcs". */
  pack: string;
  /** Price in rupees (the major unit), as Swiggy reports it. */
  price: number;
  mrp: number | null;
  inStock: boolean;
  imageUrl: string | null;
  maxQuantity: number | null;
};

export type InstamartCartItem = { spinId: string; skuId: string; name: string; variant: string | null; quantity: number; inStock: boolean; price: number; mrp: number | null; imageUrl: string | null };

export type InstamartCart = {
  cartId: string | null;
  items: InstamartCartItem[];
  /** Swiggy's bill as Swiggy words it: item total, delivery, handling, discounts. */
  bill: { label: string; value: string }[];
  toPay: { label: string; value: string } | null;
  /** What Swiggy will charge, in rupees, when it can be read as a number. */
  total: number | null;
  /** Where it will be delivered, as Swiggy words it; shown, never stored. */
  deliverTo: string | null;
  warnings: string[];
  unserviceable: string[];
  /** Payment groups Swiggy says are available now, among the ones WonderHome can complete. */
  payments: InstamartPayment[];
};

/** WonderHome completes cash on delivery and Swiggy Money; UPI needs a payment hand-off it does not do yet. */
export type InstamartPayment = "COD" | "SwiggyPay";

export type InstamartPlaced = { orderIds: string[]; failed: number; total: number | null; message: string | null; paymentMethod: string };

export type InstamartOrderState = { orderId: string; statusText: string; total: number | null; items: { name: string; quantity: number; removed: boolean }[] };

export type InstamartPort = {
  addresses(): Promise<InstamartAddress[]>;
  search(query: string, addressId: string): Promise<InstamartVariant[]>;
  /** Replaces the whole Instamart cart with these lines, then reads it back. */
  setCart(addressId: string, lines: { spinId: string; skuId: string; quantity: number }[]): Promise<InstamartCart>;
  cart(): Promise<InstamartCart>;
  /** Places the order. Called once per confirmed tap; never retried. */
  checkout(addressId: string, payment: InstamartPayment): Promise<InstamartPlaced>;
  order(orderId: string): Promise<InstamartOrderState>;
};

/** A domain failure Swiggy reported (out of stock, below the minimum order, not serviceable), worded by Swiggy. */
export class InstamartRefusal extends Error {
  constructor(readonly swiggyMessage: string) {
    super("instamart refused");
  }
}

export { McpError };

export function liveInstamart(input: { endpoint: string; accessToken: string; fetch?: typeof fetch }): InstamartPort {
  const session: McpSession = mcpSession(input);
  const call = async (name: string, args?: Record<string, unknown>, timeoutMs?: number) => unwrap(await session.callTool(name, args, { timeoutMs }));
  return {
    async addresses() {
      return readAddresses(await call("get_addresses", { page: 1, pageSize: 10 }));
    },
    async search(query, addressId) {
      return readSearch(await call("search_products", { query: query.slice(0, 80), addressId }));
    },
    async setCart(addressId, lines) {
      return readCart(await call("update_cart", { selectedAddressId: addressId, items: lines.map(({ spinId, skuId, quantity }) => ({ spinId, skuId, quantity })) }));
    },
    async cart() {
      return readCart(await call("get_cart"));
    },
    async checkout(addressId, payment) {
      // Swiggy asks for its own success message to be shown as it is, so the envelope's message is kept.
      const envelope = await session.callTool("checkout", { addressId, paymentMethod: payment }, { timeoutMs: 30_000 });
      const placed = readPlaced(unwrap(envelope), payment);
      return { ...placed, message: envelope.success ? envelope.message : null };
    },
    async order(orderId) {
      return readOrder(await call("get_order_details", { orderId }));
    },
  };
}

function unwrap(envelope: ToolEnvelope): unknown {
  if (!envelope.success) throw new InstamartRefusal(envelope.error);
  return envelope.data;
}

// --- Reading Swiggy's answers -------------------------------------------------

type Loose = Record<string, unknown>;
const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" ? rupees(value) : null);

/** "₹1,234.50" or "1234.5" in rupees; null when it is not a number. */
export function rupees(text: string): number | null {
  const cleaned = text.replace(/[₹,\s]|Rs\.?|INR/gi, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

export function readAddresses(data: unknown): InstamartAddress[] {
  const list = ((data as Loose | null)?.addresses ?? []) as Loose[];
  return list
    .map((row) => ({ id: str(row.id), label: str(row.addressTag) ?? str(row.addressCategory), line: str(row.addressLine) ?? "" }))
    .filter((row): row is InstamartAddress => Boolean(row.id));
}

export function readSearch(data: unknown): InstamartVariant[] {
  const products = ((data as Loose | null)?.products ?? []) as Loose[];
  const variants: InstamartVariant[] = [];
  for (const product of products) {
    for (const variation of ((product.variations ?? product.variants ?? []) as Loose[])) {
      const spinId = str(variation.spinId);
      const skuId = str(variation.skuId);
      const price = variation.price as Loose | undefined;
      const offer = num(price?.offerPrice) ?? num(price?.mrp);
      if (!spinId || !skuId || offer === null) continue;
      variants.push({
        spinId,
        skuId,
        name: str(variation.displayName) ?? str(product.displayName) ?? "",
        brand: str(variation.brandName) ?? str(product.brand),
        pack: str(variation.quantityDescription) ?? "",
        price: offer,
        mrp: num(price?.mrp),
        inStock: variation.isInStockAndAvailable !== false && product.inStock !== false,
        imageUrl: str(variation.imageUrl),
        maxQuantity: num(variation.maxQuantity),
      });
    }
  }
  return variants.slice(0, 30);
}

export function readCart(data: unknown): InstamartCart {
  const cart = (data ?? {}) as Loose;
  const items = ((cart.items ?? []) as Loose[])
    .map((item) => ({
      spinId: str(item.spinId) ?? "",
      skuId: str(item.skuId) ?? "",
      name: str(item.itemName) ?? "",
      variant: str(item.itemVariant),
      quantity: num(item.quantity) ?? 0,
      inStock: item.isInStockAndAvailable !== false,
      price: num(item.discountedFinalPrice) ?? num(item.mrp) ?? 0,
      mrp: num(item.mrp),
      imageUrl: str(item.imageUrl),
    }))
    .filter((item) => item.spinId && item.quantity > 0);
  const breakdown = (cart.billBreakdown ?? {}) as Loose;
  const bill = ((breakdown.lineItems ?? []) as Loose[])
    .map((line) => ({ label: str(line.label) ?? "", value: str(line.value) ?? String(line.value ?? "") }))
    .filter((line) => line.label);
  const toPayRaw = breakdown.toPay as Loose | undefined;
  const toPay = toPayRaw && str(toPayRaw.label) ? { label: str(toPayRaw.label)!, value: str(toPayRaw.value) ?? String(toPayRaw.value ?? "") } : null;
  const details = cart.selectedAddressDetails as Loose | undefined;
  const warning = cart.cartWarning as Loose | undefined;
  const methods = new Set<string>([
    ...((cart.availablePaymentMethods ?? []) as unknown[]).filter((value): value is string => typeof value === "string"),
    ...(((cart.paymentOptions as Loose | null)?.allMethods ?? []) as Loose[]).filter((method) => method.enabled !== false).map((method) => String(method.id ?? "")),
  ]);
  const payments: InstamartPayment[] = [];
  if ([...methods].some((method) => /^(cod|cash)/i.test(method))) payments.push("COD");
  if ([...methods].some((method) => /swiggy ?(pay|money)/i.test(method))) payments.push("SwiggyPay");
  return {
    cartId: str(cart.cartId),
    items,
    bill,
    toPay,
    total: (toPay ? rupees(toPay.value) : null) ?? num(cart.cartTotalAmount),
    deliverTo: str(cart.selectedAddress) ?? (details ? [str(details.flatNo), str(details.address), str(details.area), str(details.city)].filter(Boolean).join(", ") || null : null),
    warnings: [str(cart.addressWarning), str(warning?.message), cart.cartAbsent ? str(cart.cartAbsentReason) : null].filter((line): line is string => Boolean(line)),
    unserviceable: ((cart.unserviceableItems ?? []) as Loose[]).map((item) => str(item.itemName)).filter((name): name is string => Boolean(name)),
    payments,
  };
}

export function readPlaced(data: unknown, payment: string): InstamartPlaced {
  const placed = (data ?? {}) as Loose;
  if (placed.status === "PENDING_PAYMENT") throw new InstamartRefusal("This payment needs the Swiggy app.");
  if (Array.isArray(placed.orders)) {
    const orders = placed.orders as Loose[];
    const ids = orders.map((order) => str(order.orderId)).filter((id): id is string => Boolean(id) );
    return { orderIds: ids, failed: orders.length - ids.length, total: num(placed.cartTotal), message: null, paymentMethod: str(placed.paymentMethod) ?? payment };
  }
  const id = str(placed.orderId);
  if (!id) throw new InstamartRefusal("Instamart did not confirm the order.");
  return { orderIds: [id], failed: 0, total: num(placed.cartTotal), message: null, paymentMethod: str(placed.paymentMethod) ?? payment };
}

export function readOrder(data: unknown): InstamartOrderState {
  const order = (data ?? {}) as Loose;
  return {
    orderId: str(order.orderId) ?? "",
    statusText: str(order.status) ?? "",
    total: num(order.totalBill) ?? (str((order.bill as Loose | undefined)?.grandTotal) ? rupees(String((order.bill as Loose).grandTotal)) : null),
    items: ((order.items ?? []) as Loose[]).map((item) => ({ name: str(item.name) ?? "", quantity: num(item.quantity) ?? 0, removed: item.removed === true })),
  };
}

/**
 * Swiggy's human-readable status as one of the orders table's states. Only
 * ever moves an order forward (`canTransition` decides that); a wording it
 * does not know leaves the order where it is.
 */
export function orderStatusFrom(text: string): "placed" | "confirmed" | "shipped" | "delivered" | "cancelled" | "failed" | null {
  const words = text.toLowerCase();
  if (!words) return null;
  if (/cancel|refund/.test(words)) return "cancelled";
  if (/fail|declin|reject/.test(words)) return "failed";
  if (/out for delivery|on the way|picked up|dispatched|arriving|rider/.test(words)) return "shipped";
  if (/deliver(ed)?\b/.test(words) && !/deliver(ing|y)\b/.test(words)) return "delivered";
  if (/confirm|accept|pack|prepar|process/.test(words)) return "confirmed";
  if (/placed|received|created/.test(words)) return "placed";
  return null;
}

// --- The fixture ----------------------------------------------------------------

const FIXTURE_CATALOGUE: { keywords: string[]; variants: Omit<InstamartVariant, "spinId" | "skuId" | "inStock" | "imageUrl" | "maxQuantity">[] }[] = [
  { keywords: ["milk", "doodh"], variants: [{ name: "Amul Taaza Toned Milk", brand: "Amul", pack: "500 ml", price: 28, mrp: 28 }, { name: "Amul Taaza Toned Milk", brand: "Amul", pack: "1 L", price: 56, mrp: 56 }] },
  { keywords: ["egg", "anda"], variants: [{ name: "Farm Fresh Eggs", brand: "Eggoz", pack: "6 pcs", price: 72, mrp: 80 }, { name: "Farm Fresh Eggs", brand: "Eggoz", pack: "12 pcs", price: 138, mrp: 150 }] },
  { keywords: ["rice", "chawal", "basmati"], variants: [{ name: "Daawat Rozana Basmati Rice", brand: "Daawat", pack: "1 kg", price: 119, mrp: 140 }, { name: "Daawat Rozana Basmati Rice", brand: "Daawat", pack: "5 kg", price: 545, mrp: 650 }] },
  { keywords: ["tomato", "tamatar"], variants: [{ name: "Fresh Tomato", brand: null, pack: "500 g", price: 24, mrp: 30 }, { name: "Fresh Tomato", brand: null, pack: "1 kg", price: 46, mrp: 60 }] },
  { keywords: ["onion", "pyaz"], variants: [{ name: "Fresh Onion", brand: null, pack: "1 kg", price: 38, mrp: 45 }] },
  { keywords: ["bread"], variants: [{ name: "Harvest Gold White Bread", brand: "Harvest Gold", pack: "400 g", price: 40, mrp: 40 }] },
  { keywords: ["atta", "flour", "wheat"], variants: [{ name: "Aashirvaad Whole Wheat Atta", brand: "Aashirvaad", pack: "5 kg", price: 245, mrp: 290 }] },
  { keywords: ["banana", "kela"], variants: [{ name: "Robusta Banana", brand: null, pack: "6 pcs", price: 42, mrp: 50 }] },
];

/**
 * A made-up Instamart for tests and QA (`WONDERHOME_INSTAMART=fixture`): one
 * home address, a small catalogue, a cart kept in this server's memory per
 * account, and
 * an order that is "placed" without leaving the machine.
 */
const fixtureCarts = new Map<string, { spinId: string; skuId: string; quantity: number }[]>();

export function fixtureInstamart(account = "fixture"): InstamartPort {
  let lines = fixtureCarts.get(account) ?? [];
  const keep = (next: typeof lines) => {
    lines = next;
    fixtureCarts.set(account, next);
  };
  const variants = FIXTURE_CATALOGUE.flatMap((entry, i) =>
    entry.variants.map((variant, j) => ({ ...variant, spinId: `fx-spin-${i}-${j}`, skuId: `fx-sku-${i}-${j}`, inStock: true, imageUrl: null, maxQuantity: 10, keywords: entry.keywords })),
  );
  const cartOf = (): InstamartCart => {
    const items = lines
      .map((line) => {
        const variant = variants.find((candidate) => candidate.spinId === line.spinId);
        const item: InstamartCartItem | null = variant ? { spinId: variant.spinId, skuId: variant.skuId, name: variant.name, variant: variant.pack, quantity: line.quantity, inStock: true, price: variant.price * line.quantity, mrp: (variant.mrp ?? variant.price) * line.quantity, imageUrl: null } : null;
        return item;
      })
      .filter((item): item is InstamartCartItem => item !== null);
    const itemTotal = items.reduce((sum, item) => sum + item.price, 0);
    const handling = items.length > 0 ? 4 : 0;
    const delivery = itemTotal >= 199 || items.length === 0 ? 0 : 30;
    const total = itemTotal + handling + delivery;
    return {
      cartId: items.length > 0 ? "fx-cart" : null,
      items,
      bill: [
        { label: "Item total", value: `₹${itemTotal}` },
        { label: "Handling fee", value: `₹${handling}` },
        { label: "Delivery fee", value: delivery === 0 ? "FREE" : `₹${delivery}` },
      ],
      toPay: { label: "To pay", value: `₹${total}` },
      total,
      deliverTo: "Flat 12, Sample Apartments, Indiranagar, Bengaluru",
      warnings: itemTotal > 0 && itemTotal < 99 ? ["Add items worth ₹99 or more to place this order."] : [],
      unserviceable: [],
      payments: ["COD", "SwiggyPay"],
    };
  };
  return {
    async addresses() {
      return [{ id: "fx-home", label: "Home", line: "Flat 12, Sample Apartments, Indiranagar, Bengaluru" }];
    },
    async search(query) {
      const words = query.toLowerCase();
      return variants.filter((variant) => variant.keywords.some((keyword) => words.includes(keyword))).map(({ keywords: _keywords, ...variant }) => variant);
    },
    async setCart(_addressId, next) {
      keep(next.filter((line) => line.quantity > 0));
      return cartOf();
    },
    async cart() {
      return cartOf();
    },
    async checkout() {
      const cart = cartOf();
      if (cart.items.length === 0) throw new InstamartRefusal("Your cart is empty.");
      if ((cart.total ?? 0) < 99) throw new InstamartRefusal("Add items worth ₹99 or more to place this order.");
      keep([]);
      return { orderIds: [`FX${Date.now()}`], failed: 0, total: cart.total, message: "Instamart order placed successfully", paymentMethod: "COD" };
    },
    async order(orderId) {
      return { orderId, statusText: "Order placed", total: null, items: [] };
    },
  };
}
