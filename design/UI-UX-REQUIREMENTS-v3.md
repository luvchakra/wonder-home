# WonderHome --- Complete UI/UX Implementation Requirements

## Mobile Application + Apple-Inspired Landing Page

**Purpose:** Direct implementation specification for Claude Code.

> **The family should manage the home. WonderHome should manage the
> management.**

WonderHome is an AI-driven Home Operating System for working families.
It should feel like a calm, premium household companion---not a chore
tracker, generic chatbot, calendar, finance app, or ERP.

Core promise:

**Less mental load. More family time. A brighter tomorrow.**

------------------------------------------------------------------------

## 1. Product Experience

Design the product around outcomes, exceptions, decisions, coordination
and automation.

Routine work should become mostly invisible. Users should not need to
manually update every dish, laundry cycle, grocery item or househelper
chore.

The product should continuously move toward:

**Observe → Understand → Predict/Plan → Act → Monitor → Result → Learn**

The ideal experience is that the family does less inside WonderHome.

------------------------------------------------------------------------

## 2. Visual Language

Use an original design inspired by the premium storytelling, whitespace
and motion quality of Apple.com.

### Visual characteristics

-   Warm off-white / cream backgrounds
-   Deep navy typography
-   Teal / blue-green primary action color
-   Soft green success
-   Amber/orange attention
-   Restrained red for genuinely critical states
-   Rounded cards
-   Soft shadows
-   Subtle gradients
-   Beautiful family/lifestyle imagery
-   Elegant modern sans-serif typography
-   Generous whitespace
-   Premium but family-friendly
-   Sophisticated, not childish
-   Calm rather than dashboard-heavy

Use shared design tokens across the app and landing page.

### Typography

Use Sora/system font (brand guidelines, design/WonderHome-brand-guidelines.png).

Suggested: - Desktop hero: 56--80px - Mobile hero: 36--46px - Page
title: 26--30px - Section heading: 32--52px - Card heading: 15--18px -
Body: 14--18px - Caption: 11--13px

------------------------------------------------------------------------

## 3. Technical Stack

Use the established WonderHome stack:

-   Next.js App Router
-   React 19
-   TypeScript
-   Tailwind CSS 4
-   Radix UI
-   Lucide React
-   React Hook Form
-   Zod
-   Supabase PostgreSQL
-   `@supabase/ssr`
-   Vercel AI SDK
-   Anthropic Claude as primary AI provider
-   Google Gemini as configurable alternative
-   OpenAI as configurable alternative
-   Vitest
-   Playwright
-   npm workspaces
-   `apps/web`
-   Shared packages under `packages/*`

Do not introduce a competing UI framework without justification.

------------------------------------------------------------------------

# 4. Mobile Application

## Primary Navigation

Five destinations:

1.  Home
2.  Today
3.  AI
4.  Family
5.  More

Do not put every household domain in bottom navigation. Groceries,
Meals, Bills, School, Househelper and Maintenance should be accessed
contextually.

Support: - iPhone/Android-class widths - 320--430px minimum design
range - responsive larger phones - PWA - safe areas - \>=44px touch
targets - no hover-only interactions

------------------------------------------------------------------------

# 5. Mobile Screen Inventory

All of these screens are required:

1.  Welcome
2.  Sign Up
3.  Household Setup
4.  Home Dashboard
5.  AI Assistant
6.  Notifications
7.  Today / Personal View
8.  Family
9.  Responsibilities
10. Child View
11. School
12. Househelper
13. Groceries
14. Meals
15. Bills & Finance
16. Manage Household
17. Household Certification
18. Settings & Profile

------------------------------------------------------------------------

## 6. Welcome

Create an emotional first impression.

Include: - WonderHome logo - beautiful modern family/home visual -
`A happier home. Everyday.` - Less mental load - More family
time - A brighter tomorrow - `Get Started Free` -
`I already have an account`

Warm, premium and calm.

------------------------------------------------------------------------

## 7. Sign Up

Title:

**Create your account**

Options: - Continue with Google - Continue with Apple - Continue with
Email

Include Terms, Privacy Policy and Sign In.

Keep registration lightweight.

------------------------------------------------------------------------

## 8. Household Setup

Collect: - Household name - Location - Timezone - Currency

Example reference: - Mumbai, Maharashtra - Asia/Kolkata - INR / ₹

Architecture must remain locale-neutral.

Show onboarding progress such as `Step 2 of 4`.

------------------------------------------------------------------------

## 9. Home Dashboard

Primary question:

> **What actually matters right now?**

Header: - WonderHome logo - search - avatar

Hero: - personalized greeting - date - weather/context where available

Sections:

### Needs You

Only meaningful actions: - Electricity bill due tomorrow - Child project
needs review - Househelper leave needs backup planning

### WonderHome Handled

Reassuring outcomes: - Grocery order prepared - Class confirmed -
Reminder handled

### Family Snapshot

Small contextual family activity.

### Today's Focus

Only important commitments.

Do not create a giant task list.

------------------------------------------------------------------------

## 10. AI Assistant

Unified voice + text.

Support: - natural language - persistent conversation - voice -
contextual short replies - action previews - household memory

Example:

`Can you plan a family outing this weekend?`

WonderHome checks: - household context - availability - preferences -
relevant commitments

Then proposes and, when authorized, executes.

UI: - AI messages - suggested actions - action preview - voice button -
text composer

Core model:

**Understand → Decide → Act**

Keep responses concise.

------------------------------------------------------------------------

## 11. Notifications

Notifications are sparse and valuable.

Tabs: - All - Action Required - Decisions - Updates

Examples:

**Electricity bill** --- Due tomorrow · ₹2,840 --- `Pay`

**Anaya's science project** --- Needs review --- `Review`

**Grocery order ready** --- `View`

Lifecycle:

`Generated → Delivered → Seen → Acted → Resolved`

Avoid duplicate notifications. Prefer evolving/threaded notifications.

------------------------------------------------------------------------

## 12. Today

Tabs: - My day - Family - Household

Show meaningful timeline items: - morning routine - commute - meetings -
child pickup - dinner

Do not require manual completion of normal household work.

------------------------------------------------------------------------

## 13. Family

Header:

**Our Family**

Show: - adults - children - househelper/service identities where
appropriate - pets

Each member: - avatar - name - role - relevant responsibilities

Include shared family events/time.

------------------------------------------------------------------------

## 14. Responsibilities

Tabs: - All - Mine - Family

Examples: - School management - Bills & utilities - Groceries &
essentials - Home cleaning - Kids' activities - Pet care

Each responsibility supports: - primary owner - backup - frequency -
outcome definition - exceptions - AI involvement

Responsibilities represent outcomes, not micro-task sequences.

Prefer:

`Laundry ready`

over:

`Laundry started → washed → dried → folded`

unless detailed tracking is genuinely necessary.

------------------------------------------------------------------------

## 15. Child View

Age-appropriate experience.

Header:

`Hi Anaya!`

Tabs: - Today - Homework - Goals - Fun

Show: - homework - projects - exams - activities - reading - school
events

Actions: - Continue - Start - Review - View

Never expose adult private/financial/admin information to child profiles
without authorization.

------------------------------------------------------------------------

## 16. School

Tabs: - Overview - Homework - Calendar

Show: - assignments - projects - worksheets - exams - events - teacher
updates - announcements

Example:

`Science project due in 2 days`

Actions: - Add to child plan - Allocate preparation time - Identify
missing materials - Add materials to shopping

------------------------------------------------------------------------

## 17. Househelper

Purpose: coordinate service without surveillance.

Tabs: - Overview - Schedule - Tasks

Show: - normal responsibilities - unusual work - availability - leave -
exceptions - backup arrangements

Do NOT build: - productivity scores - surveillance metrics - forced
completion tracking

Normal household work should not require manual updates.

------------------------------------------------------------------------

## 18. Groceries

Tabs: - Overview - List - Orders

Suggested orders should use: - consumption - preferences - household
patterns - upcoming meals - pet supplies

Example: Milk · Eggs · Bananas · Tomatoes

CTA:

**Review order**

Show quantity, estimated total, provider and approval status.

Use provider-neutral commerce adapters. Never fake live integrations.

------------------------------------------------------------------------

## 19. Meals

Dedicated first-class domain.

Header:

**Meals & Cooking**

Tabs: - Plan - Recipes - Preferences

Today's plan: - Breakfast - Lunch - Dinner

Meal cards can show: - meal - status - ingredients - responsible
person - recipe - preparation time

Example:

`Dinner — Paneer pulao`

Actions: - View recipe - Add ingredients - Change meal - Assign cooking

Meal planning considers: - family schedule - preferences - ingredients -
grocery state - school lunches - available preparation time

------------------------------------------------------------------------

## 20. Bills & Finance

Tabs: - Overview - Transactions

Upcoming bills: - electricity - internet - mobile - DTH - classes -
subscriptions

Each: - provider - amount - due date - status - responsible member

Actions: - Pay - Review - View

Show a lightweight monthly-spend trend.

WonderHome is not a full personal-finance application.

Payments require authorization and step-up authentication.

------------------------------------------------------------------------

## 21. Manage Household

For Head of Family and Household Administrators.

Sections:

### Members & Roles

Members, roles, permissions, privacy scopes.

### Responsibilities

Owners, backups and outcomes.

### Household Playbook

Routines and operating rules.

### Policies

Spending, approval, notification and privacy policies.

### AI Autonomy

-   Suggest
-   Prepare
-   Ask approval
-   Execute autonomously

### Integrations

-   School
-   Calendar
-   Email
-   Shopping
-   Weather
-   Payments

### House Settings

-   home
-   devices
-   locations
-   regional settings

------------------------------------------------------------------------

## 22. Household Certification

Purpose:

Show what WonderHome understands about the household.

Sections: - Confirmed - Learned - Needs Review

Example display: - 38 Confirmed - 7 Learned - 3 Need review

Provide: - source/provenance where available - explainable
coverage/confidence - review controls

Actions: - Review - Confirm - Correct - Remove

Never fabricate confidence.

------------------------------------------------------------------------

## 23. Settings & Profile

Show: - profile - household role - personal preferences - notification
settings - privacy & security - connected accounts - help & support -
logout

Security: - MFA - sessions - connected services - data export - data
deletion

------------------------------------------------------------------------

# 24. Shared Components

Create reusable components:

-   `AppShell`
-   `MobileHeader`
-   `BottomNavigation`
-   `Avatar`
-   `AvatarGroup`
-   `StatusPill`
-   `MetricCard`
-   `ActionCard`
-   `AttentionCard`
-   `CompletedCard`
-   `PersonCard`
-   `ResponsibilityCard`
-   `OutcomeCard`
-   `DomainCard`
-   `Timeline`
-   `SectionHeader`
-   `EmptyState`
-   `LoadingState`
-   `ErrorState`
-   `ConfirmationSheet`
-   `ActionSheet`
-   `BottomSheet`
-   `Modal`
-   `Toast`
-   `NotificationCard`
-   `ProgressRing`
-   `SearchBar`
-   `SegmentedControl`
-   `TabBar`
-   `ChatComposer`
-   `VoiceInputButton`
-   `AIMessage`
-   `AIActionPreview`
-   `CertificationItem`
-   `ApprovalCard`
-   `CalendarItem`

Use shared variants and tokens.

------------------------------------------------------------------------

# 25. Landing Page

Create a beautiful one-page marketing experience inspired by Apple.com's
premium storytelling approach, but use an original WonderHome design.

The landing page must clearly explain:

1.  The problem
2.  Why modern family management creates mental load
3.  The WonderHome solution
4.  AI orchestration
5.  Major household capabilities
6.  Family benefits
7.  Security/privacy
8.  Cross-device experience
9.  Social proof
10. Pricing
11. Sign Up / Sign In

------------------------------------------------------------------------

## 26. Landing Header

Desktop:

Left: - WonderHome logo

Navigation: - Why WonderHome - Features - For Families - Pricing -
Security - Stories

Right: - `Sign In` - `Get Started`

Mobile: - logo - menu - Get Started

On scroll, use a translucent blurred sticky header.

------------------------------------------------------------------------

# 27. Landing Hero

Hero headline:

**Home runs smoother.\
Together.**

Supporting copy:

WonderHome helps your family stay organized, reduce mental load, and
focus on what truly matters --- more time together.

CTAs: - **Get Started Free →** - **Watch Video**

Supporting note: `No credit card required`

Hero visual should feature: - beautiful modern family kitchen/home -
parents - kids - pet - cooking - groceries - natural family interaction

Overlay floating app cards: - Dinner plan ready - Homework completed -
Grocery order delivered - Bill due - Family event

Animate these cards subtly.

------------------------------------------------------------------------

# 28. Hero Motion

Use: - floating UI cards - gentle parallax - layered family imagery -
subtle movement of kitchen objects - floating screenshots - staggered
entrance - scroll-linked transforms

Keep motion smooth and premium.

Use CSS transforms/opacity where possible.

Respect `prefers-reduced-motion`.

------------------------------------------------------------------------

# 29. Problem Story

Headline:

**Modern life is beautiful.\
But it's a lot.**

Copy:

Between work, school, chores, bills, meals, shopping and a million
little things, household management can become overwhelming.

Create four visual cards:

### Too much to remember

Tasks, schedules, bills, shopping and school information never end.

### Hard to stay aligned

Everyone is busy. Things slip.

### Decisions are tiring

What to cook? What to buy? What needs attention?

### Less time together

The management of life can consume the life itself.

Use family lifestyle imagery.

Animate cards into view as the user scrolls.

------------------------------------------------------------------------

# 30. Solution Story

Headline:

**Meet WonderHome.**

Subheadline:

**Your AI partner for a happier home.**

Explain that WonderHome brings family needs into one intelligent system.

Core capabilities: - Plan - Coordinate - Simplify - Act - Learn

Key statement:

> WonderHome doesn't give your family more things to manage. It manages
> the management.

Visual: - phone mockup - family/home illustration - floating groceries -
recipes - calendar cards - family avatars - pet - household objects

------------------------------------------------------------------------

# 31. Feature Storytelling

Use large Apple-style editorial sections.

Feature stories:

### Family

**Everyone together. Without the coordination headache.**

### Today

**Your day. Your focus.**

### Responsibilities

**Clear roles. A smoother home.**

### Meals

**Healthy meals. Happier moods.**

### Groceries

**Never run out again.**

### Bills

**Stay on top. Stress less.**

### Kids & School

**All school info in one place.**

### Househelper

**Support that keeps home running.**

### AI Assistant

**Always here for your family.**

### Certification

**Your home, understood.**

Each section should combine: - headline - short copy - product UI -
lifestyle imagery - subtle motion

------------------------------------------------------------------------

# 32. Interactive Feature Showcase

Create an interactive section with app visuals for:

-   Family & Profiles
-   Today
-   Responsibilities
-   Meals & Recipes
-   Groceries
-   Bills & Finance
-   Kids & School
-   Househelper
-   Certification
-   AI Assistant

Prefer actual UI components rendered at high quality rather than static
low-resolution screenshots.

------------------------------------------------------------------------

# 33. Cross-Device Section

Headline:

**At home.\
On the go.\
Always with you.**

Show: - desktop browser - laptop - mobile - optionally tablet

Use the same application UI.

Copy:

WonderHome works seamlessly across your devices, keeping your home in
sync wherever you are.

CTA: **See it in action →**

Use realistic device frames, depth, shadows and subtle reflections.

Never stretch screenshots.

------------------------------------------------------------------------

# 34. Family Motion Section

Create a playful but premium scene containing: - kitchen utensils -
vegetables - grocery bags - coffee cup - laundry basket - school books -
laptop - toys - pet - family avatars - calendar notes

Use scroll-linked parallax.

Objects should move at different speeds.

The effect should feel alive without becoming gimmicky.

------------------------------------------------------------------------

# 35. AI Story

Visualize:

**Observe → Understand → Plan → Act → Monitor → Result → Learn**

Show WonderHome coordinating: - groceries - school - meals - bills -
family events - responsibilities

Core message:

**You don't have to tell WonderHome everything. It learns the rhythm of
your home.**

Do not imply unrestricted autonomous behavior.

AI remains governed by household policies, authorization and autonomy
settings.

------------------------------------------------------------------------

# 36. Security Section

Headline:

**Your home is private.\
So is your life.**

Explain: - secure authentication - MFA - privacy scopes - tenant
isolation - encrypted data - audited sensitive actions - child privacy -
controlled integrations - household data not used for model training by
default

CTA:

`Explore Security`

Do not make unsupported certification/compliance claims.

------------------------------------------------------------------------

# 37. Social Proof

Headline:

**Real families. Real happier homes.**

Use testimonial cards with: - avatar - first name - city only where
appropriate - quote - optional rating

Do not ship fabricated testimonials.

Placeholder testimonials must be clearly marked as placeholder content
during development.

------------------------------------------------------------------------

# 38. Pricing

Use three plan cards:

### Free

**Run the Home**

### Pro

**Let WonderHome Think**

### Max

**Let WonderHome Run the Home**

Buttons: - Get Started - Sign In

Do not hard-code pricing. Use configuration/API.

------------------------------------------------------------------------

# 39. Final CTA

Large family lifestyle section.

Headline:

**A brighter tomorrow\
starts at home.**

Supporting copy:

Join families building happier, calmer homes with WonderHome.

Buttons: - **Get Started Free →** - **Sign In**

Use: - warm sunset - family outdoors/home - subtle parallax - premium
typography

------------------------------------------------------------------------

# 40. Footer

WonderHome logo.

Tagline:

`A happier home. Everyday.`

Links: - Home - Features - Pricing - Security - Privacy - Help - Sign In

Include legal links and social links where applicable.

------------------------------------------------------------------------

# 41. Landing Motion System

Implement:

### Scroll reveal

Opacity + translateY + subtle scale.

### Parallax

Multiple image/object layers at different scroll speeds.

### Hero floating elements

Small UI cards with gentle motion.

### Device entrance

Phone/laptop mockups enter with slight depth.

### Sticky storytelling

Selected sections can keep text anchored while visual content changes.

### Micro-interactions

-   CTA hover
-   card lift
-   icon motion
-   button feedback
-   navigation transitions

All motion must respect reduced-motion settings.

------------------------------------------------------------------------

# 42. Performance

Use: - Next.js Image - responsive image sizes - lazy loading below
fold - modern compressed formats - CSS transforms - minimal client
JavaScript - intersection observers where appropriate

Do not load every large visual asset during initial render.

Optimize hero imagery aggressively.

------------------------------------------------------------------------

# 43. Accessibility

Target:

**WCAG 2.2 AA**

Requirements: - semantic HTML - keyboard accessibility - screen-reader
labels - sufficient contrast - visible focus - accessible forms -
accessible dialogs - \>=44px touch targets - meaningful alt text -
decorative images appropriately marked - reduced-motion support

No critical information may depend only on animation.

------------------------------------------------------------------------

# 44. Authentication Integration

Landing-page CTAs must connect to the same application authentication
system.

`Get Started` → Sign Up

`Sign In` → Sign In

Sign Up: - Google - Apple - Email

Do not create a separate marketing authentication system.

------------------------------------------------------------------------

# 45. Responsive Landing Page

### Desktop

-   full navigation
-   large hero
-   wide product showcases
-   multi-column sections
-   large device mockups

### Tablet

-   adaptive grids
-   reduced typography
-   adjusted image positioning

### Mobile

-   hamburger menu
-   stacked content
-   mobile screenshots
-   simplified parallax
-   reduced motion complexity
-   optional sticky CTA

Mobile must remain premium, not merely a collapsed desktop layout.

------------------------------------------------------------------------

# 46. Product UI / Marketing Consistency

The application and landing page must share: - logo - typography -
colors - border radius - buttons - cards - iconography - illustrations -
imagery style

The landing page should feel like the marketing expression of the actual
product.

------------------------------------------------------------------------

# 47. Authorization and Privacy

UI visibility is never authorization.

Server-side authorization remains authoritative.

Examples: - child cannot access adult financial information - adult
member cannot automatically become administrator - househelper cannot
see private household information - only authorized members can modify
responsibilities - sensitive actions require appropriate authorization -
platform admin access is separate from household roles

Never leak restricted information through client state, API responses,
caching or preloaded components.

------------------------------------------------------------------------

# 48. Consequential AI Actions

For consequential actions show:

### What I understood

### What I plan to do

### Impact

### Controls

-   Confirm
-   Change
-   Cancel

Sensitive actions include: - payments - deletion - permission changes -
security changes - external communications - autonomous actions outside
approved policy

Use step-up authentication where required.

------------------------------------------------------------------------

# 49. Loading / Empty / Error States

Every data-driven screen must include:

### Loading

Skeleton UI.

### Empty

Explain what happens next.

### Error

Human-readable message plus retry/action.

Never expose raw API errors.

------------------------------------------------------------------------

# 50. Testing

Use Vitest for: - component logic - UI state - utilities - formatting -
relevant authorization presentation logic

Use Playwright for: 1. New household 2. Sign in 3. Household setup 4.
Home dashboard 5. AI conversation 6. Notification action 7.
Responsibility update 8. Child/school flow 9. Grocery review 10. Bill
payment 11. Certification review 12. Household administration

Landing page E2E: - navigation - CTAs - Sign In - Get Started -
responsive layout - key interactions - reduced-motion behavior

------------------------------------------------------------------------

# 51. No Fake Functionality

Do not pretend an external integration is live.

When provider credentials/integrations are unavailable: - implement
adapter interface - implement deterministic development mock - clearly
indicate readiness - preserve production interface

Never fabricate: - payment completion - school portal connectivity -
grocery orders - delivery status - external messages - unrestricted AI
autonomy

------------------------------------------------------------------------

# 52. Claude Code Implementation Sequence

Before coding:

1.  Read `CLAUDE.md`.
2.  Read backlog and implementation order.
3.  Read architecture documents.
4.  Read this document.
5.  Inspect the repository.
6.  Reuse existing components where appropriate.

Implementation order:

1.  Design tokens
2.  Shared UI primitives
3.  Application shell/navigation
4.  Authentication/onboarding
5.  Core mobile screens
6.  Domain screens
7.  Household administration
8.  Certification
9.  Responsive desktop application
10. Landing page
11. Motion/parallax
12. Accessibility
13. Tests
14. Story acceptance validation
15. Progress tracker updates

Do not ask what to implement next. Follow the backlog implementation
order.

Do not mark stories complete merely because a page renders.

------------------------------------------------------------------------

# 53. Final UI Quality Gate

Before declaring UI implementation complete:

-   [ ] All 18 mobile screens implemented
-   [ ] Welcome implemented
-   [ ] Sign Up implemented
-   [ ] Household Setup implemented
-   [ ] Meals has dedicated UI
-   [ ] Responsibilities has dedicated UI
-   [ ] School has dedicated UI
-   [ ] Child experience implemented
-   [ ] Househelper experience implemented
-   [ ] Household Certification implemented
-   [ ] Mobile navigation works
-   [ ] Responsive desktop experience works
-   [ ] Landing page implemented
-   [ ] Problem storytelling implemented
-   [ ] Solution storytelling implemented
-   [ ] Mobile + desktop product visuals implemented
-   [ ] Sign In CTA works
-   [ ] Get Started CTA works
-   [ ] Hero animation implemented
-   [ ] Scroll reveal implemented
-   [ ] Parallax implemented
-   [ ] Reduced-motion mode implemented
-   [ ] Loading states implemented
-   [ ] Empty states implemented
-   [ ] Error states implemented
-   [ ] WCAG 2.2 AA baseline addressed
-   [ ] No fake integrations
-   [ ] Sensitive actions respect authorization
-   [ ] Product and marketing design systems match
-   [ ] Notifications remain sparse and actionable
-   [ ] Routine household work remains mostly invisible
-   [ ] Product feels premium, warm, family-friendly and calm

------------------------------------------------------------------------

# 54. Final Experience Standard

The finished product should make a family think:

> **"I don't have to manage the app. The app helps manage our home."**

The visual experience should be:

**Beautiful enough to love.\
Simple enough to use.\
Smart enough to trust.\
Quiet enough to live with.**

And the landing page should communicate immediately:

> **Home runs smoother. Together.**
