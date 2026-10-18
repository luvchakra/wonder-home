# Owner's decisions: invite email, a child's own appointment, the dashboard policy, Maps check

2026-10-18. The owner settled four open questions from the priority report.
This note covers what each became.

## What was done

**WonderHome emails the member invite itself.**
- **The seam.** `packages/core/src/email/mailer.ts` is a provider-neutral seam with one implementation, SMTP through `nodemailer` 10.1.2. Older versions carry published advisories.
- **Inert until configured.** Nothing happens until `WONDERHOME_SMTP_HOST`, `_USER` and `_PASSWORD` are set.
- **Production settings.** Production sends from the GoDaddy mailbox connect@wonderapps.biz through `smtpout.secureserver.net:465`. The password is stored only as a sensitive variable in Vercel production, never in the repository.
- **Transport limits.** The transport may not read files or URLs. A failure comes back as a closed word, never the server's own error text.
- **The email.** `identity/invite-email.ts` lays it out from the inviter's language strings: one sentence, a button, the link written out, and an ignore line. Every value is escaped.
- **The action.** `emailMemberInviteAction` makes the same single-use link as **Create invite link**. It sends only to the email on record, read on the server, so the browser never names a recipient. It reports `sent` only when the mail server accepted the message.
- **The sheet.** When the member has an email and mail is set up, the Invite sheet offers **Email the invite to {email}** first, with **Create a link instead** as the second choice. After a send:
  - if it went, the second **Send email** (the Admin's own mail app) is removed;
  - if it failed, an amber notice keeps every other way to pass the link on.

**A child's own private appointment.**
- **The reply.** A child who asks about his own appointment hears: "You have a health appointment coming up. The adults in your family can see the details, so ask one of them." Before, he was told nothing was on record.
- **What reaches HomeBrain.** Only a count. The context snapshot carries `heldForAdults`, the number of the child's own upcoming appointments. It is read through `countUpcomingAppointments`, and RLS (`wh.may_see_health`) already lets the subject read those rows.
- **Where the answer comes from.** `heldForAdultsAnswer` gives it with no model involved.
- **What it never covers.** Another person's appointment, and any appointment detail.
- **Golden cases.** HT-82 covers the reply. HT-83 checks that asking about his mother's appointment says nothing about either appointment.

**The dashboard policy.**
- **The migration.** `20261018180000_dashboard_no_ai_credentials.sql` drops `wonderapps_dashboard_read` on `household_ai_credentials` and revokes the role's column grant there. Every other table keeps the policy.
- **Guarded.** It does nothing on a database without the role.

**The Maps-key browser check** for 24-005 and 24-006. Both are now Done.

## Verified

- **Gates:**
  - typecheck;
  - the unit tests for email, invite email, HomeBrain, context and evaluation (220);
  - `npm run eval` 113/113;
  - `lint:help-links`, `lint:secrets`;
  - a local production build.
- **Browser check at 360px and 1280px**, against the live project with a QA household:
  - **Invite sheet, email first.** The sheet offered the email first.
  - **A failed send.** The local build pointed at a closed SMTP port. The amber notice, the link, Send email and Copy all appeared.
  - **Office picker.** "WeWork BKC Mumbai" listed real results, and saving showed Office: WeWork.
  - **Add a place.** "Blue Tokai Coffee Bandra" listed three real branches, and saving added the place to the place book.
  - **Layout.** No horizontal scroll at either width.
- **A real send:** this sandbox cannot reach any SMTP port, so it was checked on production after the merge: GoDaddy accepted the email and the sheet said "Sent to connect@wonderapps.biz".

## Still open

- **The policy is not yet live.** The migration was written, but this session's attempts to apply it to the live project (`apply_migration` and `execute_sql`) were not approved. The owner runs it once (SQL in the PR).
- **Rotate the mailbox password.** It was pasted into a chat, so the owner should change it in GoDaddy, then update `WONDERHOME_SMTP_PASSWORD` in Vercel.
- **Email confirmation** for password sign-ups is still the owner's to confirm.
- **H-3 is still queued.** The `/places` lede still says places come "from HomeTalk".
- **Untranslated labels.** The member form's work-hours labels ("Work starts", "Work ends") are English-only, hard-coded in `member-profile-form.tsx`.

## Where it lives

- `packages/core/src/email/mailer.ts`, `packages/core/src/identity/invite-email.ts`
- `apps/web/app/(auth)/household-actions.ts`, `apps/web/app/_components/member-invite-control.tsx`
- `packages/core/src/homebrain/{answer,turn}.ts`, `packages/core/src/context/repository.ts`, `packages/core/src/health/appointments.ts`
- `supabase/migrations/20261018180000_dashboard_no_ai_credentials.sql`
