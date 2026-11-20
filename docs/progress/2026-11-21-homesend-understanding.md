# 2026-11-21 — HomeSend understanding: never without the model, then complex messages

The owner forwarded an exam timetable photo and a long school notice on WhatsApp on 20 Nov and got "I kept it, but I couldn't tell what it's about. 🤔 It's waiting in HomeSend for you to check." twice. Anthropic had been refusing WonderHome's platform key since 14 Nov (one open `key_rejected` alert, 67 failures, last at 18:13:46 UTC, inside the minute the photo was read): no model read either message. The reply was the rules' fallback speaking as if the content were unclear.

## Part 1 — the assistant never quietly runs without its model (14-073)

### (a) Is the key saved in Platform admin the key every path sends?

Not everywhere. What the code allowed:

| Path | Before | Now |
| --- | --- | --- |
| HomeTalk turn, HomeSend ingest (WhatsApp, email, share, upload), dish ideas, health reports, school, trivia, sleep, tidy, Gemini Live, Home's cat — on Vercel | `platformKey()` reads `runtimeEnv()`: the saved value laid over the deployment variable, refreshed every minute | the same, through `currentPlatformKey()` |
| Vercel, cold server whose first read of the saved values took over 3 s (or failed) | the deployment's `WONDERHOME_AI_KEY` until the read landed | waits for that first read (up to 5 s) before any model call (`settledRuntimeEnv`) |
| GitHub runner (`scripts/jobs.mjs`: tidy, HomeBrain sleep, trivia refill, and the clock's deadline pass, which queues second reads) | never loaded the saved values: always the repository secret `WONDERHOME_AI_KEY` | loads the saved settings before running (`enablePlatformSettings(15_000)`); `runJob` reads `runtimeEnv()` |

So both of the coordinator's possibilities were possible in code: (b) for the GitHub runner always and for a cold Vercel server briefly; (a) is not excluded either. Because only one alert is open, and a working saved key would have read the photo on Vercel (where the saved value is used once loaded), the likeliest explanation is that the key saved on 20 Nov 14:36 UTC is the same key Anthropic refuses — or the photo was read on a cold instance. The alert's fingerprint can be compared with the saved key without reading it:

```sql
select a.key_fingerprint = encode(sha256(convert_to(s.decrypted_secret, 'UTF8')), 'hex') as saved_key_is_the_refused_one
from public.ai_key_alerts a, vault.decrypted_secrets s, public.platform_config c
where a.resolved_at is null and a.provider = 'anthropic'
  and c.key = 'WONDERHOME_AI_KEY' and s.id = c.vault_secret_id;
```

Proof: `packages/core/src/ai/platform-key-path.test.ts` saves a key different from the environment variable and asserts the cold-server read, HomeSend's reading and the runner all get the saved one, and that no source file reads `process.env.WONDERHOME_AI_KEY` or resolves a model key from the synchronous copy.

### (b) Checked on save, "Test key", the alert on the card and Overview

- Saving `WONDERHOME_AI_KEY` checks it with the chosen provider first (`ai/key-check.ts`: list one model, key in a header, never logged). Refused: "Not saved. Anthropic refused this key. Create a new key in Anthropic's console and save it here." A Google key with the provider on Anthropic: "This looks like a Google key but the provider is set to Anthropic. Set the provider to Google, or paste an Anthropic key." Unreachable: saved, and the card says it couldn't be checked. Saving a provider that doesn't match the saved key's format warns.
- Platform admin → AI & providers has a "Is WonderHome's key working?" card: provider, "ending in XXXX", the open alert in words ("Since 15 Nov, Anthropic has refused WonderHome's key: nothing has been read by a model, and N items were read by rules only. Save a working key, then press Test key."), and "Test key". The same line heads Overview. A pass closes the alert at once.
- Nothing of a key reaches the browser beyond its last four characters.

### (c) Told every day; stale alerts closed

`tellPlatformAdmins` emails owners and operators when an alert opens and again every 24 hours it stays open ("Still not fixed, day N: …", with how many things were kept unread), claiming the day's send first so two servers never both send. `supersede_ai_key_alerts` closes an open alert whose fingerprint is neither a current platform secret nor any household key (`resolved_reason = 'superseded'`); a call that works closes with `'worked'`. Not done: a push to a platform admin's member account (needs a household notification source for a platform alert); email only for now.

### (d) Honest fallback

- `ingest.ts`: a provider that refused or couldn't be reached (`classify` gave nothing) keeps the item as failed `model_unavailable` (`homesend/model-unavailable.ts`), not "unknown". If the database doesn't know the reason yet (migration not applied), the old reading is kept: safe in either order.
- WhatsApp reply: "Got it 👍 I've kept it. I can't read it right now, and I'll read it as soon as I can and tell you what I did." (eight languages).
- `deadlines.ts` waits on it, the tidy keeps it; no Needs-you question.
- Retry: the classify retry job (one per item, the queue's backoff capped hourly, 340 attempts ≈ 14 days) now reads such an item the way it was sent (a photo as a photo, via `rereadFailedItem`); only a drain that has `afterModelRead` (the delivery clock: dispatch and retention) reads it, so the record-first add and the one message to its sender always follow. On WhatsApp the sender gets "📬 I've now read what you sent earlier." plus what was added; outside WhatsApp's 24-hour window that message can be refused, and the evening summary is the report.
- Backfill as product behaviour: the clock's sweep (`queueModelReads` in `clock.homesend-deadlines`, and its Vercel fallback) gives items from the last 14 days that the rules alone answered (classified `unknown` with an empty reading, still waiting or set aside by a rule) the same retry, and after 14 days lets one go the ordinary way. The owner's timetable and school notice qualify; nobody's data is edited by hand.
- Settings → AI Assistant: an Admin of a household on WonderHome's key sees one calm line while the key is refused; members see nothing of it.

### (e) Why three minutes from created to updated

The webhook acknowledged in 11 s (created 18:11:56, acknowledged 18:12:07): the reading did not hold the reply. The update at 18:15:04 is the next clock pass marking the unread item for a second read (`needs-you-run.ts` `readAgain` sets `retry_count`), not a slow model call. A 401 was never retried by the SDKs (Anthropic and OpenAI retry 408/409/429/5xx and connection errors only, at most once here). Still, each step of a reading (OCR, a read, a stronger read) asked the provider separately; now a refused key is not sent again for a minute on that server and the call fails at once as a refusal. Also found: the old classify retry skipped any item without text, so a photo was never read again at all.

### Verified

- `npx vitest run` on the touched areas: ai (key path, key check, alerts, platform alert), homesend (ingest, deadlines, tidy, email webhook, model-unavailable), jobs runner, WhatsApp intake, platform settings and platform-admin actions, help and i18n: all green.
- `tsc --noEmit` for `packages/core` and `apps/web`.

### Open / needs a person

- The owner saves a fresh Anthropic key; the card then says whether Anthropic accepted it. Run the fingerprint SQL above once if it still fails.
- Apply migration `20261121020000_model_unavailable_and_stale_key_alerts.sql` (SQL sent to the coordinator).
- Not verified against a live model (no provider key in this container): the provider check's real 200/401 answers and the retry reading a real photo.
- GitHub repository secret `WONDERHOME_AI_KEY` can be deleted once the saved key works (the runner now uses the saved one).
