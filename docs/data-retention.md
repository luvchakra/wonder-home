# Data retention and periodic cleanup

Owner request, 2026-10-28:

> Lots of entries in WonderHome exist so family members don't have to remember
> upcoming activities. When those activities pass and are no longer needed, we
> can remove them — reducing load on the system and, at the same time, avoiding
> storing non-required personal information about people. Create jobs that clean
> up the system periodically, keeping these principles in mind.

This is **design-first and phased**. Phase 1 (the framework + the reversible
soft-delete step for the safest categories, hard purge gated off) is built and
shipping with this doc. Everything else is staged below as questions for the
owner and as backlog stories.

---

## 1. What already exists (build on it, don't duplicate)

WonderHome **already has a retention system** (story 15-007):

- `packages/core/src/privacy/retention.ts` — the schedule as data: a
  `RetentionClass` per kind of thing, each with a window in days, a label and a
  reason. Rendered in the Privacy Centre (`/settings/privacy`).
- `packages/core/src/privacy/purge.ts` — `purgeExpired()` genuinely (hard-)
  deletes rows past their keeping, for the classes in `PURGE_TARGETS`.
- `packages/core/src/privacy/fulfill-deletion.ts` — a matured deletion request
  (a member who left) acts on its own 30-day grace window.
- `apps/web/app/api/v1/platform/retention/route.ts` — the nightly platform
  sweep (Vercel Cron, `Bearer $CRON_SECRET`) that runs all of the above across
  every household.

The existing system is governed by one principle, stated in `retention.ts`:

> **What the household typed, they own.** Their playbook, rules and lists stay
> until they remove them. **What the system inferred about them, expires** —
> conversation transcripts, learned memory, provider sync records.

So today only *system-inferred* data expires (conversation 90d, memory 365d,
integration events 60d, usage 400d, audit 730d, step-up 30d) plus
**notifications (180d)**. The things the owner is now asking about — passed
calendar events, handled school items, old HomeSend uploads — are **household
records that are currently kept forever** (they fall under "what you typed").

### The shift this work introduces

The owner's request extends retention to a **third category the current
principle does not name: household _operational ephemera_.** These are records
a person created, but only so the household wouldn't forget a *dated, upcoming*
thing. Once that thing has passed and been handled, the record is no longer
load-bearing — keeping it just stores personal information about people with no
one needing it.

This is a deliberate, owner-driven change to the retention philosophy. It does
**not** touch "content you own that you look back on" (your playbook, rules,
notes, financial history) — see exemptions below. **Open question Q1** asks the
owner to confirm exactly where the line between "ephemera" and "keepsake" sits,
because "a passed birthday party" could reasonably be either.

---

## 2. The lifecycle: soft-delete → grace → purge

Owner decision (2026-10-28): **soft-delete → grace period → purge.**

1. **Soft-delete (reversible).** The periodic job marks an eligible, passed,
   handled record with `soft_deleted_at = now`. The row stays physically in its
   table, so **no foreign key is ever orphaned** and nothing has to be
   resurrected. Readers that should hide it filter `soft_deleted_at is null`
   (see §6). A soft-deleted row is fully recoverable: set `soft_deleted_at` back
   to `null`.
2. **Grace period.** A soft-deleted row waits out the retention window before it
   may be purged. During the grace window an Admin can restore it (at least at
   the data layer in phase 1; a member-facing "recently cleaned" view is phase
   3).
3. **Purge (irreversible).** After the grace window, the row is hard-deleted.
   **This step is GATED OFF in phase 1** (`RETENTION_PURGE_ENABLED`, default
   `false`) and will not run against live data until the owner confirms the
   policy (guardrail G7, Q4).

### Why a `soft_deleted_at` column, not a move-to-tombstone

Either was offered. A column was chosen because:

- **No orphaning, ever.** The row never leaves its table during the reversible
  phase, so every inbound foreign key keeps resolving. A move would have to
  archive-and-restore whole FK subtrees (participants, change logs, study
  sessions) to stay reversible — more moving parts, more ways to corrupt.
- **Only the purge is destructive.** The dangerous, irreversible operation is
  isolated to one gated function, which is exactly what guardrail G7 wants.
- It mirrors how the rest of the codebase treats "stand it down, keep the
  history" (a retired policy, a deactivated member) rather than hard-deleting.

---

## 3. The Admin retention setting

Owner decision (2026-10-28): **Admin-configurable per household, default 90
days.**

- Stored like every other household policy: a **versioned `policies` row**,
  category `privacy`, name `Clean up passed entries after`, rule `{ "days": 90 }`
  (or `{ "days": null }` for "keep everything / cleanup off"). Admins-only write
  (the `policies_write_admin` RLS already enforces this), audited through
  `savePolicy` like the "Add bills directly" toggle.
- Read on the server only. **Fail-safe to the safe side (keep):** a *successful*
  read with no row → the 90-day default; a *failed* read (error/timeout) → the
  job **skips cleanup for that household this run** (never cleans on a guess).
- Chosen from a fixed list in Settings (design rule 20, "a choice is picked, not
  typed"): 30 / 60 / 90 (default) / 180 / 365 days, or "Keep everything".
  Minimum enforced window is 7 days so a misconfiguration can never target very
  recent rows.
- Surfaced in the **Privacy Centre** (`/settings/privacy`), which already
  publishes the retention schedule — turning that read-only promise into an
  editable control for the one window a household gets to choose.

Code: `packages/core/src/privacy/retention-window-repository.ts`.

---

## 4. Per-category policy: targets, exemptions, and reasons

### 4.1 Exemptions — never auto-expire these (guardrails G1, G2, G3)

| Category | Why exempt |
| --- | --- |
| **Health, allergy, safety facts** — all `health_*` tables (appointments, checkups, issues, records, readings, vitals, fitness, measurement routines) | Standing CLAUDE.md rule. A missed allergy is a hospital visit. Exempt entirely, forever. |
| **Financial history** — `obligations` (bills), `obligation_history`, `obligation_periods`, `payment_intents`, `budgets`, and anything that becomes purchase history | Someone needs these later; they feed "Why?" answers and stat-tile arithmetic a person can explain (G2). Kept or governed separately; **never silently purged.** Any future purge of these needs explicit owner sign-off (Q2). |
| **Anything a stat tile or "Why?" answer cites** | Purging it would make the number unexplainable (design rule 9). |
| **What the household typed and keeps** — playbook, responsibilities, policies, rules, lists, notes | The existing `household_content` principle: yours until you remove it. |
| **Children's data** — extra conservative; when unsure, keep (G3) | School items and child goals are child-privacy. Not in phase 1. See Q3. |

### 4.2 Cleanup targets

Legend: **Phase 1** = soft-delete enabled now (purge gated). **Phase 2+** =
specified, not yet enabled.

| Table | Phase | "No longer needed" rule | Inbound-FK safety | Sensitivity |
| --- | --- | --- | --- | --- |
| `availability_exceptions` | **1** | `on_date` older than the window | **No inbound FKs** — nothing to orphan | Low (a helper's day off + optional reason) |
| `family_event_changes` | **1** | `created_at` older than the window | Child of `family_events` (`on delete cascade`); nothing references it | Low (server-only change log, `excluded` from the knowledge index) |
| `family_events` (passed one-offs) | **2** | `status in (happened, cancelled)` or ended well past, **excluding** `protected`, excluding recurring kinds (`birthday`), excluding any event a live `health_appointment` points at | Cascades to participants / invite links / changes / calendar rows; SET NULLs a health link (health row survives) | Medium — **this is Q1** (families may want to look back); ~18 readers to filter |
| `school_items` (handled) | **2/3** | `status in (done, submitted, missed, cancelled)` older than a **longer, child-conservative** window | `study_sessions` cascade; `school_documents` SET NULL | **Child** (Q3); collides with in-flight PR #419 |
| `home_send_items` (handled) | **2** | `status in (routed, dismissed)` older than the window; **also delete the Storage object** | Self-ref + `homesend_changes` cascade; a WhatsApp-intake link SET NULL | Low–medium; "never a document library" by design; ~20 readers + PR #419 collision |
| `notifications` (terminal) | — | Already governed by the **existing** 180-day `notifications` retention class | `notification_events` cascade | Already handled; see Q5 |

Each phase-2 target gets its `soft_deleted_at` column, indexes, and reader
filters in its own migration when enabled, so each lands as a safe-in-either-
order additive change.

---

## 5. The job: schedule and idempotency

- **Where it runs:** folded into the **existing** nightly
  `/api/v1/platform/retention` sweep — the same secret-authorised, no-session,
  cross-household path where `purgeExpired` and `fulfillMaturedDeletions`
  already live. This is day-scale housekeeping, so it does **not** go on the
  5-minute delivery clock, and folding it in avoids a new Hobby-tier cron entry
  (the same reasoning the route's own comments give for the reminder sweeps).
  Code: `packages/core/src/privacy/cleanup.ts`, `runRetentionCleanup()`.
- **After the response / bounded:** each table is swept with a `.limit()` and a
  bounded set of households per run, exactly like `notices-sweep`. One table
  failing never stops the others (each result is reported), matching
  `purgeExpired`.
- **Idempotent:** soft-delete only touches rows `where soft_deleted_at is null
  and <terminal> and <older than the window>`. A second run the same night
  matches nothing new and records 0. Restore and purge are equally keyed to
  explicit state, so re-running changes nothing already done.
- **Per-household window:** windows are read in one query into a map; a
  household with no row uses the 90-day default; a household whose window reads
  as "off" (`null`) is skipped; a failed bulk read skips the whole run (safe
  side).

---

## 6. References-safety and the resurrection rule (guardrail G5)

- **Never orphan.** Soft-delete leaves the row in place, so inbound FKs are
  untouched. The gated purge deletes only after a per-row check that nothing
  live still points at it, and relies on the existing `on delete cascade` /
  `set null` definitions (documented per table in §4.2) so no child is left
  dangling.
- **Never resurrect a reminder.** The notifications module reconciles reminders
  idempotently from source records. The reminder/notice source reads for the
  phase-1 tables are already time-bounded to recent/future rows
  (`notices-sweep` reads `availability_exceptions` with `on_date >= today`;
  `family_event_changes` only within 3 days; `reconcile` reads `family_events`
  future-only). A row old enough to be cleaned is **already outside every
  reminder source's window**, so cleaning it cannot leave or regenerate a stray
  reminder. For phase-2 visible categories, the matching source reads get an
  explicit `soft_deleted_at is null` filter **in the same change** that enables
  the category, verified by a test.

---

## 7. The audit trail (guardrail G6)

A new table **`retention_cleanup_runs`** records that cleanup ran, in a
minimal, non-personal way:

- `household_id`, `category`, `phase` (`soft_delete` | `restore` | `purge`),
  `affected` (a **count**), `window_days`, `ran_at`.
- **No row ids, no titles, no content** — the audit of removing personal
  information must not itself re-store it.
- Admins-only read (`household_id in (select wh.admin_households())`); no client
  write policy (written server-side on the admin client, like `audit_events`).

---

## 8. Guardrails (baked in)

| | Guardrail | How it's honoured |
| --- | --- | --- |
| G1 | Never auto-expire health/allergy/safety | `health_*` exempt entirely; not in any spec |
| G2 | Keep financial / purchase / "Why?" / stat-tile history | Financial tables exempt — confirmed by the owner (Q2); never in any spec |
| G3 | Children's data: conservative, when unsure keep | `school_items` cleaned only when handled/terminal, on the household window (owner, Q3); never a pending item; phase 3 |
| G4 | Reversible before purge | `soft_deleted_at` is reversible; restore path at the data layer |
| G5 | Never purge something still referenced / no stray reminders | Column (not move) keeps FKs; cleanup targets rows already outside every reminder window; §6 |
| G6 | Auditable without re-storing PII | `retention_cleanup_runs`: counts only |
| G7 | No irreversible hard purge on LIVE this session | Phase 1 soft-delete only. Phase 2a adds the purge in **dry-run** (reports counts, deletes nothing); real deletion stays gated until the owner reviews a dry-run report (owner, Q4) |

---

## 9. Owner decisions (2026-10-28)

The owner answered the phase-1 questions. These now drive phases 2–3.

- **Q1 — Passed calendar events → clean them, on the retention window.** Passed
  one-off `family_events` are cleaned once older than the household window.
  Conservative exclusions (not the owner's words, applied for safety): never
  `protected` events, never `birthday` (annual, a keepsake), never `appointment`
  (health-adjacent — avoids touching any `health_appointments` link). Everything
  else passed is ephemera. Phase 2.
- **Q2 — Financial / purchase history → stays exempt.** Confirmed. Bills,
  payments, periods, purchases and budgets are never auto-cleaned. Unchanged.
- **Q3 — Children's school history → clean on the retention window.** Handled
  `school_items` (`done`, `submitted`, `missed`, `cancelled`) are cleaned on the
  same household window (no separate longer window). Still child data, so it
  stays conservative: only handled/terminal items, never a pending one. Phase 3.
- **Q4 — Hard purge → yes, dry-run first.** The purge is enabled, but its first
  pass on live is a **dry-run**: it reports what it *would* delete and deletes
  nothing. Only after the owner has seen a real dry-run report (which needs
  soft-deleted rows to have aged past the grace window first) does it switch to
  deleting. No irreversible purge runs on live until then.
- **Q5 — Notifications → apply the household window.** Terminal notifications
  (`resolved`, `expired`, `acted`, `dismissed`) are cleaned on the household
  window too. The existing platform 180-day schedule (`purge.ts`) stays as the
  backstop for anything the household window does not reach. Phase 2.

---

## 10. Phased roadmap

- **Phase 1 (PR #422, merged).** Framework: the `soft_deleted_at` column +
  `retention_cleanup_runs` audit table + indexes; the Admin window setting +
  Privacy Centre control (8 languages); the cleanup engine on the nightly sweep;
  soft-delete enabled for `availability_exceptions` and `family_event_changes`;
  the gated purge function (present, off); tests; this doc; help wording.
- **Phase 2a.** Passed `family_events` (Q1): soft-delete on the household window
  with the exclusions above, `soft_deleted_at` reader filters across the
  calendar/event readers, and a resurrection test. Plus the **purge dry-run**
  (Q4): the purge runs in report-only mode (counts, deletes nothing) across all
  soft-delete categories, surfaced for the owner; real deletion stays gated.
- **Phase 2b.** `notifications` on the household window (Q5, with the 180-day
  backstop kept) and `home_send_items` (with Storage-object cleanup). Deferred
  behind PR #419, which is editing the HomeSend readers.
- **Phase 3.** `school_items` on the household window, handled/terminal only
  (Q3, child-conservative); flip the purge from dry-run to real once the owner
  has seen a dry-run report; a member-facing "recently cleaned / restore" view.

### Migration ordering for phase 2+ (important)

Unlike phase 1, phase 2's reader filters (`.is("soft_deleted_at", null)`)
**require the new column to exist when the code deploys** — a read against a
missing column errors. Because the Supabase MCP `apply_migration` times out in
cloud sessions (the owner runs migrations by hand), each phase-2+ migration is
**applied to live first, confirmed, then the code is merged** — the one place
the "turn on auto-merge immediately" rule yields to "don't deploy a reader that
its column has not landed for yet".

Backlog: module 15 (Privacy/Security/Governance) carries these as stories.
