# Health documents: "Who is this for?" instead of filing under the sender

2026-11-20. Owner: "fix the health document issue".

## The gap

After #560 (waiting items added as Checking, "Add this bill?" only under
"Wait for review") and #561 ("Who may file health records for others"), a
health document from a sender **not** on the Admin's list that named someone
else, or nobody, still ended up in the sender's health record:

- `hometalk/needs-you-run.ts` → `homesend/deadlines.ts` `endingFor` gave such
  a document `add` (health recorded directly) or `ask_add` ("Add this health
  document?", default **Add** after 24 h);
- `homesend/add-default.ts` `addWaitingItem` then filed it with
  `memberId: sender`.

That broke two standing rules: a default never fills who a health document is
for, and nothing (rule, history or default) does. `"health_for_other"` was
listed in `ASKING_SOURCES` but nothing ever asked it.

Reproduced first: eval HS-99, HS-120, HS-121 and HS-123 fail on the old rule
as `wrong_action, unsafe_execution` (checked by disabling the new branch).

## The fix

- `health-filers.ts` `healthSubjectFor`: from the document's own words
  (`subjectMemberName`, `people`) and the household's members — `sender`
  (the one member it names is the sender), `other` (someone else, someone
  outside the household, several people) or `unclear` (nobody).
- `deadlines.ts` `endingFor`: for a sender not on the list, a waiting health
  document is added (or offered "Add") only when `sender`. Otherwise
  `ask_health_for`: one `homesend_health_for` Needs-you row, **to the sender
  only** (the item is private to them by RLS), answers "It's mine" / "Set
  aside", **default Set aside** after 24 h. With no sender who can answer it
  is set aside at once.
- **The ending picked**: set aside, `archive_reason = health_not_claimed`,
  restorable from HomeSend's "Set aside". The most conservative ending
  consistent with `docs/design/2026-11-14-nothing-stuck-in-review.md`: it ends
  well inside 48 h, is never filed for anyone, and is not kept as a household
  note (HomeTalk shows notes to the household, which would expose health
  detail).
- `effectOf`: "It's mine" files only on a person's tap (`forSender`), never by
  default; `add-default.ts` re-checks itself — a health document without
  `healthFor` is filed for its sender only when its words name them or the
  sender tapped "It's mine". So an "Add this health document?" row asked
  before this change no longer files it by default.
- Senders on the Admin's list keep #561's behaviour (`file_for`).
- Member read moved behind `household/direct-add-repository.ts`
  `loadHealthMembers` (X-003: HomeSend files touch only HomeSend's tables).
- UI: prompt `homesend.health_for`, answer `for_me`, archive reason label, in
  all eight languages; help "home-send" body 9 in all eight.

## Migration

`supabase/migrations/20261120233000_homesend_health_not_claimed.sql` adds
`health_not_claimed` to `home_send_items_archive_reason_check`. Safe in either
order: before it runs the archive is refused, the default stays unapplied
(the row expires at 48 h) and the document keeps waiting, never filed. Not
applied by this session (Supabase MCP refused here); SQL sent to the
coordinator for the owner.

## Verified

- Eval (owner's rule: only the touched cases): HS-96–105, HS-120–123, 14/14.
- Unit: `homesend/deadlines.test.ts`, `health-filers.test.ts`, new
  `health-for.test.ts`, `hometalk/needs-you-run.test.ts` (new case: both
  "review" and "direct", naming someone else and nobody → asked of the
  sender, defaulted to set aside, no health record), `needs-you.test.ts`,
  `evaluation/test-spec.test.ts`, the whole `homesend/` folder, help and i18n.
- Typecheck; ESLint on the web files; migration, boundary, service-role and
  help-link lints.

## Open

- The migration must be applied to the live project.
- An item restored from "Set aside" is not asked again (as with "Add this
  bill?"); the HomeSend review lets the sender pick who it is for.
- No QA data was created.
