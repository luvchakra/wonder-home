# A request is never taken as an answer; every email leaves a trace

2026-10-23. Two problems the owner hit while testing notifications.

## "Remind me…" answered with "How is Manan related to you?"
- **What happened:** with Ask me about family running, the owner said "remind me to call the plumber in 10 minutes". HomeTalk replied "Sorry, I didn't quite get that. How is Manan related to you…?" and set no reminder.
- **Cause:** while Ask me about family (or the welcome) has a question waiting, `hometalk-turn.ts` read the next sentence as its answer. Only a question back escaped (`looksLikeQuestion`). A request did not, so it was read as a relationship, failed, and the question came back.
- **Fix:** a new rule, `conversation/request.ts`'s `readsAsRequest`, is true when either:
  - the rule reader names an action only a request carries (a reminder, the list, a plan, a payment, opening a screen…);
  - or the sentence opens the way a request does ("call the plumber tomorrow", "I need to buy milk").

  Such a turn goes through the ordinary turn, and the waiting question rests, as it already did for a question back.
- **What stays an answer:** readings an answer can share stay answers: a food like or dislike, who does a duty, a helper's days, a health note.
- **Where else it applies:** the welcome's questions use the same check.
- **What was not affected:** a follow-up HomeTalk asked itself, and a pending proposal, already go through the model with what is waiting, so they never had this gap.

## A test email that never arrived
- **What we know:** "Send a test" said "Test sent", which happens only once GoDaddy's server has accepted the message. So the email left WonderHome, and the loss happened after it.
- **What could not be checked:**
  - A test send leaves no row, by design, so it doesn't count toward the daily ceiling, and there was no record to read.
  - This session cannot open SMTP ports, and the Vercel log API refused it.
  - The only send ever confirmed earlier (2026-10-18) went to connect@wonderapps.biz itself, on the same GoDaddy server, so delivery to an outside inbox had never been verified.
- **DNS:**
  - SPF `include:secureserver.net -all` is in place.
  - DMARC is `p=reject`.
  - No DKIM key was found at the common selector.
  - Without DKIM, Gmail is likely to file the message as spam.
- **Fix:**
  - `email/mailer.ts` now logs, for every send, the server's message id and reply code, never the address or the server's prose. "It never arrived" can now be followed into GoDaddy's logs.
  - A server that takes the message but refuses the one recipient is now a rejection, not "sent".
- **Still open, for a person:**
  - check the recipient's spam folder;
  - turn on DKIM for wonderapps.biz in GoDaddy, if the mailbox plan offers it;
  - then press Send a test again.

## Verified
- `conversation/request.test.ts`: 35 cases, requests and answers.
- `email/mailer-send.test.ts`: 3 cases, against a faked mail server.
- The conversation, Ask me about family, email, notification and identity suites pass (693 and 463 tests). Typecheck passes.

## Follow-up: GoDaddy checked from a Vercel sandbox, and the same pattern as WonderJobs
- **The mailbox works.** Logging in to `smtpout.secureserver.net` as connect@wonderapps.biz succeeds on 465 and on 587. GoDaddy accepted a test to the mailbox itself and one to the owner's account address ("250 mail accepted for delivery").
- **Where the test went.** The owner's WonderHome account signs in with Google as a different Gmail address from the one first checked. "Send a test" goes to the confirmed email of the account that pressed it.
- **Compared with WonderJobs.** `server/notify.ts` uses the same library, host, port and From pattern, and closes the connection after every message. `email/mailer.ts` now does the same (`transport.close()` in `finally`), so a serverless function never leaves an idle session open.
- **DKIM.** No DKIM key was found under any common selector. Turning it on in GoDaddy remains the step that makes Gmail trust these messages most.

## Follow-up: WonderHome emails went to spam, WonderJobs' did not
- **What the owner saw:** every WonderHome email was in the spam folder of the account's own address. WonderJobs mail from the same connect@wonderapps.biz mailbox and the same GoDaddy setup reaches the inbox.
- **The difference:** with the same sender and the same authentication, the difference was the message itself.
  - WonderJobs (`server/email/layout.ts`) sends a whole HTML document (language, charset, title), a hidden preview line, a greeting by name, a logo, and a footer naming the sender, why the person got it, and links to notification settings and privacy.
  - WonderHome sent a bare card with no `<head>`, no charset and no footer naming anyone.
- **The fix:**
  - New `email/layout.ts` (`renderEmailLayout`, `emailButton`, `firstName`), modelled on WonderJobs'.
  - Both the notification email and the invitation email now go through it.
  - The notification email greets the reader by first name. It links to Notification settings and Privacy, plus the one-tap email off where there is one, in the reader's language. Three new phrases exist in all eight catalogs: `notificationEmail.hello`, `.settings`, `.privacy`.
  - "Send a test" carries the same words, greeting and footer as a real reminder.
- **Verified:**
  - `email/layout.test.ts`: the document head, the preview line, the sender and the footer, the greeting, escaping, the invitation, and first names.
  - The email, notifications, identity, i18n and app action suites pass (497 tests). Typecheck and lint pass.
- **To confirm after deploy:** the owner presses Send a test and checks whether it lands in the inbox. DKIM for wonderapps.biz remains the further step.

## Follow-up: a family-friendly look (the owner, 2026-10-23)
- **The look:** bright pastels, round edges, a nice font and some art.
- **The palette** (`EMAIL_COLORS` in `email/layout.ts`):
  - a soft peach page and a white card with 28px corners;
  - blush, butter, sky and mint accents;
  - the brand's indigo kept for the one button (DESIGN rule 3), as a shadowed pill.
- **The art.** `apps/web/public/email/hello-home.png` (1120×440, shown at 538 wide) is the landing page's `HomeIllustration` on a pastel sky with hearts, a star and dots. It was rendered once to PNG because mail apps show neither SVG nor CSS backgrounds reliably. PNGs are outside the middleware matcher, so mail apps fetch it without a session.
- **The fonts.** Sora for the text and Caveat for the closing "Less mental load. More family time!" come from Google Fonts in the email's head. Apple Mail and iOS honour them, and other clients fall back to friendly system faces. The tagline is decoration: everything a reader needs is also said in the body.
- **Footer links** are small rounded pills.
- **Checked** at 360px and 720px: no sideways scroll, the art scales, and the pills wrap.
