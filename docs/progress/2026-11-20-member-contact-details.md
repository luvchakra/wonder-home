# 2026-11-20 — A member's contact email and phone (01-015)

The owner, from a phone screenshot of their own details sheet on Profile: "add email, phone as attributes in profile".

## What already existed, and how the new fields relate

- **Sign-in email** (`household_member_emails`, `identity/member-email.ts`): the address a person signs in with; a verified sign-in with it links the account to the member. Set by an Admin in someone else's sheet in Family.
- **Sign-in phone** (`household_member_phones`, `identity/member-phone.ts`, story 01-011): the number a verified phone sign-in links. Admin-only. It was labelled "Phone number" in the sheet and "Phone" on the card; it is now "Sign-in phone" in both, in all eight languages, so it can't be mistaken for the new contact phone.
- **WhatsApp link / HomeSend trusted senders**: their own verified records; untouched.
- Your **own** sheet (Profile) showed neither email nor phone, which is what the screenshot showed.

The new **Email** and **Phone** are contact details: how the family reaches a person. They live in their own table, `household_member_contacts`, which nothing reads to sign in, link an account, verify or link a WhatsApp number, trust a sender, or tell who sent something. They are excluded from the knowledge registry, so no model sees them, and the audit trail records only "details updated", never the values. When the person has a sign-in email and the contact email is blank, the sheet offers "Use the sign-in email: …" as one tap. Nothing is filled in on its own, and only one contact email is stored.

## Where

- Sheet: `apps/web/app/_components/member-profile-form.tsx`. The fields come after the name fields and before Date of birth, with `type="email"`/`type="tel"`, `inputMode` and `autocomplete`. The sheet is used on Profile (yourself) and in Family / Househelper (an Admin editing someone).
- Save: `updateMemberProfileAction`, the same "Save details" governed write. The fields are checked with Zod before anything is written (`identity/member-contact.ts` `parseMemberContact`), and the phone is normalised with the existing `normalPhone` (an Indian 10-digit number becomes +91, anything else needs its code). What was typed is kept in `phone_as_typed` and shown back in the sheet.
- Shown: the Family/Househelper card (`member-detail.tsx`) and the Profile "You" card, as tap-to-mail / tap-to-call links, wrapping rather than truncating. The sign-in email or phone fact is not repeated when it equals the contact one.
- Who: the member and any Admin write. Admins and the member read; adults read adults' and helpers'; a child's details are read by their guardians and Admins only; a child reads only their own. RLS uses set forms only.

## Safe in either order

`readMemberContacts` returns `null` when the table is missing (42P01/PGRST205). The pages then hide the two fields and the action skips them, so the deploy works before the migration. Migration: `supabase/migrations/20261121003000_member_contact_details.sql` (additive; indexes on the two foreign keys).

## Verified

- `member-contact.test.ts`: validation, the permission, save/unchanged/clear, and behaviour before the migration.
- `scripts/test-member-contacts-rls.mjs` against a local Postgres 16 built from every migration: writers, readers per role, format checks, and a verified phone equal to a contact phone linking nobody. `test-member-phone-rls.mjs` and `test-setup-counts-rls.mjs` still pass (15/15).
- Help, i18n and knowledge tests; `lint:migrations`, `lint:knowledge`, `lint:help-links`; typecheck; ESLint on changed files; web build.
- **Not browser-checked signed in.** This container has no `apps/web/.env.local`, so no QA household could be created and no QA data was made (nothing to clean up). After the migration is live, the owner should open Profile → pencil at phone width.

## Open

- The migration must be run on the live project. Supabase MCP tools are not used in these sessions, so the SQL went to the owner via the coordinator. 01-015 moves to Done once it is live (`npm run verify:live` checks the table and that anonymous visitors can't read it).
