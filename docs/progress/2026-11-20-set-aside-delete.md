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
The Swag Labs page came from no E2E spec or script. It was the **"Secret Sauce" (saucedemo.com)
portal connection** made in a real household during the 2026-10-28 live bring-up
(`docs/progress/2026-10-28-connections-live-bringup.md`). Once "Pages to read" was set on it, pg_cron
(`wonderhome-portal-fetch-morning/evening`) queued a fetch twice a day. The Fly worker filed each
page through `homeSendPortalFiler` as pasted text: `"Open Menu\n\nDate: <day>\n\n…"`. The daily
tidy then set each one aside as "Not household information". The fix is data: disconnect that
connection, then delete only the items it filed. A household that wants a portal sets up its own.

SQL (sent to the coordinator; the Supabase MCP refuses these sessions). It changes data only, not
the schema, so it is safe before or after the deploy:

```sql
-- 1. Look: the test connection(s) and what they filed.
select c.id, c.household_id, c.name, c.status, c.created_at, c.created_by_member_id
  from public.connections c where c.params::text ilike '%saucedemo.com%';

-- 2. Clean up, in one transaction.
begin;
create temp table sauce_conn on commit drop as
  select id, household_id, created_by_member_id, created_at
    from public.connections where params::text ilike '%saucedemo.com%';
create temp table sauce_items on commit drop as
  select i.id from public.home_send_items i
    join sauce_conn c on c.household_id = i.household_id
   where i.source = 'pasted_text'
     and i.created_at >= c.created_at
     and (c.created_by_member_id is null or i.created_by_member_id = c.created_by_member_id)
     and i.raw_text like 'Open Menu%'
     and i.raw_text like '%Swag Labs%'
     and i.raw_text like '%carry.allTheThings()%'
     and not exists (select 1 from public.homesend_changes h where h.intake_id = i.id and h.undone_at is null);
select count(*) as items_to_delete from sauce_items;
delete from public.home_send_items where parent_item_id in (select id from sauce_items);
delete from public.home_send_items where id in (select id from sauce_items);
delete from public.portal_fetch_jobs where connection_id in (select id from sauce_conn) and status in ('pending', 'running');
update public.portal_sessions set state = 'never', session = null, updated_at = now() where connection_id in (select id from sauce_conn);
update public.connections set status = 'disconnected', updated_at = now() where id in (select id from sauce_conn);
commit;
```

## Verified
- `packages/core/src/homesend/inbox-view.test.ts`: 12 passed (4 new for `setAsideName`, one with the
  real scraped text).
- `packages/core/src/help/localized.test.ts` + `packages/core/src/i18n`: 78 passed. `lint:help-links` green.
- `tsc --noEmit` in `apps/web` and `packages/core` clean; ESLint on changed files clean.
- `npm run build -w apps/web` compiled; `check:bundle` green.
- Not verified at 360 px in a browser: this container has no `apps/web/.env.local`, so no QA user can
  sign in. The owner should check HomeSend → Set aside on a phone.

## Open
- The SQL above must run on the live project (coordinator) before the old rows go.
- No QA data was created by this session.
