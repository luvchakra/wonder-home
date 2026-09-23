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
