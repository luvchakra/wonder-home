# External providers and payments

Reference detail moved verbatim from CLAUDE.md (2026-10-24, token-economy pass). The summary rules followed on 2026-10-25 and are the next section; `CLAUDE.md` keeps only the invariants. Read this file only when you change weather, films, careers, billing, payments, WhatsApp or partner-key code.

## Summary rules (from CLAUDE.md)

Detail: `docs/external-providers.md`.
- Never invent credentials or claim a live integration. Build provider-neutral ports and deterministic mocks first. A provider is live only after credentials, authentication, contract behaviour and integration tests are configured.
- **Weather** (`home/weather-service.ts` `householdWeather`) is off unless `WONDERHOME_WEATHER_PROVIDER=open-meteo`. It speaks only when it changes a decision, and appears only on Home's date card.
- **Films and shows** on the date card (`home/screen-picks.ts`) come from TMDB, off unless `TMDB_API_KEY` is set. Never show a title no provider sent.
- **Careers** (`packages/core/src/careers/`) belongs to WonderJobs (jobs.wonderapps.biz). WonderHome shows what it returns, forwards applications, and keeps no applicant data. The key is in Vault, set at `/platform-admin/careers`.
- **Billing and payments.** `BillingProvider` port; the provider is never the source of truth; prices are ours (`plan_prices`). Money converts only inside the adapter (`billing/money.ts`). Webhooks are HMAC-verified and applied once. Only `applyBillingEvent` moves a subscription. Cancellation waits for period end. A household never moves to a paid plan without a verified payment; `plans.requires_payment` is refused by RLS and `changePlan`. Every plan is unmarked today ("Free during early access"). Marking plans paid and setting prices are a person's decision, never invented.
- **WhatsApp** (`packages/core/src/whatsapp/`, `notifications/whatsapp.ts`) is a delivery channel, a HomeSend intake and a HomeTalk surface. It is an input channel, never an authorization channel. The household and member come from the verified link, never from the message. Replies never echo an amount, health detail or number. Inert until its `WHATSAPP_*` variables are set.
- **Partner keys** (`/api/v1/partner/*`, `packages/core/src/developer/`) are off unless `WONDERHOME_DEVELOPER_API=on`. Scopes only narrow. A sandbox key (`whk_test_`) writes nothing. Writes go through the same domain service a screen uses.


## External providers
Never invent credentials or claim a live integration. Build provider-neutral interfaces and deterministic mocks/fixtures first. A real provider is considered live only after credentials, authentication, contract behavior and integration tests are configured.

Weather (story 17-007) is the first provider that needs no household
credential: Open-Meteo sits behind the 13-005 `WeatherProvider` port
(`home/open-meteo.ts`), and `home/weather-service.ts`'s `householdWeather`
is the one way in. It checks, in order, that the deployment has a
provider, that an Admin chose an area and that the plan includes
`home.weather`. The area is stored only as coordinates rounded to about a
kilometre (`weather_locations`). The forecast is fetched at most hourly and
kept on that row by the server. An outage is recorded on the integration
row and never on household state. Weather is off unless the deployment
sets `WONDERHOME_WEATHER_PROVIDER=open-meteo`. `OPEN_METEO_API_KEY` moves
requests to Open-Meteo's commercial endpoint, and whether production needs
that key is a person's call. Weather speaks when it changes a decision,
such as washing that won't dry. The one readout is Home's date card (the
owner's call, 2026-10-21): now, the day's high and low, and rain still ahead
today (`home/today-weather.ts`), and nowhere else.

Films and shows on Home's date card (2026-10-21, `home/screen-picks.ts`) come
from TMDB behind a provider-neutral port, and are off unless a deployment sets
`TMDB_API_KEY`. One film new in cinemas and one family pick to stream, in the
household's region, a different pair each load. The lists are platform data,
cached per server for six hours, and shown with TMDB's attribution. Never show
a title no provider sent.

Careers (story 17-010, `packages/core/src/careers/`) is WonderJobs': the jobs,
the applications, every email, reminder and decision, and deletion all live
at jobs.wonderapps.biz, and WonderHome only shows what it returns and forwards
what an applicant submits. It keeps no applicant data and logs only the
endpoint, a job id, the status code and the time taken.
- **The key** is a career-site key (`wjcs_…`) a platform admin pastes at
  `/platform-admin/careers`. It is kept in Supabase Vault through the
  service-role-only `public.careers_key_*` functions, and every save and clear
  is audited in `careers_key_events` (last four only). A screen only ever
  shows its mask. `WONDERJOBS_CAREERS_KEY` is used only when none is saved.
- **The client** (`careers/wonderjobs.ts`) is reached only through the
  server-only `apps/web/app/_lib/careers.ts`, and `check:bundle` fails if it
  reaches a browser chunk. The host is fixed; an override is honoured only
  for an https host on wonderapps.biz. Calls time out at 8 s, a GET is retried
  once, and a POST never is.
- **The pages** `/careers`, `/careers/[id]` and `/careers/status` are public.
  An application goes through this app's own server action, and the status
  token only ever travels in a request body. Never show a job WonderJobs did
  not return.

Billing (story 20-006) goes through the `BillingProvider` port
(`billing/provider.ts`). Only the pure `applyBillingEvent` moves a
subscription in response to a payment. It ignores an event older than the
last one applied, or one about another subscription. A failed payment keeps
the plan as past-due, and a cancellation falls back to free. Neither ever
touches a household's records.

Payments (story 20-009) take two providers behind that one port: Razorpay
(`billing/razorpay.ts`) for India and Stripe (`billing/stripe.ts`) for
everywhere else. The provider is never the source of truth:
- **Prices are ours.** `plan_prices` holds what a plan costs per interval
  and currency, in major units. `payment_provider_plans` maps each price to
  the provider's plan or price id. It is service-role only, so the browser
  never names or sees a provider id. Both start empty. Pricing is a
  person's decision, never invent one.
- **The router chooses.** `billing/router.ts`'s `selectPaymentProvider`
  sends INR or a household in India to the India provider (default
  razorpay) and anything else to the international one (default stripe).
  A preference is honoured only where that provider is eligible. A provider
  is live only when it is listed in `WONDERHOME_BILLING_PROVIDERS` (the
  older `WONDERHOME_BILLING_PROVIDER` is still read) and fully configured.
  Razorpay needs `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and
  `RAZORPAY_WEBHOOK_SECRET`. Stripe needs `STRIPE_SECRET_KEY` and
  `STRIPE_WEBHOOK_SECRET`; `STRIPE_PRICE_<PLAN>` is only the legacy
  fallback. `WONDERHOME_BILLING_INDIA_PROVIDER` and
  `WONDERHOME_BILLING_INTERNATIONAL_PROVIDER` change the defaults.
- **Money converts at the adapter.** Minor units exist only inside an
  adapter (`billing/money.ts`, by the currency's own exponent).
- **Webhooks are verified and applied once.** Each provider has its own
  endpoint, `/api/v1/billing/webhook/{provider}` (the bare path stays
  Stripe's). A delivery is believed only after HMAC verification of the raw
  body, and each provider event is applied once (`billing_events`). The
  intent id is the idempotency key (`billing_intents` holds one open intent
  per household and plan), so a retry is never a second transaction.
- **The ledger is what providers reported.** `payments` only ever move
  forward (`billing/states.ts`). A refund in `payment_refunds` is pending
  until the provider confirms it, and its household comes from our own
  ledger, never the payload. `billing_invoices` and `payment_customers`
  complete it. Admins read the ledger, only the server writes it, and it
  holds no card number, no secret and no provider prose.
- **Nothing is taken away early.** A cancellation or downgrade waits for the
  end of the paid period (`cancel_at_period_end`, `scheduled_plan_key`).
- **Operations** (story 20-011). A payment's outcome reaches one Admin as a
  notification sourced from its ledger row (`billing/notices.ts`). Staff see
  payments and start refunds through `platform/payments.ts` (a reason code,
  pending until the provider confirms). Reconciliation (`billing/reconcile.ts`)
  records differences in closed words and never corrects the ledger itself.
- **The prices, and early access.** The catalogue holds the decided prices:
  Pro ₹299 and Max ₹599 a month, or a year at 20% off (₹2,870 and ₹5,750).
  No plan is marked `requires_payment` yet, so switching stays free and every
  screen says "Free during early access". Marking the plans paid is the step
  taken once a provider is live; until then no checkout is offered.
- **The screens** (story 20-010) are `/settings/plan` (terms, Monthly/Yearly,
  the plans), `/settings/plan/checkout` (our summary before the provider's
  page), `/settings/plan/confirmed` (waits for the webhook, never assumes),
  `/settings/plan/billing` and its invoices. `billing/account.ts` holds their
  reads and arithmetic. Cancelling at period end asks the provider first
  (`POST /households/{id}/plan/cancel`).

A plan marked `plans.requires_payment` can never be written onto a
subscription from a household session: RLS and `changePlan` both refuse
it. Every plan is unmarked today, and marking plans paid is a person's
pricing decision. Never let a household change its own plan to a paid one
without a verified payment.

WhatsApp (story 17-006) is a delivery channel behind the 06-008 adapter
shape (`notifications/whatsapp.ts`). A new notification that is due now
goes out on the member's live channels (`notifications/deliver.ts`, called
from `createNotification`), and each attempt leaves a `sent` or
`delivery_failed` event in closed words. A reply to an open thread never
pings again.

The webhook (`/api/v1/whatsapp/webhook`) does four things:
- answers Meta's handshake;
- believes a POST only after `X-Hub-Signature-256` verifies, then records
  delivered, seen or failed by provider message id;
- honours STOP on the spot;
- takes in what a linked adult sends (below).

WhatsApp is also a HomeSend intake (stories 14-015/14-016,
`packages/core/src/whatsapp/`). It is an input channel, never an
authorization channel:
- **Linking.** A number becomes one adult member's only through a
  single-use code. The member asks for it signed in, and it is stored
  only as a hash, valid for fifteen minutes (`whatsapp_link_requests`).
  WhatsApp then delivers "CONNECT <code>" from that number, and
  `public.complete_whatsapp_link` completes the link atomically on the
  server. A number that merely matches something typed somewhere links
  nothing. One number is linked to one member at a time, anywhere
  (`whatsapp_identities`). Disconnecting (`public.disconnect_whatsapp`,
  the member or an admin) keeps the row and everything made from it.
- **Inbound.** The household and member always come from the verified
  link, never from the message. A linked number's message is recorded
  once by WhatsApp's message id (`whatsapp_messages`) and queued as a
  `whatsapp.process` job. After the response it becomes a HomeSend item
  (`whatsapp` / `whatsapp_media`), through `ingestWhatsAppText` /
  `ingestWhatsAppMedia` — the same pipeline, gates and confirmation as any
  item. A number with no link is told how to connect, and nothing it sent
  is kept.
- **Replies.** The acknowledgement (`acknowledgementFor`) is short, sent
  once, inside the 24-hour window the person opened, and never echoes an
  amount, a health detail or a number.
- **Questions go to HomeTalk** (the owner, 2026-10-24). A one-line question
  or everyday request (`whatsapp/hometalk.ts`'s `isForHomeTalk`) runs through
  the HomeTalk gateway on channel `whatsapp`, as the linked member under their
  own session (`apps/web/app/_lib/whatsapp-hometalk.ts`), with
  `WHATSAPP_SCOPES`: the same everyday things as a new Alexa link. A child's
  school, health and money are `kept_off` (its messages pass through Meta),
  and changing plans, paying and ordering stay in the app. It is never kept
  as a HomeSend item; its conversation is its own surface.
- **A reply answers its item.** A swipe-reply (`context.id`, kept as
  `whatsapp_messages.reply_to_provider_message_id`) that names one household
  member (`memberNamedInReply`) sets who the quoted item is for, on the item
  itself; nothing is applied and no new item is made.
- **Messages sent together are one item.** WhatsApp stamps messages to the
  second and delivers them in any order, often at once. A fresh message waits
  `BURST_SETTLE_MS`, then claims itself and the person's other fresh messages
  within `BURST_WINDOW_MS` in one conditional update (`claimBurst`); the run
  whose update lands first reads them all, every other run stops. The item is
  about the photo or file, else the forwarded text (`forwarded`, from
  `context.forwarded`), else the longest text (`leadOf`); the person's own
  texts are "The sender added: …", with one reply.
- **What it never does.** WhatsApp is not a second brain: it decides nothing
  itself, and never touches a domain record except through HomeTalk's gates.
- **Telemetry.** `whatsapp_events` holds closed words and counts only.
- **Screens.** `/settings/whatsapp` is the one place a number is
  connected or disconnected. "I've sent the message" only looks again,
  and the confirmation is shown from the server's own link, never from
  the browser. Other members only ever see "WhatsApp connected" beside a
  name, never the number. HomeSend lists WhatsApp as a channel, filters
  its inbox by channel (`homesend/channels.ts`), and says who sent each
  WhatsApp item.

It all stays inert until a deployment sets `WHATSAPP_ACCESS_TOKEN`,
`WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME`,
`WHATSAPP_APP_SECRET` and `WHATSAPP_VERIFY_TOKEN`. The app offers
connecting only once `WHATSAPP_BUSINESS_NUMBER` is set too. Scheduled notifications go out at their time through the delivery clock
(see Push under Smart notifications).

Partner keys (story 18-008, `packages/core/src/developer/`) let an app a
household trusts use a narrow API (`/api/v1/partner/*`). An Admin creates a
key under Integrations and sees it once; only its hash is kept. Scopes only
narrow, a sandbox key (`whk_test_`) reads fixtures and writes nothing, and
writes go through the same domain service a screen uses. A partner has no
session, so every partner query names the key's own household explicitly. It
is all off unless a deployment sets `WONDERHOME_DEVELOPER_API=on`. A new
partner capability is a new scope plus its endpoint, never a wider key.
