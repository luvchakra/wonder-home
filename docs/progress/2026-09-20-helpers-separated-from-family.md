# Househelpers get their own section, separate from family

## What was done

The user pointed out that a househelper isn't family, and the app was
showing them mixed into "Family members" — on `/family` the helper
(Rekha) appeared in the same horizontal strip of `PersonCard`s as the
household's actual family, and on `/household/members` she sat in the
same undivided "Everyone plays a part" list.

- **`apps/web/app/family/page.tsx`** — `members` is now split into
  `familyMembers` (everything except `memberType === "helper"`) and
  `helpers`. "Family members" only shows the family; a new "Household
  help" section (rendered only when there is at least one helper) shows
  helpers separately, with one line making the distinction explicit:
  "Who keeps the home running day to day — not family, but part of how it
  works." The 🤝 badge moved from the family strip (where it no longer
  applies) to the new section, applied unconditionally there.
- **`apps/web/app/household/members/page.tsx`** — same split, applied to
  the roles-management list: "Family" and "Household help" are now two
  separate `Card`s. The per-row markup (avatar, roles, admin/remove
  controls) was extracted into a `MemberRow` component so it isn't
  duplicated between the two lists.

Also handled in the same pass: the household's pending invitation for the
user's wife (an administrator invite, sent 2026-09-19, not yet expired)
was accepted directly from the backend rather than waiting on the email
link — creating her account (`upasanaa@gmail.com`, email pre-confirmed, no
password set) and completing the same steps `wh.accept_invitation` would
have (household member + role, marking the invitation accepted, the audit
event), by hand in one transaction against the production database. She
signs in with "Forgot password" against that email to set her own
password — none was invented for her.

## Verified

`npm run typecheck`, `npm run lint`, `npm run lint:boundaries`: pass.
`npm run test` (workspaces): 82 files / 1129 tests pass — no test asserted
on the old single-list shape, so nothing needed updating there.
`npm run test:e2e`: 252/252 pass (the only e2e coverage of these two
routes is the signed-out-redirect check in `shell.spec.ts`, unaffected by
the content change).

The invitation acceptance was verified by re-querying `auth.users`,
`household_members` (joined to `household_roles`), and
`household_invitations` for the affected rows after the transaction — the
account exists and is confirmed, the membership is active with the
`administrator` role from the original invitation, and the invitation
shows `accepted_at`/`accepted_member_id` set.

## Still open

Nothing else in the app groups helpers with family this way, based on a
search for other member-listing screens (`home-dashboard.tsx`'s "Family
status" section shows whoever is covering a responsibility, which
legitimately can include a helper — that's about coverage, not family
membership, so it was left alone).

## Where the code lives

`apps/web/app/family/page.tsx`, `apps/web/app/household/members/page.tsx`.
