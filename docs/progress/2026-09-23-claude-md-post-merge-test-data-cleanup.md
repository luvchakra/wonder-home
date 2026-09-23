# CLAUDE.md: remove test data once the merge lands

**Date:** 2026-09-23

## What and why

`CLAUDE.md` has a new section, "Cleaning up test data after the merge". Once a PR merges into `main`, the same session removes everything it created to test the work, and does so before it reports the work done:
- QA accounts (`node scripts/qa-test-user.mjs delete <user-id>`);
- QA households and their rows, on the live project and on preview branches;
- rows seeded directly with `execute_sql`;
- files uploaded to Storage during testing;
- local scratch files and dev servers.

The session then confirms nothing is left.

Before this, cleanup was a single line under "Verifying UI changes in a browser". It covered only QA accounts and said nothing about when cleanup happens. That is how an unattributed QA account (`42dc16e3-8e5b-463f-8f6a-965f69261bb6`) came to outlive its session.

The rule keeps the existing scoping from "Database query permissions": delete only what this session can prove it created. Anything it can't attribute is named in the report with the command that would remove it, never deleted on a guess. The work's progress note records that cleanup ran or lists what was left.

## Verified

This is a documentation change only. `npm run tracker -- --check` and `npm run lint:secrets` pass.

## Still open

- `42dc16e3-8e5b-463f-8f6a-965f69261bb6` is still in place, for the same reason: this session can't show it created that account. If nobody needs it, delete it with `node scripts/qa-test-user.mjs delete 42dc16e3-8e5b-463f-8f6a-965f69261bb6`.
