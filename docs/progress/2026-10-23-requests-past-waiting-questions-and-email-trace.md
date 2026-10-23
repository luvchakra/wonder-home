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
