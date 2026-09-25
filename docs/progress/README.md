# Progress notes

One note per major activity, newest first. The trackers under `tracking/`
say *that* a story is done; these say *what was done, why, how it was
verified, and what is still open*, so the next session — or the next person —
can pick the work up without reading git history.

Rule of thumb (from `CLAUDE.md`): a story or module completed, an
infrastructure change, a design or performance pass, a security fix, or a
decision that shapes later work each earns a note, written before moving on.

| Date | Note |
|---|---|
| 2026-09-25 | [Developer platform (18-008): hashed, scoped, revocable partner keys, a no-write sandbox, and a small partner API; off unless switched on](2026-09-25-developer-platform.md) |
| 2026-09-25 | [Payment operations (20-011): Admin notices from the ledger, staff payment monitoring and refunds, nightly provider reconciliation](2026-09-25-payment-operations.md) |
| 2026-09-25 | [Multi-currency audit done (22-007): per-currency totals, a single-currency spending trend, working budgets with add/edit/remove, and HomeBrain catching invented amounts in any currency](2026-09-25-multi-currency-audit.md) |
| 2026-09-25 | [Chinese (Mandarin, Simplified) as the eighth language with Singapore formats; 22-008 right-to-left deferred](2026-09-25-chinese-language.md) |
| 2026-09-25 | [Landing page brought up to date: eight current "ready today" features, a 16-card features grid, and claims about ordering and paying corrected to what is live](2026-09-25-landing-latest-features.md) |
| 2026-09-25 | [Family screen in each person's language; the event sheet's kinds now match what the server accepts; event and health times read in the household's zone, not the server's (story 22-004 slice + two bug fixes)](2026-09-25-family-screen-localized.md) |
| 2026-09-25 | [Get Help brought up to date: 25 sections covering HomeSend, voice, language, reminders, health, upkeep, family, household help, plans, privacy export and deletion, and connections, with no platform-level detail](2026-09-25-help-guide-refresh.md) |
| 2026-09-25 | [More screen in each person's language: section names, each area's purpose, the viewer's role (also in the account menu and Settings), Help and Sign out (story 22-004, one screen)](2026-09-25-more-screen-localized.md) |
| 2026-09-25 | [Today screen in each person's language: views, timeline rows, empty states and the shared "Add to the family calendar" sheet that Today and Home open (story 22-004, one screen)](2026-09-25-today-screen-localized.md) |
| 2026-09-25 | [HomeTalk screen in each person's language: greeting, suggestions, confirm/change/cancel, the composer and its voice states, the action preview's frame, message times and the conversation search, in seven languages (story 22-004, one screen)](2026-09-25-hometalk-screen-localized.md) |
| 2026-09-24 | [Notifications screen in each person's language (22-004, one screen)](2026-09-24-notifications-screen-localized.md) |
| 2026-09-24 | [Localized reminders (story 22-006)](2026-09-24-localized-reminders.md) |
| 2026-09-24 | [Deep Document Understanding 2.0, part 3: HomeTalk says what a document did from its receipt and answers "what did the notice change?" from stored changes; golden scenario 4, eval HS-16, §50 document metrics (story 14-019 Done, module 14 complete)](2026-09-24-document-understanding-hometalk.md) |
| 2026-09-24 | [Deep Document Understanding 2.0, part 2: the grouped review ("Found N items"), apply through the domain services with a server-rebuilt plan, field-level change history, the exact receipt with partial failure and no-op, and Undo all (story 14-018 Done)](2026-09-24-document-plan-review-and-receipt.md) |
| 2026-09-24 | [Deep Document Understanding 2.0, part 1: the whole document read into every record it proposes, with page evidence, and a change plan that reconciles each one — new, field-level update, already on record, conflict or one question (story 14-017 Done)](2026-09-24-deep-document-reader-and-plan.md) |
| 2026-09-24 | [Payments, part 2: the plan, checkout, confirmation, billing history and invoice screens; the decided prices (Pro ₹299, Max ₹599, 20% off yearly) live and free during early access until a provider is live (story 20-010 Done)](2026-09-24-payment-screens.md) |
| 2026-09-24 | [Landing refresh: "New in WonderHome" (ready today, and coming soon in honest words), a HomeSend moment, a greetings strip from the product's own languages, parallax depth and gentle motion, all off under reduced motion](2026-09-24-landing-refresh.md) |
| 2026-09-24 | [Payments across providers: Razorpay for India and Stripe elsewhere behind one port, a configurable router, our own price catalogue mapped server-side, and a ledger of payments, invoices and refunds (story 20-009 Done; screens wait on pricing)](2026-09-24-payments-multi-provider.md) |
| 2026-09-24 | [Settings & Profile consolidation: one editor per setting — grouped Settings with the profile, the AI key and data use on `/settings/ai`, the plan on `/settings/plan`, your own profile elsewhere linking to Settings (story 01-009 Done)](2026-09-24-settings-consolidation.md) |
| 2026-09-24 | [WhatsApp into HomeSend, part 2: connect with a one-time code and a confirmation from the server's own link, "WhatsApp connected" beside members, WhatsApp as a HomeSend channel with an All / WhatsApp / Email / Uploads filter and who sent each item (story 14-016 Done, module 14 complete)](2026-09-24-whatsapp-homesend-screens.md) |
| 2026-09-24 | [WhatsApp into HomeSend, part 1: a number linked by single-use code, linked members' messages recorded once and turned into HomeSend items, never an authorization channel (story 14-015 Done)](2026-09-24-whatsapp-homesend-intake.md) |
| 2026-09-24 | [Multilingual HomeTalk: understood in the person's language, answered in it through a checked translation, never beyond what the household agreed to send (story 22-005 Done)](2026-09-24-multilingual-hometalk.md) |
| 2026-09-24 | [Smart notifications, part 3: batching, escalation, the day's summary, learned timing (23-008..012) — module 23 complete](2026-09-24-smart-notifications-part-3.md) |
| 2026-09-24 | [HomeTalk reminders: "later today", the trip home, and never a time in the past](2026-09-24-reminder-times.md) |
| 2026-09-24 | [Notification center: feed, detail, actions, snooze, settings (23-005..007)](2026-09-24-notification-center.md) |
| 2026-09-24 | [Smart notifications, part 1: reminders derived from real records and reconciled (created, updated, resolved, expired, never duplicated), data-driven timing policies per category, quiet hours fixed from UTC to the household's clock, recipients change state never content (stories 23-001..004 Done)](2026-09-24-smart-notifications-engine.md) |
| 2026-09-24 | [Internationalization, part 1: language, region, currency, time zone and units as separate preferences, an optional resumable setup after family onboarding, Language & Region settings, an Intl-only formatter and a seven-language catalog for the core UI, right-to-left ready shell and Home (stories 22-001..003 Done)](2026-09-24-internationalization-foundation.md) |
| 2026-09-24 | [Intelligent household onboarding: twelve resumable screens from "Create household" to a working operating model — owners suggested from ages, work and helper roles (never gender), readiness counted from what is really set up, one guided question at a time (story 02-009 Done)](2026-09-24-household-onboarding.md) |
| 2026-09-24 | [Alexa skill spec checked against the build: bare follow-up answers, a status intent, more action verbs, "set/create a reminder", rejection logging and env placeholders added](2026-09-24-alexa-skill-spec-gaps.md) |
| 2026-09-24 | [HomeTalk: the mark and a message search in the header, and no empty band between the composer and the tab bar](2026-09-24-hometalk-search-and-bottom-gap.md) |
| 2026-09-24 | [HomeTalk shows a time on every message and a date between days (Today, Yesterday, the full date), always in the household's own time zone](2026-09-24-hometalk-message-times.md) |
| 2026-09-24 | [HomeTalk composer: two rows, `+` for HomeSend, and a WonderHome / Gemini Live picker for live conversation (no other model brands)](2026-09-24-hometalk-composer-redesign.md) |
| 2026-09-24 | [CI runs only what a change can affect: docs-only PRs run just the tracker check, and database, unit and e2e jobs run when their area changed; main always runs everything](2026-09-24-ci-by-what-changed.md) |
| 2026-09-24 | [Optional device connectors: a device is linked to an appliance by an Admin, never guessed; only fresh readings from linked devices count; confirm dialogs now show they are working (story 17-008 Done, module 17 complete)](2026-09-24-smart-home-devices.md) |
| 2026-09-24 | [Looking ahead: three narrow, checkable predictions over the next two weeks, each with its basis and where to act; money shows two decimals whenever it has any (story 14-008 Done, module 14 complete)](2026-09-24-predictive-intelligence.md) |
| 2026-09-24 | [Share the load: times-a-week loads, imbalances named only when they matter, a one-tap swap to the outcome's own backup (story 03-008 Done, module 03 complete)](2026-09-24-workload-optimization.md) |
| 2026-09-24 | [Backup services: only the outcomes an absence leaves uncovered, the right outside service offered for exactly those days, one tap to arrange it as a service request (story 07-008 Done, module 07 complete)](2026-09-24-backup-services.md) |
| 2026-09-24 | [Controlled entitlement experiments: a stable hashed share of a plan gets one feature changed, applied inside the one entitlement service, frozen once running, visible to the household (story 20-008 Done, module 20 complete)](2026-09-24-entitlement-experiments.md) |
| 2026-09-24 | [Fair-use and burst policies as plan data: a burst refuses for its window, past fair use HomeTalk answers from the rules and says so, staff changes kept (story 20-007 Done)](2026-09-24-quota-automation.md) |
| 2026-09-24 | [WhatsApp as a notification channel: Cloud API template adapter, delivery wired into new notifications, a signed webhook for delivery reports and STOP (story 17-006 Done)](2026-09-24-whatsapp-channel.md) |
| 2026-09-24 | [Add a child from a school notice: an unknown child is named, never assumed to be the only one, and an Admin adds them in the review (story 08-009 Done)](2026-09-24-add-child-from-school-notice.md) |
| 2026-09-24 | [Provider-neutral billing: a pure event reducer, an inert Stripe adapter with idempotent checkouts and verified webhooks, paid plans out of reach of any household session (story 20-006 Done)](2026-09-24-billing-abstraction.md) |
| 2026-09-24 | [Weather as a planning signal: Open-Meteo behind the weather port, an Admin-chosen area rounded to ~1 km, hourly cached forecast, laundry planned around it (story 17-007 Done)](2026-09-24-weather-planning-signal.md) |
| 2026-09-24 | [A receipt becomes purchase history: read line by line, matched only when plain, confirmed by a person, undone per line (story 09-009 Done)](2026-09-24-receipt-purchase-history.md) |
| 2026-09-24 | [HomeSend reads the time of day: start and end from the notice's own words, all-day items never show a time (story 14-014 Done)](2026-09-24-homesend-time-of-day.md) |
| 2026-09-24 | [Voice phases 5–6: one capability matrix, per-surface conversations, a voice release gate and per-channel telemetry (stories 04-016, 04-017)](2026-09-24-voice-capabilities-and-observability.md) |
| 2026-09-24 | [Gemini Voice: Gemini Live as a HomeTalk channel — single-use tokens, allowlisted tools, consent-narrowed facts; two defects fixed (voice phase 3, story 04-014)](2026-09-24-gemini-voice-live.md) |
| 2026-09-23 | [The HomeTalk / HomeSend / HomeBrain test specification: 97 cases mapped, gaps closed, 13 defects fixed, live E2E run](2026-09-23-test-spec-hometalk-homesend-homebrain.md) |
| 2026-09-23 | [Voice: one HomeTalk gateway, linked voice identities with OAuth, and Alexa as a channel (phases 1, 2, 4)](2026-09-23-voice-hometalk-gateway-linking-alexa.md) |
| 2026-09-23 | [Wave 5, part 3: production hardening — rate and payload limits, timeouts, email monitoring, retries, idempotency (story 14-013 Done)](2026-09-23-wave5-production-hardening.md) |
| 2026-09-23 | [Wave 5, part 2: corrections as evidence, approvals bound to the exact proposal, production quality metrics (story 14-013)](2026-09-23-wave5-corrections-approvals-metrics.md) |
| 2026-09-23 | [Wave 5, part 1: one evaluation framework for HomeTalk, HomeSend and HomeBrain — golden households, metrics, gates, release artifact (story 14-013)](2026-09-23-wave5-evaluation-framework.md) |
| 2026-09-23 | [The platform AI key reaches the provider it belongs to, and one bad model field no longer discards a turn](2026-09-23-platform-provider-names.md) |
| 2026-09-23 | [HomeTalk 2.0, part 3: model contract, confidence, the §21 examples and the §22 matrix — Wave 4 (story 14-012 Done)](2026-09-23-hometalk-2-contract.md) |
| 2026-09-23 | [HomeTalk 2.0, part 2: corrections, multi-step and cross-domain requests — Wave 4 (story 14-012)](2026-09-23-hometalk-2-operations.md) |
| 2026-09-23 | [HomeTalk 2.0, part 1: grounding — dates, people and "that" — Wave 4 (story 14-012)](2026-09-23-hometalk-2-grounding.md) |
| 2026-09-23 | [Gender on every profile: pets, and children as they are added](2026-09-23-pet-and-child-gender.md) |
| 2026-09-23 | [Agent RPC schema fix: household autonomy actually takes effect (public wrappers, fail-closed lookup)](2026-09-23-agent-rpc-autonomy-fix.md) |
| 2026-09-23 | [Transaction payee/kind/owner, helper gender and notes](2026-09-23-transaction-details-and-helper-gender-notes.md) |
| 2026-09-23 | [HomeSend 2.0, part 3: how it confirms, what it measures, and the acceptance matrix — Wave 3 (story 14-011, Done)](2026-09-23-homesend-2-confirmation-metrics.md) |
| 2026-09-23 | [HomeSend 2.0, part 2: who it's for, what's already on record, and email 2.0 — Wave 3 (story 14-011)](2026-09-23-homesend-2-reconciliation.md) |
| 2026-09-23 | [HomeSend 2.0, part 1: one pipeline for every input — Wave 3 (story 14-011)](2026-09-23-homesend-2-one-pipeline.md) |
| 2026-09-23 | [CLAUDE.md: remove test data once the merge lands](2026-09-23-claude-md-post-merge-test-data-cleanup.md) |
| 2026-09-23 | [HomeBrain 2.0, part 2: current truth and HomeBrain Review — Wave 2 (story 14-010)](2026-09-23-homebrain-2-current-truth-review.md) |
| 2026-09-23 | [HomeBrain 2.0, part 1: grounded reasoning — Wave 2 (story 14-010)](2026-09-23-homebrain-2-grounded-reasoning.md) |
| 2026-09-23 | [Household context & grounding engine — Wave 1 (story 14-009)](2026-09-23-household-context-engine-wave1.md) |
| 2026-09-23 | [Story 21-008: fitness & connected-health scaffolding](2026-09-23-fitness-and-connected-health-scaffolding.md) |
| 2026-09-22 | [Home: greeting header, Today's focus and Family moment per mockup](2026-09-22-home-page-mockup-refresh.md) |
| 2026-09-22 | [Chevron-expandable stat cards, Bills paid-on, Househelper multi-add](2026-09-22-expandable-metric-cards-and-batch-fixes.md) |
| 2026-09-22 | [Bills & Finance detail, multi-engagement househelpers, and Key Member removal](2026-09-22-bills-detail-helper-engagements-key-member-removal.md) |
| 2026-09-22 | [Responsibilities examples, Kids & School "Coming up", a Groceries data bug, and ingredient-aware meal planning](2026-09-22-responsibilities-school-groceries-meals-batch.md) |
| 2026-09-22 | [Sidebar logout, setup tab order, HomeTalk avatar — plus three new CLAUDE.md rules](2026-09-22-sidebar-setup-tabs-hometalk-cleanup.md) |
| 2026-09-22 | [Nav drawer and mobile header redesign](2026-09-22-nav-drawer-and-mobile-header-redesign.md) |
| 2026-09-22 | [Story 21-007: vitals & measurement routines](2026-09-22-vitals-and-measurement-routines.md) |
| 2026-09-22 | [Story 21-006: HomeBrain & HomeTalk health context](2026-09-22-hometalk-homebrain-health-context.md) |
| 2026-09-22 | [Story 21-005: health records & HomeSend intake](2026-09-22-health-records-and-homesend-health-document.md) |
| 2026-09-22 | [Story 21-004: checkups & preventive care](2026-09-22-health-checkups.md) |
| 2026-09-22 | [Fix: appointment booking's When step could be skipped, and the wizard could double-submit](2026-09-22-appointment-booking-double-submit.md) |
| 2026-09-22 | [Story 21-003: health issues](2026-09-22-health-issues.md) |
| 2026-09-22 | [Story 21-002: appointments](2026-09-22-health-appointments.md) |
| 2026-09-22 | [Story 21-001: health foundation & privacy](2026-09-22-health-foundation-and-privacy.md) |
| 2026-09-22 | [Story 18-007: outbound webhooks](2026-09-22-outbound-webhooks.md) |
| 2026-09-22 | [Story 16-007: privacy request admin visibility and deletion fulfillment](2026-09-22-privacy-request-deletion-fulfillment.md) |
| 2026-09-22 | [HomeSend Phase 6: hardening](2026-09-22-homesend-phase6-hardening.md) |
| 2026-09-22 | [HomeSend Phase 5: email address management and an install nudge](2026-09-22-homesend-phase5-address-and-install.md) |
| 2026-09-22 | [HomeSend Phase 4: the PWA Web Share Target and its signed-out handoff](2026-09-22-homesend-phase4-share-target.md) |
| 2026-09-22 | [HomeSend Phase 3: a second, different-domain proposal per intake](2026-09-22-homesend-phase3-secondary-domain.md) |
| 2026-09-22 | [HomeSend Phase 2: the email intake channel](2026-09-22-homesend-phase2-email-intake.md) |
| 2026-09-22 | [HomeSend Phase 1: undo, audit trail, and a real upload security check](2026-09-22-homesend-phase1-foundation.md) |
| 2026-09-22 | [Key Member, HomeSend's own screen, Kids & School grouping, Groceries dropdowns](2026-09-22-key-member-homesend-page-kids-school-groceries-batch.md) |
| 2026-09-22 | [Eight-item batch: birthday sync, Home & Upkeep chevrons, pets as family, self profile edit, HomeBrain review](2026-09-22-upkeep-pets-profile-homebrain-batch.md) |
| 2026-09-22 | [CLAUDE.md now names HomeTalk, HomeBrain and HomeSend as the standing architecture](2026-09-22-hometalk-homebrain-homesend-in-claude-md.md) |
| 2026-09-21 | [HomeSend v1: a real upload/paste intake channel](2026-09-21-homesend-v1-intake-channel.md) |
| 2026-09-21 | [A second brand sheet: indigo/emerald palette, a new house-and-heart mark](2026-09-21-second-brand-sheet-indigo-emerald.md) |
| 2026-09-21 | [The agent pipeline runs for real, triggered from HomeTalk](2026-09-21-agent-pipeline-hometalk-trigger.md) |
| 2026-09-21 | [Meals & Cooking: recipe picker, nutrients, Suggest, and manual preferences](2026-09-21-meals-planning-suggest-recipes-preferences.md) |
| 2026-09-21 | [Bills & Finance: chevron detail, "Add transaction," and a real RLS gap it uncovered](2026-09-21-bills-chevron-detail-and-add-transaction.md) |
| 2026-09-21 | [Househelper: a scoped empty state, and errors that show instead of hide](2026-09-21-househelper-empty-state-and-error-handling.md) |
| 2026-09-21 | [Groceries: name/category/unit suggestions, and chevron detail](2026-09-21-groceries-open-fields-and-chevron-detail.md) |
| 2026-09-21 | [Kids & School: update/remove, chevron detail, and a screenshot import](2026-09-21-kids-school-crud-and-screenshot-import.md) |
| 2026-09-21 | [Remove a family member from the Family tab, and profile photos](2026-09-21-family-member-remove-and-profile-photos.md) |
| 2026-09-21 | [Responsibilities: remove, group by member, and a miscounted "Mine" tab](2026-09-21-responsibilities-remove-and-mine-count-fix.md) |
| 2026-09-21 | [A signed-in parent resolved to their child's own view](2026-09-21-session-identity-resolution-bug.md) |
| 2026-09-21 | [Delivery channels (06-008), and the migrations that never shipped](2026-09-21-delivery-channels-and-a-production-incident.md) |
| 2026-09-21 | [CI/CD performance pass, and locking in what this session learned the hard way](2026-09-21-ci-performance-and-testing-gotchas.md) |
| 2026-09-21 | [Admin instead of Head of Family, Belief Review, and a real person record](2026-09-21-admin-belief-review-and-person-detail.md) |
| 2026-09-21 | [Helper/service identity: proving the account is actually limited (01-008)](2026-09-21-helper-identity-rls.md) |
| 2026-09-21 | [Recovery runbook, and a real production finding it turned up (19-008)](2026-09-21-recovery-runbook.md) |
| 2026-09-21 | [Certification health: a percentage that can't hide the belief that matters (05-008)](2026-09-21-certification-health.md) |
| 2026-09-21 | [Feature flags and a platform-wide audit trail (16-008)](2026-09-21-feature-flags-and-platform-audit.md) |
| 2026-09-21 | [Recurring misses, learned without a person having to notice first (07-007)](2026-09-21-helper-miss-patterns.md) |
| 2026-09-21 | [A helper's daily summary: one line for a quiet day, one entry for what wasn't (07-006)](2026-09-21-helper-daily-summary.md) |
| 2026-09-21 | [Pattern learning: normal timing, without touching confirmed rules (03-007)](2026-09-21-pattern-learning.md) |
| 2026-09-21 | [Multi-agent coordination: specialists that collaborate through contracts (14-007)](2026-09-21-multi-agent-coordination.md) |
| 2026-09-21 | [Certification history: who reviewed what, and when (05-007)](2026-09-21-certification-history.md) |
| 2026-09-20 | [The rainbow wordmark, a pictorial bottom bar, a colour-coded sidebar, and Family redone](2026-09-20-brand-refresh-nav-and-family.md) |
| 2026-09-20 | [Home's family and househelp rows open in place, and say more](2026-09-20-home-rows-expand-in-place.md) |
| 2026-09-20 | [Home's lede fits on one line instead of wrapping to three](2026-09-20-home-lede-single-line.md) |
| 2026-09-20 | [Jump back to the latest message](2026-09-20-jump-to-latest-message.md) |
| 2026-09-20 | [A link that unfurls, and a Home you can actually tap](2026-09-20-share-card-and-a-tappable-home.md) |
| 2026-09-20 | [The assistant asked the same question four times (04-011)](2026-09-20-never-ask-the-same-question-twice.md) |
| 2026-09-20 | [Home, rebuilt to the sheet — and a hard two-card rule](2026-09-20-home-redesign-and-the-two-card-rule.md) |
| 2026-09-20 | [The speech key belongs to the deployment, not to a family](2026-09-20-speech-key-moves-to-the-platform.md) |
| 2026-09-20 | [One composer, four states (04-010)](2026-09-20-talk-composer-four-states.md) |
| 2026-09-20 | [A voice the household chooses: Google Cloud Speech (04-009)](2026-09-20-google-cloud-speech-voice.md) |
| 2026-09-20 | [A sustained, hands-free conversation with WonderHome](2026-09-20-live-voice-conversation.md) |
| 2026-09-20 | [Edit the last thing you said to WonderHome](2026-09-20-edit-your-last-message.md) |
| 2026-09-20 | [Talk: a faster turn, and replies that actually use bullets](2026-09-20-talk-faster-turns-and-real-bullets.md) |
| 2026-09-20 | [Replies that read well and take you there](2026-09-20-formatted-replies-with-links.md) |
| 2026-09-20 | [The Household Brain: a question answered from everything the home holds](2026-09-20-household-brain-answers.md) |
| 2026-09-20 | [Talk to WonderHome: the model was never being asked](2026-09-20-talk-provider-gate-and-wider-rules.md) |
| 2026-09-20 | [The brand sheet, applied: new mark, lockup, palette, landing copy](2026-09-20-rebrand-to-the-brand-sheet.md) |
| 2026-09-20 | [The Talk page opens at the newest message, with nothing scrolling](2026-09-20-talk-page-bottom-anchored-scroller.md) |
| 2026-09-20 | [The blue focus box, and the message showing through the composer](2026-09-20-focus-ring-layer-bug-and-opaque-composer-footer.md) |
| 2026-09-20 | [The AI tab becomes "Talk", the chat stops jumping, and the mic loses its halo](2026-09-20-talk-tab-instant-scroll-and-mic-halo-removed.md) |
| 2026-09-20 | [AI chat: overlap fixed, "Try asking" removed, a bigger retro mic](2026-09-20-ai-chat-cleanup-and-mic-redesign.md) |
| 2026-09-20 | [Stat tiles stop cramming three into a row, and a wider truncation sweep](2026-09-20-metric-tiles-and-truncation-sweep.md) |
| 2026-09-20 | [Househelpers get their own section, separate from family](2026-09-20-helpers-separated-from-family.md) |
| 2026-09-20 | [Seven new UI rules, and the four fixes they came with](2026-09-20-ui-rules-swipe-nav-and-duplicate-buttons.md) |
| 2026-09-20 | [The actual root cause of the Responsibilities crash, found and fixed](2026-09-20-responsibilities-root-cause-found.md) |
| 2026-09-20 | [A real household seed exposed three add/update/delete gaps — fixed](2026-09-20-member-and-consumable-add-update-delete.md) |
| 2026-09-20 | [Talk to WonderHome: real answers, real actions, and the truth when there aren't any](2026-09-20-talk-to-wonderhome-real-answers.md) |
| 2026-09-20 | [Root cause of the recurring Responsibilities crash, and a dismissible "Try asking" strip](2026-09-20-error-boundaries-and-assistant-suggestions.md) |
| 2026-09-20 | [Twelve dead ends, fixed — where a screen said something it could not do](2026-09-20-twelve-dead-ends-fixed.md) |
| 2026-09-20 | ["Add something" gets a form, everywhere it only had a chat link](2026-09-20-manual-entry-alongside-ai.md) |
| 2026-09-20 | [A UX clarity pass across every screen — what was real, and what wasn't](2026-09-20-ux-clarity-pass.md) |
| 2026-09-20 | [The full menu, as a drawer — a hamburger, and a "More" that no longer leaves the page](2026-09-20-nav-drawer.md) |
| 2026-09-19 | [Connecting outcomes to their real dependency graph (story 03-006)](2026-09-19-dependency-graph.md) |
| 2026-09-19 | [Conditional policies (story 02-008) — module 02 complete](2026-09-19-conditional-policies.md) |
| 2026-09-19 | [Conflict detection (story 02-007) — module 02 done bar one story](2026-09-19-conflict-detection.md) |
| 2026-09-19 | [The brand guidelines, applied through the token system](2026-09-19-brand-guidelines-refresh.md) |
| 2026-09-19 | [The playbook entry form, down to two fields](2026-09-19-playbook-form-simplified.md) |
| 2026-09-19 | [OpenAI, the third provider behind the same `understand` seam](2026-09-19-openai-understanding.md) |
| 2026-09-19 | [Google Gemini behind the same `understand` seam](2026-09-19-gemini-understanding.md) |
| 2026-09-19 | [A real model behind the conversation engine (product-direction v4, Priority A)](2026-09-19-real-llm-understanding.md) |
| 2026-09-19 | [Usage this period, in Settings (story 20-005)](2026-09-19-usage-ui.md) |
| 2026-09-19 | [01-007 was already built, under a different story number](2026-09-19-preferences-already-built.md) |
| 2026-09-19 | [Closing 19-007: p95 measured against the live deployment](2026-09-19-performance-p95-closed.md) |
| 2026-09-19 | [Subscription administration and AI operations monitoring (16-005, 16-006)](2026-09-19-subscription-admin-and-ai-operations.md) |
| 2026-09-19 | [Production was 11 commits behind — merged and closed the gap](2026-09-19-main-deployment-gap.md) |
| 2026-09-19 | [Help, added to the landing page's own navigation](2026-09-19-landing-help-link.md) |
| 2026-09-19 | [The help guide no longer needs a login](2026-09-19-help-public.md) |
| 2026-09-19 | [Changing plans without losing anything (20-004)](2026-09-19-plan-change.md) |
| 2026-09-19 | [The commerce connector (story 17-005)](2026-09-19-commerce-connector.md) |
| 2026-09-19 | [The P0 security suite (15-008) — module 15 complete](2026-09-19-security-suite.md) |
| 2026-09-19 | [The Privacy Centre, and the step-up that was never there (15-007)](2026-09-19-privacy-centre.md) |
| 2026-09-19 | [The real logo, everywhere (brand mark)](2026-09-19-brand-mark.md) |
| 2026-09-19 | [The audit trail, and the nine things it was not recording (15-006)](2026-09-19-audit-trail.md) |
| 2026-09-19 | [The AI privacy gate (story 15-005)](2026-09-19-ai-privacy-gate.md) |
| 2026-09-19 | [Configure by conversation (story 02-006)](2026-09-19-configure-by-conversation.md) |
| 2026-09-19 | [The setup wizard (story 02-001)](2026-09-19-setup-wizard.md) |
| 2026-09-19 | [Landing: no video, contact, and a real footer](2026-09-19-landing-contact-footer.md) |
| 2026-09-19 | [Get Help: user guide, FAQ, and searching them](2026-09-19-help-centre.md) |
| 2026-09-19 | [The platform's model key, and bring your own](2026-09-19-platform-ai-key-and-byok.md) |
| 2026-09-19 | [Password recovery, reveal, and Google sign-in](2026-09-19-auth-recovery-reveal-google.md) |
| 2026-09-19 | [School connector wired to a real sync (story 17-004)](2026-09-19-school-connector-sync.md) |
| 2026-09-19 | [Email connector (story 17-003)](2026-09-19-email-connector.md) |
| 2026-09-18 | [Design principles in CLAUDE.md, and the handwritten accent](2026-09-18-design-principles-and-handwritten-accent.md) |
| 2026-09-18 | [Household setup guidance for the first week](2026-09-18-household-setup-guidance.md) |
| 2026-09-18 | [Calendar connector (story 17-002)](2026-09-18-calendar-connector.md) |
| 2026-09-18 | [Database moved to the Mumbai Supabase project](2026-09-18-database-move-to-ap-south-1.md) |
| 2026-09-17 | [Performance pass: compute beside the data, verify sessions locally](2026-09-17-performance-pass.md) |
| 2026-09-17 | [Design system v3: kit, every screen, the assistant, the landing page](2026-09-17-design-system-v3.md) |
