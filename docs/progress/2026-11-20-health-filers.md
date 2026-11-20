# Who may file health records for others

**Date:** 2026-11-20 · **Owner's words:** "for health record make it configurable on admin level, so the check can be bypassed for allowed users".

## What changed and why

Until now a health document sent to HomeSend was filed for the person who sent it, or for a child they look after. For anyone else the household was asked "Who is this for?". Since #560, if a waiting document got no answer, it was filed for its sender. The owner wants chosen adults to skip that check.

- **Setting.** Settings → AI Assistant, inside "Money and health entries": **Who may file health records for others**. An Admin ticks adults. A helper is listed and is on it only if an Admin ticks them. Children are never offered, and are refused even if stored. Nobody is on it by default. It is stored as the `ai_autonomy` policy "Who may file health records for others" (`household/direct-add-repository.ts` `loadHealthFilers` / `saveHealthFilers`). The policy's RLS limits changes to Admins, and each save is audited as `policy.updated` (`saveHealthFilersAction` in `(auth)/consent-actions.ts`). Picker: `_components/health-filers-picker.tsx`.
- **Behaviour** (`homesend/health-filers.ts`, pure):
  - *Filed on its own* (the review, `(auth)/home-send-review.ts`): `gateHealthSubject` keeps the named person for an allowed sender. For everyone else it applies today's rule: their own record, or an adult's child; anyone else becomes "Who is this for?". Before, such a write was attempted and refused by the database.
  - *The write* (`(auth)/home-send-writes.ts` `healthFilerWrite`): the database lets a member file only for themselves or a child they guard (`health_records_insert_self_or_guardian`). So for an allowed sender the record is written through the service client, only after the server checks the list and that the subject is an active adult or child of this household. It is audited `homesend.health_filed_for`. No migration is needed.
  - *While it waits* (`hometalk/needs-you-run.ts`): `healthFiledFor` produces the new ending `file_for` (`homesend/deadlines.ts`). `addWaitingItem` then files the document for the named member with `healthFor`, as Checking, with change source `health_filer`, audited `homesend.health_filed_for`. No "Add this bill?" question is asked.
  - *Undo* (`(auth)/home-send-actions.ts` `reverseChange`): the subject or their guardian archives it as before. The person who filed it may also archive it through the server.
  - A name that matches nobody in the household, or matches two people, falls back to today's behaviour. Who can see the record is unchanged (`wh.may_see_health`).
- **HomeBrain** (`homebrain/memory-resolve.ts`, `subject-fill.ts`): for an allowed sender, the resolver may fill who a health document is for from the one household member its own words name (basis `named_in_document`, 0.9). It never uses a learned rule for this. For other senders it still never fills it.
- **Words:** the setting in eight languages (`settings/*.ts`); help Health body 3 and HomeSend body 9 in eight languages, with keywords and `updated` dates. CLAUDE.md (HomeBrain and HomeSend bullets) and `docs/agent-platform.md` carry the owner's words.

## Verified

- Eval HS-100–105: an allowed sender, the resolver filling from the text, a sender not on the list, a child sender (even when stored on the list), a name outside the household (never filed), and the deadlines `file_for`. The deterministic eval passes 334/334, with 0/63 unsafe actions.
- Unit tests: `homesend/health-filers.test.ts` (new), plus deadlines, needs-you-run, memory-resolve, subject-fill, help, i18n and security: all green. Typecheck clean. ESLint clean on changed web files. The service-role lint passes.
- UI: ui-check of `/settings/ai` at 360 px and on desktop with a QA household (see the PR).

## Open

- Health visibility stays as it was: the person, their guardians, and people the person shared with. There is no Admin bypass (`wh.may_see_health`). The brief said "and Admins". That would need a visibility change the owner should decide separately.
- A waiting health document from a sender *not* on the list is still filed for its sender by the #560 "Add this bill?" default, even when it names someone else.

## Cleanup

The QA accounts and the QA household from this session were deleted after the merge (see the PR thread).
