# WonderHome — Approved UI Mockup Implementation Specification

## Purpose
The approved WonderHome mockups are the visual reference for implementation. They are not decorative screenshots: every major screen represents a finalized product behavior from the backlog.

Reference image: `WonderHome-Approved-UI-Mockup-Reference.png`

## Visual language
- Clean, elegant, family-oriented visual system.
- Warm/light neutral surfaces with deep navy typography and restrained teal/green primary actions.
- Rounded cards, soft elevation, generous spacing and clear hierarchy.
- Avoid enterprise-ERP density; the family should immediately see what needs attention.
- Mobile-first responsive design, with desktop layouts derived from the same information hierarchy.
- Use the WonderArk-aligned component approach: Tailwind CSS + Radix UI + Lucide icons.

## Global navigation
Primary mobile navigation:
1. Home — what needs attention and what WonderHome handled.
2. Today — the signed-in member's actionable plan.
3. AI — Talk/Text with WonderHome.
4. Family — shared family context and member views.
5. More — domain modules and settings.

Desktop may use a left sidebar/top bar, but the same five information areas remain primary.

## Required screens

### 1. Home Dashboard
Must show:
- personalized greeting
- concise weather/context only when useful
- `Needs your attention` actionable cards
- `WonderHome handled` completed outcomes
- no generic data dashboard
- notification count reflects unresolved actionable items only

### 2. AI Assistant
Must support:
- voice input
- text input
- conversation context
- suggested useful commands
- action preview for consequential changes
- confirmation/result after an action

Example: `Sunita won't be here tomorrow.` should trigger household impact analysis rather than merely save a note.

### 3. Notifications
Tabs/filters may include:
- All
- Action required
- Decisions
- Updates

The screen must prioritize actionable threads and automatically remove/resolve stale items.

### 4. Today
Personalized to the signed-in member. Show:
- only their actions/decisions
- relevant family context
- time-sensitive outcomes
- school/work/family commitments relevant to them

### 5. Family
Show:
- members and roles
- shared family moments
- relevant family commitments
- quick access to a member's authorized view

### 6. Child View
Show:
- today's school/homework plan
- upcoming activities
- age-appropriate AI entry point
- simple progress and encouragement
- no adult finances/private family information

### 7. Househelper View
Show:
- availability
- normal responsibilities
- unusual/changed work only
- schedule or instructions when required
- no employee productivity score or minute-by-minute tracking

### 8. Manage Household
Admin surface containing:
- Members & Roles
- Responsibilities
- Household Playbook
- Policies
- AI Autonomy
- Notifications
- Integrations
- House Settings

Every section must be actionable and editable.

### 9. Responsibilities
Support views by person, area and matrix. Each responsibility should show:
- primary
- backup
- AI mode
- operating window
- escalation rule

### 10. Household Certification
Show:
- Confirmed
- Learned
- Needs review
- risk level
- source/evidence
- last review

Every unresolved item has a direct `Review`, `Fix`, `Confirm` or equivalent action.

### 11. School
Show only actionable school information:
- assignments
- worksheets
- exams
- deadlines
- risk
- scheduled study work

Imported school data must retain provider/source identity.

### 12. Groceries
Show:
- suggested order
- why each item is needed
- estimated cost
- delivery/order state
- approval action where required

Do not make users maintain a manual inventory for ordinary use.

### 13. Bills & Finance
Show:
- upcoming actionable bills
- due dates
- amount
- responsible member
- payment/review action
- anomalies when meaningful

### 14. Family Time & Social
Show:
- protected family time
- upcoming events
- shared availability
- a small number of actionable activity suggestions
- preparation/gift/RSVP actions when relevant

### 15. Profile & Settings
Show:
- personal preferences
- notification controls
- privacy/security
- connected accounts
- account information

## Interaction rules
1. The UI must never require a user to update routine household task status merely to keep WonderHome accurate.
2. Action cards must have a clear next action or be treated as informational and kept out of the actionable queue.
3. Every action should explain the minimum necessary context: what happened, why it matters, what WonderHome recommends, and what the user can do.
4. AI-generated changes must visibly indicate when they are pending approval versus already executed.
5. Resolved notifications disappear from actionable counts.
6. Personalized views are permission-filtered from the API; they are not merely hidden with CSS.
7. Empty states should explain what WonderHome can do next, not just say `No data`.
8. Error states should provide a recovery action where possible.
9. Accessibility and keyboard/screen-reader behavior must be preserved on desktop; touch targets must remain usable on mobile.

## Desktop behavior
Desktop should use the same information hierarchy but can expose more simultaneous context:
- left navigation
- household/action summary
- main working area
- optional right-side context panel

Do not turn desktop into a dense BI dashboard.

## Design-to-backlog traceability
- Home → 03, 06, 14
- AI → 04, 14
- Notifications → 06
- Family/roles → 01, 02
- Manage Household → 02, 15, 20
- Certification → 05
- Househelper → 07
- School → 08, 17
- Groceries → 09, 17
- Meals → 10
- Bills → 11
- Family Time/Social → 12
- Maintenance/Pets → 13
- Platform Admin → 16

Claude Code must implement UI stories against this document and the backlog rather than inventing a different navigation model.
