# Moving settings from Vercel into the admin portal

A guide for the owner, written to follow on a phone. Platform admin portal, story 16-010 (owner, 2026-11-07).

WonderHome reads each setting in this order:
1. the value saved in the portal;
2. the Vercel variable;
3. the built-in default.

So nothing breaks while you move settings over. Delete a Vercel variable only once its row shows **Saved here** and you have checked the feature still works.

## The one-button way (start here)
1. Open **home.wonderapps.biz/platform-admin** → **Configuration** → **Move all from Vercel** (Integrations and Secrets link to it too). Owner only.
2. Tap **Move all from Vercel**. It doesn't ask for your password (owner, 2026-11-07).
   - Every setting Vercel has and the portal doesn't is saved here, in one go. Secrets go to Supabase Vault, as a manual save does.
   - A setting already saved in the portal is never overwritten.
   - Nothing that must stay in Vercel is ever moved.
3. Read the result. It counts what was **moved**, **already in the portal**, **not set** in Vercel and what **must stay in Vercel**, then one line per setting:
   - **Moved**: saved, and it reads back the same as Vercel's (a secret by its last four characters).
   - **Already here**: left as it is.
   - **Check it**: saved, but it reads back differently. Open its row before deleting anything.
   - **Not moved**: Vercel's value isn't one the setting accepts, or it couldn't be saved just now. Enter it on its row, or run the button again in a minute.
4. Tap **Copy list** under **Safe to delete in Vercel**. Delete those variables in Vercel (project `wonderhome` → Settings → Environment Variables → each variable's ⋯ menu → **Delete**, in every environment), then redeploy once.
   - WonderHome deletes nothing in Vercel itself: the app holds no Vercel token.
   - The Vercel value stays a fallback in code, so a variable you leave behind does no harm.
5. Leave the **Must stay in Vercel** list alone; each has its reason beside it.

Running it again is safe: it moves only what is new. The 20-changes-a-minute limit is checked once for the whole move, but it writes one Security → Setting changes line per setting, so for a minute after a big move a manual save may say "That's a lot of changes in a minute".

The rest of this guide is the one-setting-at-a-time way: use it for a setting the button reports as **Not moved** or **Check it**, or to enter a value Vercel never had.

## Before you start (once)
1. Run the three migrations, if they have not been run yet: dashboard → project `wonderhome` → SQL Editor. Run in order:
   - `supabase/migrations/20261107200000_platform_settings.sql`
   - `supabase/migrations/20261107210000_platform_config.sql`
   - `supabase/migrations/20261107230000_platform_config_import.sql` (already applied to the live project on 2026-11-07)
   - the `insert into supabase_migrations.schema_migrations …` line from PR #519.
2. Open **home.wonderapps.biz/platform-admin**. If the yellow note "The settings store isn't reachable just now" still shows, the migrations aren't in yet.
3. Have the values ready.
   - Vercel won't show you the **secret** ones: they are stored as "Sensitive". Copy each from where it came from (the provider's own dashboard), or make a new one there.
   - Plain values (numbers, names, on/off) can be read in Vercel: project `wonderhome` → Settings → Environment Variables → the variable's ⋯ menu.

## For each setting
1. Open the page and section named in the tables below.
2. Find the row by its label. The Vercel name is in small print under it.
3. Tap **Change** (for a secret, **Replace** or **Add**).
4. Enter the value. A choice is picked from a list, not typed. A secret also asks for your password.
5. Tap **Save**. The row now shows **Saved here**:
   - a setting shows its value;
   - a secret shows `••••` and its last four characters. Check those four match yours.
6. Check it works (the **Check** column). The new value is in use within a minute; no redeploy is needed.
7. Only then delete it in Vercel: project `wonderhome` → Settings → Environment Variables → the variable's ⋯ menu → **Delete**. Delete it from every environment it is in.
   - No redeploy is needed: the portal value is already in use.
   - The row then stops saying "Vercel still has this variable".

There is no **Test connection** button yet (story 16-011), so the **Check** column says what to try instead.

## Secrets (owner only, password each time)

| Vercel name | Portal page → section → row | Check |
|---|---|---|
| `WONDERHOME_AI_KEY` | AI & providers → AI → WonderHome's own AI key | In a household with no key of its own, ask HomeTalk something. It answers, and no "AI key failed" email arrives. |
| `WHATSAPP_ACCESS_TOKEN` | Integrations → WhatsApp → WhatsApp access token | Send a message to the WhatsApp number from a linked phone. It is answered or filed in HomeSend. |
| `WONDERHOME_SMTP_PASSWORD` | Integrations → Email → Mailbox password | Invite someone, or resend an invite. The email arrives. |
| `WONDERHOME_VAPID_PRIVATE_KEY` | Integrations → Web push → Web push private key | A push notification still arrives on a device that has turned them on. Enter exactly the current key: a new pair signs every device out of push. |
| `WONDERHOME_MALWARE_SCAN_KEY` | Integrations → HomeSend → Scanner key | Send a photo to HomeSend. It is read, not refused as unscanned. |
| `GOOGLE_MAPS_API_KEY` | Integrations → Maps and places → Google Maps key | Searching a home address (Settings → Location) suggests places. |

## Settings

| Vercel name | Portal page → section → row | Enter or pick | Check |
|---|---|---|---|
| `WONDERHOME_AI_PROVIDER` | AI & providers → AI → Provider of WonderHome's own AI key | the provider the key belongs to | Same as the AI key check |
| `ALEXA_SKILL_ID` | AI & providers → Voice and Alexa → Alexa skill id | `amzn1.ask.skill.…` | "Alexa, open WonderHome" still answers |
| `ALEXA_OAUTH_CLIENT_ID` | AI & providers → Voice and Alexa → Alexa account-linking client id | as in the Alexa console | Account linking in the Alexa app still works |
| `ALEXA_OAUTH_REDIRECT_URIS` | AI & providers → Voice and Alexa → Alexa redirect addresses (owner only) | the three addresses, comma-separated | Same as above |
| `WHATSAPP_PHONE_NUMBER_ID` | Integrations → WhatsApp → WhatsApp phone number id | digits only | WhatsApp check above |
| `WHATSAPP_BUSINESS_NUMBER` | Integrations → WhatsApp → WhatsApp business number | `+…` in international format | Settings → Connections shows the number to message |
| `WHATSAPP_TEMPLATE_NAME` | Integrations → WhatsApp → WhatsApp message template | e.g. `wonderhome_notice` | A WhatsApp reminder arrives |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Integrations → WhatsApp → WhatsApp template language | e.g. `en` | Same as above |
| `WONDERHOME_SMTP_HOST` | Integrations → Email → Mail server | the host name | Email check above |
| `WONDERHOME_SMTP_PORT` | Integrations → Email → Mail server port | pick 465 or 587 | Same as above |
| `WONDERHOME_SMTP_USER` | Integrations → Email → Mailbox | the mailbox address | Same as above |
| `WONDERHOME_VAPID_PUBLIC_KEY` | Integrations → Web push → Web push public key (owner only) | exactly the current key | Push check above |
| `WONDERHOME_VAPID_SUBJECT` | Integrations → Web push → Web push contact | `mailto:…` | Same as above |
| `WONDERHOME_WEATHER_PROVIDER` | Integrations → Weather → Weather | pick Open-Meteo | Home's date card shows the weather |
| `WONDERHOME_MALWARE_SCAN_PROVIDER` | Integrations → HomeSend → Upload scanning | pick Cloudmersive | Scanner check above |
| `WONDERHOME_INSTAMART` | Integrations → Grocery ordering → Instamart ordering | pick On (Swiggy) | Groceries still offers ordering on Instamart |
| `WONDERHOME_FLAG_VOICE_CONVERSATION` | Configuration → Features → Voice conversation | pick On or Off, matching Vercel | The mic shows (or not) in HomeTalk |
| `WONDERHOME_DEVELOPER_API` | Configuration → Features → Partner API | pick On | Partner keys still show in Settings → Connections |

## Delete now, nothing to move
- `SECRET_ENCRYPTION_KEY`: no code reads it. Stored secrets use Supabase Vault.

## Must stay in Vercel

| Vercel name | Why |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Needed to reach the database the portal's settings live in. It is also built into the pages. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Same reason. |
| `SUPABASE_SERVICE_ROLE_KEY` | The server reads the settings store with it. |
| `SUPABASE_ACCESS_TOKEN` | It controls the whole database project (Performance), so it is never kept inside that database. |
| `CRON_SECRET` | Checks that scheduled calls really come from the scheduler. The same value is in Vault for pg_cron. |
| `WHATSAPP_APP_SECRET` | Checks that WhatsApp messages coming in are really from Meta. |
| `WHATSAPP_VERIFY_TOKEN` | Meta's webhook handshake. |
| `ALEXA_OAUTH_CLIENT_SECRET` | Checks Alexa's account-linking calls coming in. |
| `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` | Built into the pages browsers load (the Google sign-in button). |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Built into the pages browsers load (landing page, Terms). |

## If something goes wrong
- **A feature stops after you delete a Vercel variable:** open its row. If it doesn't say **Saved here**, the value never saved. Save it again, or add the variable back in Vercel and redeploy.
- **Save says "That's a lot of changes in a minute":** wait a minute and try again. Twenty changes a minute is the limit.
- **Undo a saved value:** the row's **Use the Vercel value** (or **Use the default**) button removes it, and the next source takes over within a minute.
- **See who changed what:** Security → Setting changes, newest first. For a secret it shows only that it changed.
