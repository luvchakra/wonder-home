# Set aside: Delete on each row, short names, and the daily Swag Labs paste (2026-11-20)

Owner, 2026-11-20: "give option to delete over here" (HomeSend → Set aside).

## What changed
- **Delete on every Set aside row** (`apps/web/app/_components/home-send-archived.tsx`). The
  "Delete for good" path from #528 was still in the code (`deleteArchivedHomeSendAction`,
  `deleteArchivedHomeSendItems`, the `home_send_items_delete_archived` policy, the
  `homesend.deleted` audit row). #546's compact Set aside list had hidden it. Restore and Delete
  now sit as one stacked pair on the right of each row, so the name keeps its width at 360 px.
  Delete asks "Delete permanently? This can't be undone." first. Only the sender (an adult) or an
  Admin sees it; the server and the RLS policy check again.
- **"Delete all set aside"** for Admins, above the list, behind a confirm that states the total
  set aside (not only the rows shown). An item that still has an entry on record is kept, and the
  result says how many.
- **Short names.** Set aside rows are named by `setAsideName` (`homesend/inbox-view.ts`): a read
  title, summary or email subject of at most 80 characters that isn't simply the start of the
  paste; otherwise the #515 short name ("A pasted web page", "A message"). The row no longer shows
  "Not sure yet" (an unknown kind); the reason line says what it is.
- Words: `homesend.setAside.delete|deleteAria|deleteAll|deleteAllTitle` in all eight languages.
  Help: `help.guide.home-send.body.12` in all eight; section `updated` set to 2026-11-20.

## The daily paste
It came from no E2E spec, script or workflow. It is the household's **"Secret Sauce" (saucedemo.com)
portal connection**, set up during the 2026-10-28 live bring-up
(`docs/progress/2026-10-28-connections-live-bringup.md`). pg_cron
(`wonderhome-portal-fetch-morning/evening`) queues its fetch, and the Fly worker files the page
through `homeSendPortalFiler` as pasted text: `"Open Menu\n\nDate: <day>\n\n…"`. It was filed again
every day because generic page dedup keyed on the fetch day (`page-extract.ts`), so the same page
counted as new each day. About 25 rows since 27 Oct, per the coordinator.

- **Fix:** a whole page now carries a `contentKey`, a digest of its text, and the cursor hash uses it
  instead of the date (`portals/page-extract.ts`, `portals/fetch-connection.ts`). An unchanged page
  files nothing; a changed page is filed again. The worker on Fly has no CI deploy, so this reaches
  live fetches only once the worker is redeployed (`fly deploy`).
- **Cleanup (2026-11-20):** the coordinator then ruled that the rows and the connection are the
  owner's, so the cleanup SQL was withdrawn. The owner had already run it: **24** Swag Labs items
  deleted, and the "Secret Sauce" connection set to disconnected, with its session cleared and pending
  fetch jobs removed. It deleted only items matching that connection's household, member, creation date and
  page text, with no live entry. **1** Swag Labs item remains (it missed a filter, or an entry still
  points at it); it is left for the owner's "Delete all set aside".

## Verified
- `packages/core/src/portals`: 43 passed (2 new: an unchanged page files once across days; same text, same key).
- `packages/core/src/homesend/inbox-view.test.ts`: 12 passed (4 new for `setAsideName`, one with the
  real scraped text).
- `packages/core/src/help/localized.test.ts` + `packages/core/src/i18n`: 78 passed. `lint:help-links` green.
- `tsc --noEmit` in `apps/web` and `packages/core` clean; ESLint on changed files clean.
- `npm run build -w apps/web` compiled; `check:bundle` green.
- Not verified at 360 px in a browser: this container has no `apps/web/.env.local`, so no QA user can
  sign in. The owner should check HomeSend → Set aside on a phone.

## Open
- Redeploy the portal worker (`fly deploy`) so the dedup fix reaches live fetches.
- The "Secret Sauce" connection is disconnected; the owner decides whether to remove it in Settings.
- 1 Swag Labs item is left for "Delete all set aside".
- No QA data was created by this session.
