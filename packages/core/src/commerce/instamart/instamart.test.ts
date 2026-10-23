import { describe, expect, it, vi } from "vitest";

import { fixtureInstamart, orderStatusFrom, readCart, readPlaced, readSearch, rupees, type InstamartVariant } from "./client";
import { instamartEndpoint, instamartMode, swiggyBase } from "./config";
import { packAmount, packsFor, suggest } from "./match";
import { McpError, mcpSession, toEnvelope } from "./mcp";
import { authorizeUrl, exchangeCode, hashState, needsRefresh, newAuthorization, registerClient, SwiggyAuthError } from "./oauth";

const variant = (partial: Partial<InstamartVariant>): InstamartVariant => ({
  spinId: "s",
  skuId: "k",
  name: "Amul Taaza Toned Milk",
  brand: "Amul",
  pack: "500 ml",
  price: 28,
  mrp: 28,
  inStock: true,
  imageUrl: null,
  maxQuantity: 10,
  ...partial,
});

describe("whether Instamart is on", () => {
  it("is off unless a deployment turns it on, and only ever talks to Swiggy's own hosts", () => {
    expect(instamartMode({})).toBe("off");
    expect(instamartMode({ WONDERHOME_INSTAMART: "on" })).toBe("live");
    expect(instamartMode({ WONDERHOME_INSTAMART: "fixture" })).toBe("fixture");
    expect(swiggyBase({ SWIGGY_MCP_BASE: "https://evil.example" })).toBe("https://mcp.swiggy.com");
    expect(instamartEndpoint({ SWIGGY_MCP_BASE: "https://mcp-staging.swiggy.com/" })).toBe("https://mcp-staging.swiggy.com/im");
  });
});

describe("matching a list line to a product", () => {
  it("reads Swiggy's pack wording as an amount", () => {
    expect(packAmount("500 ml")).toEqual({ quantity: 500, unit: "ml" });
    expect(packAmount("1 L")).toEqual({ quantity: 1000, unit: "ml" });
    expect(packAmount("2 x 200 g")).toEqual({ quantity: 400, unit: "g" });
    expect(packAmount("6 pcs")).toEqual({ quantity: 6, unit: "pcs" });
    expect(packAmount("1 bunch")).toBeNull();
  });

  it("covers what is needed in whole packs, within Swiggy's limit", () => {
    expect(packsFor({ quantity: 2000, unit: "ml" }, variant({ pack: "500 ml" }))).toEqual({ packs: 4, covers: "exact" });
    expect(packsFor({ quantity: 1.2, unit: "kg" }, variant({ pack: "500 g" }))).toEqual({ packs: 3, covers: "more" });
    expect(packsFor({ quantity: 50, unit: "pcs" }, variant({ pack: "1 pcs", maxQuantity: 6 }))).toEqual({ packs: 6, covers: "more" });
    expect(packsFor({ quantity: 2, unit: "bunch" }, variant({ pack: "1 bunch" }))).toEqual({ packs: 1, covers: "unknown" });
  });

  it("prefers a product that names the item, in stock, with the least left over", () => {
    const line = { entryId: "e", itemId: "i", name: "Milk", quantity: 1, unit: "l" };
    const results = [
      variant({ spinId: "choc", name: "Chocolate Shake", pack: "200 ml" }),
      variant({ spinId: "half", pack: "500 ml" }),
      variant({ spinId: "litre", pack: "1 L", price: 56 }),
      variant({ spinId: "gone", pack: "1 L", inStock: false }),
    ];
    expect(suggest(line, results)).toMatchObject({ variant: { spinId: "litre" }, packs: 1, covers: "exact" });
  });

  it("suggests nothing when no product names the item", () => {
    expect(suggest({ entryId: "e", itemId: "i", name: "Saffron", quantity: 1, unit: "g" }, [variant({ name: "Chocolate Shake" })])).toBeNull();
  });
});

describe("reading Swiggy's answers", () => {
  it("reads prices in rupees", () => {
    expect(rupees("₹1,234.50")).toBe(1234.5);
    expect(rupees("FREE")).toBeNull();
  });

  it("keeps each variation that has ids and a price", () => {
    const found = readSearch({
      products: [
        { displayName: "Eggs", brand: "Eggoz", inStock: true, variations: [{ spinId: "a", skuId: "b", quantityDescription: "6 pcs", displayName: "Eggs", price: { mrp: 80, offerPrice: 72 }, isInStockAndAvailable: true }, { spinId: "x", price: { mrp: 1 } }] },
      ],
    });
    expect(found).toEqual([expect.objectContaining({ spinId: "a", skuId: "b", pack: "6 pcs", price: 72, mrp: 80, inStock: true })]);
  });

  it("reads the cart's bill, what it costs and only the payments WonderHome can complete", () => {
    const cart = readCart({
      cartId: "c1",
      cartTotalAmount: "164",
      selectedAddress: "Flat 12, Indiranagar",
      items: [{ spinId: "a", skuId: "b", itemName: "Eggs", quantity: 2, isInStockAndAvailable: true, mrp: 160, discountedFinalPrice: 144 }],
      billBreakdown: { lineItems: [{ label: "Item total", value: "₹144" }], toPay: { label: "To pay", value: "₹168" } },
      availablePaymentMethods: ["UPI", "Cash"],
    });
    expect(cart).toMatchObject({ cartId: "c1", total: 168, deliverTo: "Flat 12, Indiranagar", payments: ["COD"], items: [{ spinId: "a", quantity: 2, price: 144 }] });
  });

  it("never reports a UPI order waiting on payment as placed", () => {
    expect(() => readPlaced({ orderId: "o1", status: "PENDING_PAYMENT", paymentMethod: "UPI" }, "UPI")).toThrow();
    expect(readPlaced({ orders: [{ orderId: "o1" }, { error: "store closed" }], orderCount: 2 }, "COD")).toMatchObject({ orderIds: ["o1"], failed: 1 });
  });

  it("maps Swiggy's status words onto an order's states", () => {
    expect(orderStatusFrom("Order placed")).toBe("placed");
    expect(orderStatusFrom("Packing your order")).toBe("confirmed");
    expect(orderStatusFrom("Out for delivery")).toBe("shipped");
    expect(orderStatusFrom("Delivered")).toBe("delivered");
    expect(orderStatusFrom("Order cancelled")).toBe("cancelled");
    expect(orderStatusFrom("Something new")).toBeNull();
  });
});

describe("the MCP envelope", () => {
  it("reads the tool's own success or refusal out of the JSON-RPC result", () => {
    expect(toEnvelope({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: JSON.stringify({ success: true, data: { a: 1 }, message: "ok" }) }] } })).toEqual({ success: true, data: { a: 1 }, message: "ok" });
    expect(toEnvelope({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: JSON.stringify({ success: false, error: { message: "Out of stock" } }) }] } })).toEqual({ success: false, error: "Out of stock" });
    expect(() => toEnvelope({ jsonrpc: "2.0", id: 1, error: { code: -32001 } })).toThrow(McpError);
  });

  it("initialises once, carries the session id, reads an event stream and turns 401 into unauthorized", async () => {
    const calls: { body: { method: string }; headers: Record<string, string> }[] = [];
    const fake = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { method: string; id?: number };
      calls.push({ body, headers: init?.headers as Record<string, string> });
      if (body.method === "initialize") return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: {} }), { headers: { "content-type": "application/json", "mcp-session-id": "sess-1" } });
      if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
      const event = `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: JSON.stringify({ success: true, data: { ok: true } }) }] } })}\n\n`;
      return new Response(event, { headers: { "content-type": "text/event-stream" } });
    });
    const session = mcpSession({ endpoint: "https://mcp.swiggy.com/im", accessToken: "token", fetch: fake as unknown as typeof fetch });
    expect(await session.callTool("get_cart")).toEqual({ success: true, data: { ok: true }, message: null });
    await session.callTool("get_cart");
    expect(calls.map((call) => call.body.method)).toEqual(["initialize", "notifications/initialized", "tools/call", "tools/call"]);
    expect(calls[2]!.headers["mcp-session-id"]).toBe("sess-1");
    expect(calls[2]!.headers.authorization).toBe("Bearer token");

    const refused = mcpSession({ endpoint: "https://mcp.swiggy.com/im", accessToken: "old", fetch: (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch });
    await expect(refused.callTool("get_cart")).rejects.toMatchObject({ code: "unauthorized" });
  });
});

describe("signing in to Swiggy", () => {
  it("builds a PKCE S256 sign-in and keeps the state only as a hash", () => {
    const attempt = newAuthorization();
    expect(attempt.stateHash).toBe(hashState(attempt.state));
    expect(attempt.stateHash).toMatch(/^[0-9a-f]{64}$/);
    const url = new URL(authorizeUrl({ clientId: "c", redirectUri: "https://home.wonderapps.biz/groceries/order/callback", state: attempt.state, codeChallenge: attempt.codeChallenge }));
    expect(url.origin + url.pathname).toBe("https://mcp.swiggy.com/auth/authorize");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("mcp:tools");
  });

  it("registers a public client and exchanges a code; an invalid grant is final", async () => {
    const register = (async () => new Response(JSON.stringify({ client_id: "client-1" }), { status: 201 })) as unknown as typeof fetch;
    expect(await registerClient("https://x.test/cb", { fetch: register })).toBe("client-1");
    const now = new Date("2026-10-23T10:00:00Z");
    const token = (async () => new Response(JSON.stringify({ access_token: "a", refresh_token: "r", expires_in: 432000 }))) as unknown as typeof fetch;
    const tokens = await exchangeCode({ clientId: "c", code: "x", codeVerifier: "v".repeat(43), redirectUri: "https://x.test/cb" }, { fetch: token, now });
    expect(tokens).toEqual({ accessToken: "a", refreshToken: "r", expiresAt: new Date("2026-10-28T10:00:00Z") });
    expect(needsRefresh(tokens.expiresAt, new Date("2026-10-28T09:59:30Z"))).toBe(true);
    const invalid = (async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })) as unknown as typeof fetch;
    await expect(exchangeCode({ clientId: "c", code: "x", codeVerifier: "v".repeat(43), redirectUri: "https://x.test/cb" }, { fetch: invalid })).rejects.toEqual(new SwiggyAuthError("invalid_grant"));
  });
});

describe("the fixture", () => {
  it("keeps a cart per account and places an order only above Instamart's minimum", async () => {
    const shop = fixtureInstamart("test-account");
    const [milk] = await shop.search("Milk", "fx-home");
    await shop.setCart("fx-home", [{ spinId: milk!.spinId, skuId: milk!.skuId, quantity: 1 }]);
    await expect(shop.checkout("fx-home", "COD")).rejects.toMatchObject({ swiggyMessage: expect.stringContaining("₹99") });
    await fixtureInstamart("test-account").setCart("fx-home", [{ spinId: milk!.spinId, skuId: milk!.skuId, quantity: 4 }]);
    expect((await fixtureInstamart("test-account").cart()).items).toHaveLength(1);
    const placed = await fixtureInstamart("test-account").checkout("fx-home", "COD");
    expect(placed.orderIds).toHaveLength(1);
    expect((await fixtureInstamart("test-account").cart()).items).toHaveLength(0);
  });
});
