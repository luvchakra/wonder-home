# Ordering the To buy list on Swiggy Instamart (25-032)

**Date:** 2026-10-23 · **Ask (the owner):** "integrate shopping cart with Swiggy Instamart to place the grocery order if user decides so … tell me in brief what is required from my side."

## Why this is possible now
25-021 (retired 2026-10-20) found no public Instamart ordering API. Since January 2026, Swiggy runs MCP servers for Food, Instamart and Dineout (the Builders Club, `mcp.swiggy.com`).
- **Sign-in:** OAuth 2.1 with PKCE S256 and dynamic client registration (`/auth/register`). The person signs in with phone and OTP on Swiggy's own page.
- **Instamart tools:** 20 of them, including `get_addresses`, `search_products`, `update_cart`, `get_cart`, `checkout`, `get_order_details` and `track_order`.
- **Access:** building on `http://localhost` needs no approval. Production needs Swiggy to allowlist the redirect URI, after an application with a demo video.

Discovery was probed live: `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`, and `/im` answers 401 without a token. The docs pages read are kept only as untrusted scratch.

## What was built
- **Core, `packages/core/src/commerce/instamart/`:**
  - `config.ts`: off unless `WONDERHOME_INSTAMART=on`, or `fixture` for QA. Only Swiggy's two hosts are accepted.
  - `oauth.ts`: PKCE, the state kept only as a hash, client registration, code and refresh exchanges.
  - `mcp.ts`: JSON-RPC over Streamable HTTP, reading both JSON and event streams. A 401 or `-32001` means the person must sign in again; a 429 carries its Retry-After.
  - `client.ts`: `InstamartPort` with readers for each answer and a deterministic fixture.
  - `match.ts`: picks the product and packs by rules.
  - `service.ts`: sign-in, tokens refreshed a minute early, placing an order, following orders.
- **Placing an order:**
  - The browser sends only choices. The list is re-read through the person's session, and Swiggy's cart is re-read before checkout.
  - The cart's fingerprint must still match what the person reviewed. The household's idempotency key makes a double tap one order.
  - A checkout with no answer is never retried; the person is told to look in the Swiggy app.
  - Payment is cash on delivery or Swiggy Money. UPI is left as 25-033.
  - Swiggy's own success message is shown as-is, and cancelling goes through Swiggy's customer care, both as its tool contract asks.
- **Screens, `/groceries/order`:**
  - Connect Swiggy is a plain link to `connect/route.ts`; the callback is `callback/route.ts`. Adults only, each on their own Swiggy account.
  - The flow: Deliver to, Find my list on Instamart, change a product or packs or leave a line out, Review cart, Place order.
  - Your Instamart orders, with Check status and Put into stock.
  - Powered by Instamart appears with Swiggy's square logo (`public/brand/instamart.png`, from their brand page).
  - The way in is Groceries → Order on Instamart. The connection shows in Settings → Swiggy Instamart, whose one editor is this page.
- **Database:** migration `20261023120000_instamart_ordering.sql`.
  - `instamart_connections`: the member reads their own row.
  - `instamart_tokens` and `instamart_oauth_states`: deny-all RLS, with SELECT granted only on columns that hold no secret.
  - `instamart_oauth_clients`: platform data, listed in `NON_TENANT_TABLES`.
  - `orders.placed_by_member_id` and `stocked_at`; `order_items.list_entry_id`, `list_quantity` and `list_unit`.
- **Order notices:** Instamart orders are `orders` rows, so the existing notices (27-012) follow them and now open `/groceries/order`.
- **Rate limits:** `instamart.match` (6 per 15 minutes) and `instamart.cart` (30 per 15 minutes), per member.
- **Words and help:** words in all eight catalogs (`instamart.*`, `settingsHome.instamart.*`). Help: Meals and shopping ¶21 in all eight languages, `updated` 2026-10-23.
- **Not stored:** no Swiggy address, phone number or response body.

## Applying the migration
`apply_migration` timed out twice with nothing applied, and multi-statement `execute_sql` calls timed out too. Single statements worked, so the file was applied one statement at a time and recorded as version `20261023120000` (`instamart_ordering`) in `supabase_migrations.schema_migrations`. The live tables, policies and grants were checked against the file.

## Verified
- **Checks:** tsc (core, web), ESLint on the changed files, migration lint, `lint:help-links`, `check:bundle`, `lint:secrets`, a production build.
- **Tests:** 773 unit tests across commerce, notifications, security and the web helpers (15 of them new for Instamart). All 752 local DB tests pass, tenant isolation included.
- **Browser:** fixture mode on a production build, 360px and 1280px, no horizontal scroll.
  - Connecting through the callback worked.
  - Matching gave 2 L milk → 2 × 1 L, 12 eggs → one 12-pack, 1 kg rice → one 1 kg bag. Saffron was not found; Tomato was left out.
  - The cart showed the bill (₹373) and the address. Place order showed Swiggy's message, and the order was listed.
  - Put into stock moved 3 things into stock and off the list.
  - The Settings row was present.
  - Long product names and the address are shown in full under the pickers (rules 11 and 15).

## Needs a person
1. **Apply for production access** at mcp.swiggy.com/builders/access, or email builders@swiggy.in.
   - Send a short screen recording of this flow on localhost, with real Swiggy, which needs your phone and OTP.
   - Ask for Instamart with redirect URI `https://home.wonderapps.biz/groceries/order/callback`.
   - Swiggy grants staging first, then production after 48 green hours.
2. **Once allowlisted,** set `WONDERHOME_INSTAMART=on` in Vercel (project `wonderhome`).
3. **Tell Swiggy about a launch** 7 days ahead, as their guidelines ask.

Follow-ups: 25-033 (UPI) and 25-034 (going live).

## Cleanup
The QA account, its household and the seeded rows were deleted after the merge (see the PR thread).
