# Push notifications that arrive in time; a tall invitation with a preview

**Date:** 2026-10-18 · **PR:** #237 · **Stories:** 23-013, 26-012, 04-024

## What was done

- **Push notifications (23-013).**
  - **Sending.** Standard Web Push with VAPID (`packages/core/src/notifications/web-push.ts`, the `web-push` package): no third-party account in between, the same on Android, desktop and an iPhone with WonderHome on its Home Screen. The push channel becomes live in `channelAdaptersFromEnv` once a deployment sets `WONDERHOME_VAPID_PUBLIC_KEY` and `WONDERHOME_VAPID_PRIVATE_KEY`.
  - **Devices.** Migration `20261018280000` adds `push_subscriptions`: a member reads, adds and removes only their own devices, an Admin sees none of anyone else's, and only the server records send results.
  - **Settings.** Settings → Notifications has "Push on this phone" (`_components/push-device-card.tsx`): turn on, send a test, turn off. It says in words when push is not set up, not supported, or blocked. `public/sw.js` shows a push and opens the right screen; it caches nothing.
  - **Only when it matters.** `pushWorthSending` (`push-gate.ts`): critical always, high up to 8 a day, a reminder timed for the person up to 4 a day, low never, and an ordinary alert stays in the app. Quiet hours hold except for critical. The recipient, timing and language were already decided upstream: one recipient, a per-person time, and words in their language. A newer word on the same thread replaces the older on the phone (tag), and a device the push service calls gone is forgotten.
  - **On time.** pg_cron calls `/api/v1/notifications/dispatch` every five minutes (`deliverDueNotifications`, pulled out of `reconcile.ts`), so a reminder lands at its time instead of at the next visit. It is authorised by the cron secret, read from Vault as `cron_secret`; until that is stored the job does nothing.
- **A tall invitation and a preview (26-012).**
  - Share invitation sends the invitation as a 1080×1350 picture with the link (`e/[token]/card`; one renderer with the link preview, `render-invitation.tsx`). The wide picture stays the link preview, since a chat only shows a wide one large.
  - Preview in the design picker shows the invitation with the picked design and line before saving.

- **Gemini's voice through the floating window (04-024).** The owner said yes to the fix proposed for "switching apps doesn't float it": Chrome floats only media that is audibly playing, and the armed window was silent. Gemini's voice now goes through one node that plays into the armed video's stream (`attachVoice` in `live-talk.tsx`, `voiceStream`/`releaseVoice` in `use-gemini-live.tsx`), heard once; where sound may not play, it stays on the speaker.

## Verified

- Typecheck; lint; unit tests (core incl. new `push.test.ts`, web); notification tests 139/139; security; eval gates; help links; tracker check; production build; bundle check.
- `test-push-subscriptions-rls.mjs` 6/6 and the full `test:db`.
- Migration applied live; the cron job exists and is active; `verify:live` 292/292.
- Locally, with a QA-only key pair in git-ignored `.env.local`:
  - Chromium subscribed through Google's push service, and "Send a test" was accepted.
  - A normal bill reminder for the QA member was delivered by `deliverDueNotifications` as a push (`sent` on the push channel); a low one stayed in the app.
  - The dispatch route refuses no secret and a wrong one (401).
- Browser: the picker's preview (wedding) at 360px; three designs drawn tall; Share invitation opened the picture where the browser cannot share files.

## Open / for a person

- **Production keys.** Production push needs the VAPID key pair on Vercel (`WONDERHOME_VAPID_PUBLIC_KEY`, `WONDERHOME_VAPID_PRIVATE_KEY`, optionally `WONDERHOME_VAPID_SUBJECT`).
- **Cron secret.** The database needs the cron secret in Vault: `select vault.create_secret('<the CRON_SECRET value>', 'cron_secret');`.
- **Real phones.** Whether Chrome on Android now floats a Gemini Live conversation by itself is a real-phone check; A real-phone check on Android and an iPhone with WonderHome on the Home Screen is the owner's.
- **QA cleanup.** Checked on 2026-10-18 after the later merges (through #237): no `wonderhome-qa-verify.internal` account remains on the live project and no QA household this work created is left; the count was taken with `select … from auth.users where email like '%wonderhome-qa-verify.internal'`. Two older QA households from 2026-10-17 (`QA Welcome Home` b942c154…, `QA Hours Home` 7ab6da76…) could not be proven to be this work's and were left in place. The QA-only VAPID keys and local `CRON_SECRET` were removed from `.env.local`.
