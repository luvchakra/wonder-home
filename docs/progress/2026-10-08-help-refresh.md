# Get Help checked against the product, four gaps closed

**Date:** 2026-10-08

## What was checked
Nothing has merged since the last Help refresh (#193, 2026-09-26), so this pass
read every Help section against the screens and code as they stand
(`/household/*`, `/settings/*`, notifications, plans, budgets, partner keys,
language catalogs) and the trackers. Most of the guide already matched. Four
things did not.

## What changed in Help (all eight languages)
- **Activity trail (new).** Manage household → Activity was not in Help at all.
  `household-and-roles` gains a paragraph (Admins only; who changed what and
  when; roles, invitations, the playbook, rules, connected accounts; a record
  that is never edited; holds nothing anyone said or asked and no keys or
  passwords) and a new FAQ, "Can I see who changed a setting?". Search
  keywords: activity, audit, history, who changed. Source: `household/activity/page.tsx`
  and the `manage.activity.*` strings.
- **Partner keys, made precise.** The paragraph said a key lets an app "see or add
  to the grocery list". It now also names the third thing a key can allow (the
  household's name, time zone and head count), says where the key is made
  (Settings → Connected accounts → Developer access) and that it can stop working
  after 30 days, 90 days, a year or never. Source: `manage.scope.*`,
  `manage.keys.*`, `developer/keys.ts`.
- **Arabic and right-to-left, corrected.** Help said "Arabic reads right to left".
  Story 22-008 is Deferred: the shell and Home are direction-aware but the
  remaining screens still need a pass. Help now says Arabic is shown right to
  left and that a few screens are still being adjusted.
- Search keyword "developer access" added to Connections.

## Left out on purpose
- Payment notices to the Admin, staff refunds and reconciliation (20-011) and
  device linking (17-008): both only matter once a payment provider or a device
  is live, and the landing page lists them as coming soon.
- Weather being part of Pro: Help already says it is used only where switched on.

## Verified
- Help unit tests (65), including that each new FAQ, asked in each language,
  lands on its own section.
