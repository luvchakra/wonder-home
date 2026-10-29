import {
  AlertTriangle,
  CalendarClock,
  CalendarHeart,
  CircleCheck,
  GraduationCap,
  Heart,
  Sparkles,
  Sun,
  UserRoundPlus,
} from "lucide-react";
import Link from "next/link";

import { listPets } from "@wonderhome/core/home/repository";
import type { Translate } from "@wonderhome/core/i18n/translate";
import { describeAction, isFamilyMoment, type FamilyEvent } from "@wonderhome/core/family/schedule";
import { onboardingSummary, type OnboardingSummary } from "@wonderhome/core/household/onboarding";
import { loadOnboarding, loadOnboardingFacts } from "@wonderhome/core/household/onboarding-repository";
import { assessSetup } from "@wonderhome/core/household/setup";
import { shouldOfferLocaleSetup } from "@wonderhome/core/i18n/preferences";
import { loadSetupFacts } from "@wonderhome/core/household/setup-repository";
import { isHouseholdAdmin, listMembers, type HouseholdMember } from "@wonderhome/core/identity/households";
import { readHelperAvailability, readResponsibilities, type AvailabilityWindowRow, type ResponsibilityJoinRow } from "../_lib/family-reads";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { AvatarGroup } from "@wonderhome/core/ui/avatar";
import { CalendarItem, calendarKindLook } from "@wonderhome/core/ui/calendar-item";
import { Card } from "@wonderhome/core/ui/card";
import { CozyCornerIllustration } from "@wonderhome/core/ui/cozy-corner-illustration";
import {
  ExpandableMetricGrid,
  MetricDetailEmpty,
  MetricDetailList,
  MetricDetailRow,
  type ExpandableMetric,
} from "@wonderhome/core/ui/expandable-metric-card";
import { ExpandableRow } from "@wonderhome/core/ui/expandable-row";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { HandledList } from "@wonderhome/core/ui/outcome-card";
import { Badge, PillLink, type BadgeTone } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SetupProgressCard } from "@wonderhome/core/ui/setup-progress";

import { OnboardingResumeCard } from "../_components/onboarding-resume-card";
import { PersonalizeCard } from "../_components/personalize-card";
import { HeroCatFigure, HeroCatThought } from "../_components/hero-cat";
import { TodayCard, TodayCardFallback } from "../_components/today-card";
import { TrendingTags } from "../_components/trending-tags";
import { WhatsNewCard } from "../_components/whats-new-card";
import { whatsNewItems, whatsNewLabels } from "../_lib/whats-new";
import { ScriptAccent } from "@wonderhome/core/ui/script-accent";
import { EmptyState, LoadingState } from "@wonderhome/core/ui/states";
import { Suspense } from "react";

import { HomeIllustration } from "@wonderhome/core/ui/home-illustration";
import { AgendaExpandableRow } from "../_components/agenda-expandable-row";
import { NewEventForm } from "../_components/new-event-form";
import { eventFormLabels } from "../_lib/event-form-labels";
import { eventPlaceSearch } from "../_lib/places";
import { markPaidProps } from "../_lib/mark-paid";
import { householdAgenda, type DomainSummary } from "../_lib/agenda";
import { homeRows } from "../_lib/home-reads";
import { eventGoing, eventWhen } from "../_lib/event-when";
import { formatDate, formatTime, formatToday, greetingFor, type Session } from "../_lib/session";
import { localizeSetup, onboardingCardLabels, setupProgressLabels } from "../_lib/setup-labels";
import { iconForOutcome } from "../_lib/outcome-icons";

/** Which domain a Today's-focus row belongs to, for its colour badge — the
 * same domain colours the icon tiles already use, never an invented one. */
const DOMAIN_BADGE: Record<DomainSummary["key"], BadgeTone> = {
  school: "school",
  shopping: "meals",
  meals: "meals",
  bills: "money",
  family: "people",
  home: "home",
};

function focusBadge(riskLevel: HomeAssessmentRisk, domainKey: DomainSummary["key"] | undefined, t: Translate) {
  if (riskLevel === "high") return { tone: "risk" as const, label: t("homeScreen.badge.needsAttention") };
  if (riskLevel === "medium") return { tone: "attention" as const, label: t("homeScreen.badge.needsAttention") };
  if (domainKey) return { tone: DOMAIN_BADGE[domainKey], label: t(`homeScreen.badge.${domainKey}`) };
  return { tone: "neutral" as const, label: t("homeScreen.badge.notable") };
}

type HomeAssessmentRisk = "high" | "medium" | "low" | "none";

/**
 * A calendar event in Today's focus, opening onto its full time range and
 * whatever it is actually asking of the household — `describeAction` is the
 * one place that sentence is written, so this row never invents its own.
 */
function TodayEventRow({ event, timezone, t }: { event: FamilyEvent; timezone: string; t: Translate }) {
  const look = calendarKindLook(event.kind);
  return (
    <ExpandableRow
      summary={
        <>
          <IconTile icon={look.icon} tone={look.tone} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{event.title}</span>
            <span className="block text-xs text-[var(--wh-foreground-subtle)]">
              {event.allDay ? t("calendar.entry.allDay") : `${formatTime(timezone, event.startsAt)} – ${formatTime(timezone, event.endsAt)}`}
            </span>
          </span>
          {event.allDay ? null : <Badge tone="neutral">{formatTime(timezone, event.startsAt)}</Badge>}
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-[var(--wh-foreground-muted)]">
          {eventWhen(event, timezone, t)}
          {event.protected ? ` · ${t("homeScreen.protectedTime")}` : ""}
        </p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          <div>
            <dt className="text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{t("eventForm.kind")}</dt>
            <dd className="text-sm">{t(`eventForm.kind.${event.kind}`) || event.kind.replace(/_/g, " ")}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase">
              {t("homeScreen.expectedAction")}
            </dt>
            <dd className="text-sm">{event.actionState ? describeAction(event.actionState) : t("homeScreen.noAction")}</dd>
          </div>
        </dl>
        {/* Everything else about it — who's asked, the invite link, what's left to plan — is on its own page. */}
        <PillLink href={`/calendar/events/${event.id}`} tone="quiet">
          {t("events.open")}
        </PillLink>
      </div>
    </ExpandableRow>
  );
}

/**
 * Home: what actually matters right now (requirements §9).
 *
 * Needs You is only real actions from the domain engines. WonderHome Handled
 * is the count of what was checked and found fine — the silence that is the
 * product working. Neither is a task list, and nothing here asks anyone to
 * tick off normal household work.
 */
export function HomeDashboard({ session }: { session: Session }) {
  const { membership, view, viewer, secondary } = session;
  const { t } = session.locale;
  const timezone = membership.household.timezone;
  const now = new Date();
  const firstName = membership.preferredName ?? view.displayName.split(" ")[0] ?? view.displayName;
  const whatsNew = whatsNewItems(session, now);

  // The greeting needs nothing from the database, so it is on screen in the
  // first flush; everything below it streams in as its queries return.
  return (
    <AppShell active="home" viewer={viewer} secondary={secondary} pathname="/">
      <div className="space-y-6">
        {/* The greeting sits directly over a warm corner illustration (rule
            8) rather than beside it — a left-to-right scrim keeps the text
            legible over the artwork in both themes, and the illustration's
            own busy content is drawn into its right ~60% for exactly this
            reason. In a right-to-left language the artwork, scrim and chip
            mirror so the text still starts over the quiet side. The date
            card says only what is on record or what a real provider sent
            (rule 9); on a phone it sits above the greeting rather than
            beside it, so nothing runs into the greeting (rule 15). */}
        <header className="wh-rise relative min-h-[15.5rem] overflow-hidden rounded-[var(--wh-radius-lg)] sm:min-h-[16rem]">
          <CozyCornerIllustration className="absolute inset-0 h-full w-full rtl:-scale-x-100" />
          <div
            aria-hidden
            className="absolute inset-0 bg-[linear-gradient(to_right,var(--wh-surface)_0%,var(--wh-surface)_38%,transparent_68%)] rtl:bg-[linear-gradient(to_left,var(--wh-surface)_0%,var(--wh-surface)_38%,transparent_68%)]"
          />

          {/* Hidden below `sm`: at phone widths the greeting text block
              (max-w-[80%] below) has nowhere for this to sit without
              overlapping it — the illustration itself is mostly cropped
              out of frame there too, so there is no clear region left. */}
          <ScriptAccent size="sm" heart className="absolute start-[40%] bottom-6 hidden max-w-[10rem] leading-[1.15] sm:block">
            {t("homeScreen.script.line1")}
            <br />
            {t("homeScreen.script.line2")}
          </ScriptAccent>

          {/* The date card: the day, the weather where it is on, and a film and a family pick where a catalogue is (the owner, 2026-10-21). */}
          <Suspense fallback={<TodayCardFallback date={formatToday(timezone, now)} household={view.householdName} />}>
            <TodayCard session={session} now={now} date={formatToday(timezone, now)} />
          </Suspense>

          {/* On a phone the encouragement sits to the right of the greeting, level with it (the owner, 2026-10-21: "move this section on the right"); on a wider screen the scene holds the right, so it stays under the name. */}
          <div data-hero-words="" className="relative z-10 flex items-center gap-4 px-5 pt-3 pb-5 sm:block sm:max-w-[42%] sm:space-y-1 sm:p-6">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-lg font-medium text-[var(--wh-foreground-muted)]">{greetingFor(timezone, now)},</p>
              <h1 className="min-w-0 text-[1.75rem] leading-tight font-bold tracking-tight break-words text-balance min-[400px]:text-[2rem] sm:text-[2.5rem]">
                {firstName}! <span aria-hidden className="wh-hand-wave">👋</span>
              </h1>
            </div>
            <div className="w-[44%] max-w-[12rem] shrink-0 space-y-0.5 border-s-2 border-[var(--wh-primary-soft)] ps-3 sm:mt-1 sm:w-auto sm:max-w-none sm:border-0 sm:ps-0">
              <p className="text-sm font-semibold text-[var(--wh-foreground)] sm:text-base">{t("home.doingGreat")}</p>
              <p className="text-xs leading-snug text-[var(--wh-foreground-muted)] sm:text-sm">{t("home.lede")}</p>
            </div>
          </div>

          {/* The cat thinking out loud, in the room the header has (the owner, 2026-10-21). */}
          <Suspense fallback={<HeroCatFigure />}>
            <HeroCatThought session={session} now={now} />
          </Suspense>
        </header>

        {/* What reached WonderHome since this person last opened it: temporary, and gone once seen. */}
        <WhatsNewCard items={whatsNew} labels={whatsNewLabels(t, whatsNew.length)} />

        {/* The #tags the family is using in chat this week (the owner, 2026-10-21); nothing until someone tags something. */}
        <Suspense fallback={null}>
          <TrendingTags session={session} now={now} />
        </Suspense>

        <Suspense fallback={<LoadingState rows={4} label={t("homeScreen.loading")} />}>
          <DashboardBody session={session} now={now} />
        </Suspense>
      </div>
    </AppShell>
  );
}

async function DashboardBody({ session, now }: { session: Session; now: Date }) {
  const { supabase, membership, view } = session;
  const { t } = session.locale;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;

  // Setup guidance is for the people who can act on it: Admins. Prominent
  // for their first week, one quiet row after, gone at 100%.
  const manages = view.permissions.includes("household.manage");
  // Only a household administrator may record a payment (the server decides again).
  const markPaid = isHouseholdAdmin(membership)
    ? markPaidProps(t, { householdId: membership.household.id, timezone: membership.household.timezone, currency: session.locale.preferences.currency, now })
    : undefined;

  const todayIso = now.toISOString().slice(0, 10);

  // Events and meals are read once per request, shared with the cat's
  // thought (performance audit B4): the agenda keeps its own rows of them and
  // the next two weeks below are the events still to end within them.
  const shared = homeRows(supabase, householdId, membership.household.timezone, now.getTime());
  const fortnight = now.getTime() + 14 * 86_400_000;
  // Members are read once: this screen shows them and guided setup's
  // progress is worked out from the same rows (audit B7). Pets, responsibilities
  // and helper availability are only guided setup's, so only an Admin reads them.
  // Setup gets the reads as they are, so a read that fails hides its card as
  // before rather than showing progress from an empty list.
  const membersRead = listMembers(supabase, householdId, membership.household.ownerMemberId);
  const petsRead = manages ? listPets(supabase, householdId) : null;
  const responsibilitiesRead = manages ? readResponsibilities(supabase, householdId) : null;
  const helperReads = manages ? readHelperAvailability(supabase, householdId, todayIso) : null;
  // Setup may stop before it awaits these; a failed read is then not an unhandled rejection.
  for (const read of [petsRead, responsibilitiesRead, helperReads]) read?.catch(() => undefined);
  const [agenda, members, upcoming, setupFacts, onboarding] = await Promise.all([
    householdAgenda(supabase, householdId, view, { events: shared.events, meals: shared.meals }),
    membersRead.catch(() => []),
    shared.events
      .then((rows) => rows.filter((event) => event.endsAt.getTime() >= now.getTime() && event.startsAt.getTime() <= fortnight))
      .catch(() => []),
    manages ? loadSetupFacts(supabase, membership.household).catch(() => null) : Promise.resolve(null),
    // Guided setup still under way (story 02-009): its own resume row.
    manages && petsRead && responsibilitiesRead && helperReads
      ? loadOnboardingProgress(supabase, householdId, {
          members: membersRead,
          pets: petsRead,
          responsibilities: responsibilitiesRead,
          availability: helperReads.then(([, windows]) => windows),
        }).catch(() => null)
      : Promise.resolve(null),
  ]);

  const setup = setupFacts ? localizeSetup(assessSetup(setupFacts), t) : null;
  // The domains' own names and their quiet counts, in the reader's words
  // (the agenda's English `label`/`meta` stay the record).
  const domainName = (key: DomainSummary["key"]) => t(`homeScreen.domain.${key}`);
  const handled = agenda.handled.map((entry) => {
    const domain = agenda.domains.find((candidate) => candidate.key === entry.key);
    if (!domain) return entry;
    return { ...entry, title: domainName(domain.key), meta: t("homeScreen.handledMeta", { quiet: domain.checked - domain.needs.length, checked: domain.checked }) };
  });

  const handledCount = Math.max(0, agenda.checked - agenda.needsYou.length);

  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const todayFocus = upcoming.filter((event) => event.startsAt <= endOfToday && event.status !== "cancelled").slice(0, 3);
  // The next family moment (the calendar's family kinds); only when there is
  // none, the next thing of any kind, said as what it is (below).
  // A family moment is shared family time (`isFamilyMoment`: a family kind, and two or more going).
  const nextMoment = upcoming.find((event) => isFamilyMoment(event)) ?? upcoming[0] ?? null;
  // The card says what the event is (the owner, 2026-10-18: a school trip
  // came up as a "Family moment" with a heart and "Plan together"): when the
  // next thing is a school event or an appointment, the heading, the icon and
  // the action follow its kind.
  const momentLook =
    nextMoment?.kind === "school_event"
      ? { heading: t("home.schoolMoment"), icon: GraduationCap, iconClass: "text-[var(--wh-tone-school)]", family: false }
      : nextMoment?.kind === "appointment"
        ? { heading: t("home.appointmentMoment"), icon: CalendarClock, iconClass: "text-[var(--wh-primary)]", family: false }
        : nextMoment && isFamilyMoment(nextMoment)
          ? { heading: t("home.familyMoment"), icon: Heart, iconClass: "text-[var(--wh-tone-people)]", family: true }
          : // Anything else (one person's outing, say) is said as what is next, never as family time.
            { heading: t("home.nextMoment"), icon: CalendarClock, iconClass: "text-[var(--wh-primary)]", family: false };
  const MomentIcon = momentLook.icon;
  const memberName = (id: string) => members.find((member) => member.id === id)?.displayName ?? null;
  const momentGoing = nextMoment ? eventGoing(nextMoment, memberName, t, session.locale.format.locale) : { names: [], words: "" };

  // Which domain each notable assessment came from, so a Today's-focus row
  // can carry that domain's own colour badge (rule 3: domain colour, never
  // invented). Built from the same per-domain reads `householdAgenda`
  // already did — nothing here re-evaluates anything.
  // Each row in the four counts opens its own domain (the owner, 2026-10-20: "make these clickable").
  const hrefOfDomain = (key: string | undefined) => agenda.domains.find((domain) => domain.key === key)?.href;
  const domainBySubject = new Map<string, DomainSummary["key"]>();
  for (const domain of agenda.domains) {
    for (const need of domain.needs) domainBySubject.set(need.subjectKey, domain.key);
  }

  // What each of the four counts opens onto: the real entries behind the
  // number, never more of them invented for the panel than the count itself
  // stands for (rule 9).
  const metrics: ExpandableMetric[] = [
    {
      label: t("home.metric.needYou"),
      value: agenda.needsYou.length,
      icon: <IconTile icon={AlertTriangle} tone="attention" size="sm" />,
      details:
        agenda.needsYou.length === 0 ? (
          <MetricDetailEmpty>{t("homeScreen.metric.nothingNeedsYou")}</MetricDetailEmpty>
        ) : (
          <div className="space-y-2.5">
            <MetricDetailList>
              {agenda.needsYou.slice(0, 4).map((item) => {
                const presentation = iconForOutcome(item.subjectKey);
                return (
                  <MetricDetailRow
                    key={item.subjectKey}
                    icon={<IconTile icon={presentation.icon} tone={presentation.tone} size="sm" />}
                    title={item.title}
                    meta={item.reason}
                    href={hrefOfDomain(domainBySubject.get(item.subjectKey))}
                  />
                );
              })}
            </MetricDetailList>
            <PillLink href="/notifications" tone="quiet">
              {agenda.needsYou.length > 4 ? t("homeScreen.metric.viewAll", { count: agenda.needsYou.length }) : t("homeScreen.metric.open")}
            </PillLink>
          </div>
        ),
    },
    {
      label: t("home.metric.handled"),
      value: handledCount,
      icon: <IconTile icon={CircleCheck} tone="handled" size="sm" />,
      details:
        handled.length === 0 ? (
          <MetricDetailEmpty>{t("homeScreen.metric.nothingChecked")}</MetricDetailEmpty>
        ) : (
          <MetricDetailList>
            {handled.map((entry) => {
              const presentation = iconForOutcome(entry.key);
              return (
                <MetricDetailRow
                  key={entry.key}
                  icon={<IconTile icon={presentation.icon} tone={presentation.tone} size="sm" />}
                  title={entry.title}
                  meta={entry.meta}
                  href={hrefOfDomain(entry.key)}
                />
              );
            })}
          </MetricDetailList>
        ),
    },
    {
      label: t("home.metric.upcoming"),
      value: upcoming.length,
      icon: <IconTile icon={CalendarHeart} tone="people" size="sm" />,
      details:
        upcoming.length === 0 ? (
          <MetricDetailEmpty>{t("homeScreen.metric.nothingCalendar")}</MetricDetailEmpty>
        ) : (
          <div className="space-y-2.5">
            <MetricDetailList>
              {upcoming.slice(0, 4).map((event) => (
                <MetricDetailRow
                  key={event.id}
                  icon={<IconTile icon={CalendarHeart} tone="people" size="sm" />}
                  title={event.title}
                  meta={`${formatDate(timezone, event.startsAt)} · ${formatTime(timezone, event.startsAt)}`}
                  href={`/calendar/events/${event.id}`}
                />
              ))}
            </MetricDetailList>
            <PillLink href="/family" tone="quiet">
              {upcoming.length > 4 ? t("homeScreen.metric.viewAll", { count: upcoming.length }) : t("homeScreen.metric.open")}
            </PillLink>
          </div>
        ),
    },
    {
      label: t("home.metric.checked"),
      value: agenda.checked,
      icon: <IconTile icon={Sparkles} tone="ai" size="sm" />,
      details:
        agenda.domains.length === 0 ? (
          <MetricDetailEmpty>{t("homeScreen.metric.nothingEvaluated")}</MetricDetailEmpty>
        ) : (
          <MetricDetailList>
            {agenda.domains.map((domain) => {
              const presentation = iconForOutcome(domain.key);
              return (
                <MetricDetailRow
                  key={domain.key}
                  icon={<IconTile icon={presentation.icon} tone={presentation.tone} size="sm" />}
                  title={domainName(domain.key)}
                  meta={domain.failed ? t("homeScreen.metric.couldNotCheck") : t("homeScreen.metric.checkedCount", { count: domain.checked })}
                  href={domain.href}
                />
              );
            })}
          </MetricDetailList>
        ),
    },
  ];

  return (
    <>
      {/* One row with a chevron, whether it is somebody's first week or not:
          Home is where the household looks for what needs them today, and
          setup is a thing to go and finish rather than a block to read. */}
      {onboarding ? (
        <OnboardingResumeCard summary={onboarding} labels={onboardingCardLabels(onboarding, t)} />
      ) : setup && !setup.complete ? (
        <SetupProgressCard assessment={setup} variant="compact" labels={setupProgressLabels(setup, t)} />
      ) : null}
      {/* Language, region and currency (story 22-003): offered once, quietly,
          until it is done or put away — never while family setup still is. */}
      {!onboarding && shouldOfferLocaleSetup(membership.locale?.setup) ? (
        <PersonalizeCard title={t("personalize.title")} body={t("personalize.body")} action={t("personalize.action")} dismissLabel={t("common.dismiss")} />
      ) : null}

      {/* Four counts, two to a row on a phone (rule 19), each opening in
          place onto its real entries (rule 21) instead of only linking away. */}
      <ExpandableMetricGrid pairs metrics={metrics} />

      {/* Today's focus and the family moment: each full width. Both are
          primary reading rather than shortcuts, so neither is ever squeezed
          into half a row on a phone (rule 19: primary information is a
          full-width card, never one of a pair). */}
      <div className="space-y-4">
        <Card className="wh-rise p-4" style={{ "--wh-rise-delay": "120ms" } as React.CSSProperties}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <Sun aria-hidden className="size-5 shrink-0 text-[var(--wh-tone-money)]" />
              <h2 className="text-base font-semibold tracking-tight">{t("home.todaysFocus")}</h2>
            </div>
            <PillLink href="/calendar?view=day" tone="quiet">
              {t("homeScreen.seeAll")}
            </PillLink>
          </div>
          {todayFocus.length === 0 && agenda.needsYou.length === 0 ? (
            <EmptyState
              icon={CircleCheck}
              tone="handled"
              title={t("homeScreen.clearDay")}
              description={t("homeScreen.clearDayLede")}
              className="py-6"
            />
          ) : (
            <ul className="space-y-1">
              {agenda.needsYou.slice(0, 2).map((item) => {
                const badge = focusBadge(item.riskLevel, domainBySubject.get(item.subjectKey), t);
                return (
                  <AgendaExpandableRow
                    key={item.subjectKey}
                    item={item}
                    timezone={timezone}
                    badge={markPaid && item.action?.action === "pay_bill" ? undefined : <Badge tone={badge.tone}>{badge.label}</Badge>}
                    markPaid={markPaid}
                  />
                );
              })}
              {todayFocus.map((event) => (
                <TodayEventRow key={event.id} event={event} timezone={timezone} t={t} />
              ))}
            </ul>
          )}
        </Card>

        <Card className="wh-rise p-4" style={{ "--wh-rise-delay": "150ms" } as React.CSSProperties}>
          <div className="mb-3 flex items-center gap-2.5">
            <MomentIcon aria-hidden className={`size-5 shrink-0 ${momentLook.iconClass}`} />
            <h2 className="text-base font-semibold tracking-tight">{nextMoment ? momentLook.heading : t("home.familyMoment")}</h2>
          </div>
          {nextMoment ? (
            <>
              {/* The event gets the card's full width: no second kind tile (the
                  heading says the kind), and its action moves down beside who
                  is going, so the title and its time never squeeze (rule 15). */}
              <ul className="-mx-2">
                <CalendarItem
                  title={nextMoment.title}
                  kind={nextMoment.kind}
                  showKind={false}
                  protectedTime={nextMoment.protected}
                  protectedLabel={t("family.protected")}
                  day={formatDate(timezone, nextMoment.startsAt).split(" ")[0] ?? ""}
                  month={formatDate(timezone, nextMoment.startsAt).split(" ")[1] ?? ""}
                  when={eventWhen(nextMoment, timezone, t)}
                  place={nextMoment.location}
                  href={`/calendar/events/${nextMoment.id}`}
                />
              </ul>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--wh-border)] pt-3">
                {/* Who is going is the event's own list, never the whole family. */}
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {momentGoing.names.length > 0 ? <AvatarGroup names={momentGoing.names} /> : null}
                  <span className="min-w-0 text-xs text-[var(--wh-foreground-muted)]">{momentGoing.words}</span>
                  <Link
                    href={`/calendar/events/${nextMoment.id}#family`}
                    aria-label={t("events.going.ask")}
                    title={t("events.going.ask")}
                    className="grid size-8 shrink-0 place-items-center rounded-full border border-dashed border-[var(--wh-border-strong)] text-[var(--wh-foreground-subtle)] hover:bg-[var(--wh-surface-muted)]"
                  >
                    <UserRoundPlus aria-hidden className="size-4" />
                  </Link>
                </div>
                {momentLook.family ? (
                  <PillLink href="/family" tone="soft">
                    {t("homeScreen.planTogether")}
                  </PillLink>
                ) : (
                  <PillLink href={`/calendar/events/${nextMoment.id}`} tone="soft">
                    {t("homeScreen.openEvent")}
                  </PillLink>
                )}
              </div>
              {/* "More family time!" belongs to family time — never to a
                  school trip or an office event (the owner, 2026-10-18). */}
              {momentLook.family ? (
                <ScriptAccent size="sm" tilt={false} heart className="mt-2 block text-end">
                  {t("homeScreen.moreFamilyTime")}
                </ScriptAccent>
              ) : null}
            </>
          ) : (
            <div className="flex flex-1 flex-col">
              <HomeIllustration className="mx-auto w-full max-w-[13rem]" />
              <ScriptAccent className="mt-2 text-center text-lg">{t("homeScreen.moreMoments")}</ScriptAccent>
              <p className="mt-1 text-center text-xs text-[var(--wh-foreground-muted)]">
                {t("homeScreen.protectSlot")}
              </p>
              {/* The real form, here. This used to link to the Family
                  screen, which is not planning anything — it is moving the
                  person somewhere they then have to find it. */}
              <div className="mt-3 flex justify-center">
                <NewEventForm householdId={householdId} label={t("today.planSomething")} labels={eventFormLabels(t, { placeSearch: eventPlaceSearch(membership) })} />
              </div>
            </div>
          )}
        </Card>
      </div>

      {handled.length > 0 ? (
        <Card
          className="wh-rise border-[var(--wh-handled)]/40 bg-[var(--wh-handled-soft)]/70 p-4"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <Sparkles aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--wh-handled)]" />
              <div className="min-w-0">
                <h2 className="text-base font-semibold tracking-tight">{t("home.handled")}</h2>
                <p className="text-xs text-[var(--wh-foreground-muted)]">{t("home.handledLede")}</p>
              </div>
            </div>
            <PillLink href="/calendar?view=day" tone="quiet">
              {t("homeScreen.viewAll")}
            </PillLink>
          </div>
          <HandledList items={handled.slice(0, 4)} />
        </Card>
      ) : null}

      <QuoteCard>{t("homeScreen.quote")}</QuoteCard>
    </>
  );
}

/** Guided setup's progress, while it is still under way — nothing once it is finished or never begun. */
async function loadOnboardingProgress(
  supabase: Session["supabase"],
  householdId: string,
  rows: {
    members: Promise<HouseholdMember[]>;
    pets: Promise<{ id: string; name: string; species: string }[]>;
    responsibilities: Promise<ResponsibilityJoinRow[]>;
    availability: Promise<AvailabilityWindowRow[]>;
  },
): Promise<OnboardingSummary | null> {
  const state = await loadOnboarding(supabase, householdId);
  if (!state || state.status === "completed") return null;
  const facts = await loadOnboardingFacts(supabase, householdId, state, {
    members: rows.members,
    pets: rows.pets,
    responsibilityKeys: rows.responsibilities.then((list) => list.map((row) => row.outcome_key)),
    availability: rows.availability.then((list) => list.map((row) => ({ memberId: row.member_id, dayOfWeek: Number(row.day_of_week) }))),
  });
  return onboardingSummary(facts);
}
