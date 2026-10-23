# WhatsApp live on the test number; voice notes, questions and "a product of WonderApps"

## Why
The owner set up the WhatsApp Business API (2026-10-23). Linking, a forwarded PDF and the
acknowledgement all worked on Meta's test number, but two things went wrong:
- a voice note failed safely with "Voice notes need a speech service": HomeSend only took a
  Google Cloud Speech key, though the household has a Gemini voice key;
- "whats plan for the morning" was filed as an unreadable HomeSend item.

Meta's business verification also needs the website to show who runs WonderHome, and
`/privacy`, the address given to Meta, went to sign-in.

## What was done
- **Voice notes** (`homesend/ingest.ts`, `homesend/audio.ts`, `voicelink/live-transcribe.ts`):
  - with no Cloud Speech key, the note is written down by the household's Gemini voice key, else
    the assistant's key when it is Google's;
  - only where the data-use agreement lets content reach Google (`geminiMayTranscribe`);
  - Gemini gives no confidence, so its line is taken at 0.8: clear for everyday things, below the
    0.9 floor for paying or ordering, which are shown back to be checked.
- **Questions on WhatsApp** (`whatsapp/intake.ts`): a short one-line question gets one reply
  pointing to HomeTalk and is never a HomeSend item. A forward, a list or a link is still content.
  New closed event `question_redirected` (migration `20261024090000_whatsapp_question_event`,
  applied live).
- **Website:** the landing footer and Terms & privacy say "WonderHome is a product of WonderApps",
  with "Who runs WonderHome" on `/legal`. `/privacy`, `/privacy-policy` and `/terms` redirect to
  `/legal` before the sign-in gate. `NEXT_PUBLIC_CONTACT_EMAIL` is set to connect@wonderapps.biz.
  wonderapps.biz already lists WonderHome under WonderApps, so it needed no change.
- **Help:** the WhatsApp paragraph says both, in all eight languages.

## Verified
- core and web `tsc` clean; changed files linted.
- 801 tests across help, i18n, homesend, whatsapp, voicelink and security pass, including new
  cases for questions vs content and the Gemini gate.
- `lint:secrets`, `lint:migrations`, `lint:knowledge`, `lint:help-links`, `lint:boundaries`,
  `check:bundle` and `npm run build -w apps/web` pass.
- On the local production build, `/privacy` answers 308 to `/legal#your-information`, and both
  pages show the WonderApps line.

## Live WhatsApp setup (environment, no code)
- Production uses Meta's test number (+1 555 196 3004, phone number id 1474534869068358).
  `WHATSAPP_*` are in Vercel; the webhook is verified and subscribed to `messages`.
- The real number +91 93219 99679 (id 1409693822223809) is in WhatsApp account 2229379580960072,
  which is subscribed to the app. Registering it was refused: the account is not business
  verified. After verification, `POST 1409693822223809/register`, then switch
  `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_BUSINESS_NUMBER` and redeploy.
- Templates `wonderhome_notice` (in use) and `wonderhome_update` are in review as Marketing.

## Still open (needs a person)
- Udyam registration and Meta business verification as WonderApps.
- Whether WhatsApp should answer questions through HomeTalk, as Alexa does, rather than point
  to the app: a product decision.
