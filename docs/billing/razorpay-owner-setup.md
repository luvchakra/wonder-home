# Razorpay: what the owner does to take subscriptions

Everything in WonderHome is built and stays off until these steps are done.
Do them in order. Test mode first (A–F), then live (G–J). Nothing here needs a
developer. A plan never changes for a household until Razorpay confirms the
payment through the signed webhook.

## A. Open the Razorpay account
1. Go to dashboard.razorpay.com → **Sign up** with the business email. You land in **Test Mode** (the toggle at the top of the dashboard).
2. In the left menu open **Account & Settings → Activate your account** (or the **Activate account** banner) and fill in:
   - **Business type** (proprietorship, partnership, LLP or company) and **Business category**: *Software / SaaS*, sub-category *Subscription services*.
   - **Business details**: legal name (WonderApps), PAN, GSTIN if registered, registered address.
   - **Website / app**: `https://home.wonderapps.biz`.
   - **Bank account** for settlements, and the **KYC documents** Razorpay lists for your business type (PAN, address proof, cancelled cheque or bank statement).
3. Razorpay checks the website for these pages. What exists today:

   | Razorpay asks for | Where it is | What you must do |
   | --- | --- | --- |
   | Pricing | `https://home.wonderapps.biz/#pricing` (live catalogue) | Nothing once prices are set (step E). |
   | Cancellation and refund policy | `https://home.wonderapps.biz/legal#payments` (added 2026-11-20) | **Read it and confirm the refund wording is your policy**, or tell Claude what to change. |
   | Contact us | `https://home.wonderapps.biz/legal#contact` | Set `NEXT_PUBLIC_CONTACT_EMAIL` in Vercel if it is not set (the email only shows when it is). Razorpay usually also wants a **phone number and postal address**: send them to Claude to add. |
   | Privacy policy | `https://home.wonderapps.biz/legal#your-information` | The page says formal policies aren't published yet. **Razorpay may refuse activation without a full Privacy Policy** — have one written (a lawyer, or a reviewed template) and send it to Claude to publish. |
   | Terms and conditions | `https://home.wonderapps.biz/legal` | Same: **a full Terms of Service is still missing**. Your decision and wording; Claude will publish it. |
   | Shipping / delivery | — | Answer "digital service, no physical delivery" in the form. |
4. Submit. Activation takes 2–5 working days. Test mode works while you wait.
5. Ask Razorpay to enable **Subscriptions** on live mode if it isn't (**Account & Settings → Products**, or a support ticket: "Please enable Subscriptions").

## B. Test keys
1. Dashboard in **Test Mode** → **Account & Settings → API Keys → Generate Test Key**.
2. Razorpay shows two values. Their names on WonderHome:

   | Razorpay calls it | WonderHome calls it | Looks like |
   | --- | --- | --- |
   | **Test API Key** (Live: **API Key**; also "Key Id") | **Razorpay key id** | `rzp_test_…` (live: `rzp_live_…`) |
   | **Test Key Secret** (Live: **Key Secret**) — shown once | **Razorpay key secret** | 24 letters and numbers |

## C. Paste the keys into WonderHome (one card, one Save)
1. `home.wonderapps.biz/platform-admin` → **Integrations** → **Payments** → the **Razorpay** card. (The **Secrets** page links there; there is no separate key id or secret box anywhere else.)
2. **Razorpay key id** → paste the Test API Key (`rzp_test_…`).
3. **Razorpay key secret** → paste the Test Key Secret. Spaces or a line break that come with the paste are dropped.
4. Prove it's you: with a password account, type **Your WonderHome password** (your sign-in password, not a Razorpay key). If you sign in with Google there is no password: press **Confirm with Google** first (before pasting), then paste and Save within ten minutes.
5. **Save**. The card then shows the key id and "Key secret saved · ends in XXXX" (the last four of what you pasted).
6. If something is wrong, the card says exactly what: the key id in the secret box, a secret that isn't 24 letters and numbers, or a password that isn't yours. Nothing is saved until both values are right.
7. Do **not** put these two in Vercel; the portal is where they live.

The same card shows the **Webhook URL** (with **Copy**) for step D and the line "Webhook secret: stays in Vercel (`RAZORPAY_WEBHOOK_SECRET`)".

## D. Webhook
1. Razorpay (Test Mode) → **Account & Settings → Webhooks → + Add New Webhook**.
2. **Webhook URL**: `https://home.wonderapps.biz/api/v1/billing/webhook/razorpay` (the Razorpay card has it with a **Copy** button).
3. **Secret**: make a long random one (for example 40 characters from a password manager). Keep it for step 5.
4. **Active events** — tick exactly these:
   - `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`, `subscription.completed`
   - `payment.failed`
   - `refund.processed`, `refund.failed`
   
   Then **Create Webhook**.
5. This secret is the one key that **stays in Vercel**: vercel.com → project **wonderhome** → **Settings → Environment Variables** → add `RAZORPAY_WEBHOOK_SECRET` = the secret, environment **Production** → Save → **Deployments → … on the latest → Redeploy**.

## E. Prices and paid plans (your decision)
1. Platform admin → **Plans & billing**. Each plan card shows its monthly and yearly price; **Edit** to change them (today Pro ₹299/₹2,870 and Max ₹599/₹5,750 a month/year). Save.
2. **Integrations → Payments → Payment providers** (just below the Razorpay card; its "Switch on in Payment providers" link goes there) → **Change** → **Razorpay** → Save. (Provider for India stays **Razorpay**.) The Razorpay card then says **Switched on**.
3. Back on **Plans & billing → Payment provider plans**: press **Create in Razorpay** on every price. Each row turns **Linked to Razorpay**. (Already made a plan in Razorpay? **Link an existing plan** and paste its `plan_…` id; it is linked only if it bills exactly that price.)
4. On each plan you want to charge for: **Edit** → tick **Members pay for this plan** → **Review changes** → **Save changes**. From then on, choosing that plan opens the payment window; until you tick it, the plan stays "Free during early access". Households already on it stay on it unbilled until they change plan.

## F. Test-mode trial
1. Sign in as an Admin of a test household → **Settings → Your plan** → **Monthly** → **Pro** → **Continue to payment**.
2. Razorpay's window opens. Pay with test UPI `success@razorpay`, or card `4111 1111 1111 1111`, any future expiry, any CVV, OTP `1234` (Razorpay's current test values are on its "Test card details" page).
3. You return to "Payment confirmed" within a few seconds; **Your plan** shows Pro, and **Billing** shows the payment and its receipt line.
4. Try a failure with UPI `failure@razorpay`: nothing changes and the attempt shows as "Didn't go through".
5. **Cancel at the end of the period** on Your plan: the plan stays, with its end date.
6. Razorpay → **Webhooks** → the webhook → each delivery shows **200**. If you see 401, the webhook secret in Vercel doesn't match (step D5).

## G. Live keys
1. After activation: switch the dashboard to **Live Mode** → **Account & Settings → API Keys → Generate Live Key**.
2. Paste the live **API Key** (`rzp_live_…`) and **Key Secret** into the **Razorpay** card on **Integrations → Payments** together, as in step C; they replace the test ones.

## H. Live webhook
Repeat step D in **Live Mode** (Razorpay keeps test and live webhooks separate). Use a **new** secret, put it in Vercel as `RAZORPAY_WEBHOOK_SECRET` (replacing the test one) and redeploy.

## I. Live plans
Test-mode plans don't exist in live mode. On **Plans & billing → Payment provider plans**, press **Create again in Razorpay** on every price (or **Link an existing plan** with a plan you made in live mode). Each new link replaces the test one.

## J. ₹1 live trial (optional, about 10 minutes)
1. On **Plans & billing**, edit **Pro** monthly to **1** → Save → **Create in Razorpay** on the new ₹1 row. (Any household could buy Pro at ₹1 while this lasts: keep it short.)
2. Buy it from your own household with your own UPI, as in F.
3. Check Your plan and Billing, then **Cancel at the end of the period**.
4. Refund it in Razorpay: **Transactions → Payments** → the ₹1 payment → **Issue Refund**. Billing shows it refunded once Razorpay confirms.
5. Edit Pro monthly back to **299** → Save → **Create in Razorpay** on that row.

When F (or J) works, tell Claude "Razorpay is live" so the release notes and the "Free during early access" wording can be updated.
