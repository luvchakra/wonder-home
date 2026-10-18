import { CalendarDays, ChevronLeft, ChevronRight, ListChecks } from "lucide-react";
import Link from "next/link";

import {
  atLocal,
  CALENDAR_VIEWS,
  eachDay,
  isDateKey,
  localMoment,
  monthGrid,
  partsOf,
  startOfWeek,
  shiftDate,
  stepFocus,
  viewRange,
  zoomView,
  type CalendarView,
} from "@wonderhome/core/calendar/dates";
import { DAY_GRID, gridHoursFor, layoutDay, type DayGridOptions } from "@wonderhome/core/calendar/layout";
import { applyFilters, activeFilterCount, effectiveHolidayRegion, parsePreferences } from "@wonderhome/core/calendar/preferences";
import { CALENDAR_CATEGORIES, densityByDay, entriesByDay, type CalendarEntry } from "@wonderhome/core/calendar/projection";
import { calendarRange, holidayRegions, readCalendarPreferences } from "@wonderhome/core/calendar/repository";
import { isHouseholdAdmin, listMembers } from "@wonderhome/core/identity/households";
import type { Translate } from "@wonderhome/core/i18n/translate";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { NavRow } from "@wonderhome/core/ui/action-row";
import { CalendarDayGrid, CalendarWeekStrip, type DayBlock } from "@wonderhome/core/ui/calendar-day";
import { CalendarEntryRow } from "@wonderhome/core/ui/calendar-entry";
import { CalendarMonthGrid, type MonthCell } from "@wonderhome/core/ui/calendar-month";
import { CalendarYear, type YearMonth } from "@wonderhome/core/ui/calendar-year";
import { Card } from "@wonderhome/core/ui/card";
import { PillLink } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { SegmentedControl } from "@wonderhome/core/ui/segmented-control";
import { EmptyState } from "@wonderhome/core/ui/states";

import { NewEventForm } from "../_components/new-event-form";
import { calendarHref, dateWords, entryRow, weekStartFor, whenOn, type DateWords, type EntryWords } from "../_lib/calendar-view";
import { eventFormLabels } from "../_lib/event-form-labels";
import { formatTime, requireSession } from "../_lib/session";
import { CalendarFilters } from "./_components/calendar-filters";
import { CalendarGestures } from "./_components/calendar-gestures";

export const metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

const VIEW_ORDER: CalendarView[] = ["month", "week", "day", "year"];

/**
 * The Family Calendar (story 12-009, design/FAMILY-CALENDAR-PHASE0.md).
 *
 * A projection of what the household already keeps — family events, birthdays
 * and occasions, public holidays — read through this member's own session, so
 * a private event never reaches anyone but its owner. Month opens by default;
 * Week, Day and Year are a tap, a pinch or a key away, and every one keeps the
 * focused date. Entries open the screen that owns them; nothing is edited here.
 */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const [params, session] = await Promise.all([searchParams, requireSession("/calendar")]);
  const { supabase, membership, viewer, secondary, locale } = session;
  const { t } = locale;
  const householdId = membership.household.id;
  const timeZone = membership.household.timezone;
  const now = new Date();
  const today = localMoment(now, timeZone).dateKey;

  const preferences = await readCalendarPreferences(supabase, membership.memberId).catch(() => parsePreferences(null));
  const view: CalendarView = CALENDAR_VIEWS.includes(params.view as CalendarView) ? (params.view as CalendarView) : preferences.defaultView;
  const focus = isDateKey(params.date) ? params.date : today;
  const weekStartsOn = weekStartFor(locale.preferences.region);
  const range = viewRange(view, focus, weekStartsOn);
  const words = dateWords(locale.format.locale);

  const [members, result, regions] = await Promise.all([
    listMembers(supabase, householdId, membership.household.ownerMemberId).catch(() => []),
    calendarRange(supabase, {
      householdId,
      householdRegion: locale.preferences.region ?? null,
      viewer: { memberId: membership.memberId, isAdmin: isHouseholdAdmin(membership), timeZone },
      from: range.from,
      to: range.to,
      holidayRegion: preferences.holidayRegion,
      words: {
        birthday: (name) => t("calendar.entry.birthday", { name }),
        occasion: (name, label) => (label ? t("calendar.entry.occasion", { name, label }) : t("calendar.entry.occasionFallback", { name })),
      },
    }).catch(() => ({ entries: [] as CalendarEntry[], failedSources: ["event" as const] })),
    holidayRegions(supabase),
  ]);

  const active = members.filter((member) => member.status !== "inactive");
  const nameOf = (id: string) => active.find((member) => member.id === id)?.displayName ?? null;
  const entries = applyFilters(result.entries, preferences.filters, membership.memberId);
  const entryWords: EntryWords = { t, time: (at) => formatTime(timeZone, at), shortDate: words.shortDate, nameOf, timeZone };
  const byDay = entriesByDay(entries, timeZone);

  const href = (target: CalendarView, date: string) => calendarHref(target, date);
  const previousHref = href(view, stepFocus(view, focus, -1));
  const nextHref = href(view, stepFocus(view, focus, 1));
  const zoomInHref = view === "day" ? null : href(zoomView(view, "in"), focus);
  const zoomOutHref = view === "year" ? null : href(zoomView(view, "out"), focus);
  const { year, month } = partsOf(focus);
  const periodTitle =
    view === "month" ? words.monthTitle(year, month) : view === "week" ? t("calendar.weekOf", { date: words.shortDate(range.from) }) : view === "day" ? words.dayTitle(focus) : String(year);

  const filterCount = activeFilterCount(preferences.filters) + (preferences.holidayRegion ? 1 : 0);
  const formLabels = eventFormLabels(t);
  const memberChoices = active.map((member) => ({ value: member.id, label: member.displayName }));
  const household = effectiveHolidayRegion(null, locale.preferences.region ?? null);
  const holidayOptions = [
    { value: "", label: household ? `${t("calendar.filters.holidays.household")} (${regionLabel(household, t)})` : t("calendar.filters.holidays.household") },
    ...regions.filter((region) => region !== household).map((region) => ({ value: region, label: regionLabel(region, t) })),
    { value: "off", label: t("calendar.filters.holidays.off") },
  ];

  const agenda = <DayAgenda day={focus} entries={byDay.get(focus) ?? []} today={today} words={words} entryWords={entryWords} t={t} />;
  const showsPanel = view === "month" || view === "week";

  return (
    <AppShell active="calendar" viewer={viewer} secondary={secondary} pathname="/calendar" wide contextPanel={showsPanel ? agenda : undefined}>
      <div className="space-y-5">
        <header className="wh-rise space-y-1">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("calendar.title")}</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">{t("calendar.lede", { name: viewer.displayName.split(" ")[0] ?? viewer.displayName })}</p>
        </header>

        {/* On a phone the period gets a row of its own, so "October 2026" is never squeezed by the buttons beside it (rule 15). */}
        <div className="space-y-2 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-2 sm:space-y-0">
          <nav aria-label={t("calendar.nav.label")} className="flex items-center gap-1">
            <Link href={previousHref} scroll={false} aria-label={t(`calendar.previous.${view}`)} className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]">
              <ChevronLeft aria-hidden className="size-5 rtl:rotate-180" />
            </Link>
            <h2 className="flex-1 text-center text-lg font-semibold sm:flex-none sm:text-start" aria-live="polite">{periodTitle}</h2>
            <Link href={nextHref} scroll={false} aria-label={t(`calendar.next.${view}`)} className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]">
              <ChevronRight aria-hidden className="size-5 rtl:rotate-180" />
            </Link>
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            {focus !== today ? <PillLink href={href(view, today)} tone="quiet">{t("calendar.today")}</PillLink> : null}
            <CalendarFilters
              householdId={householdId}
              labels={{
                button: filterCount > 0 ? t("calendar.filters.count", { count: filterCount }) : t("calendar.filters"),
                title: t("calendar.filters.title"),
                description: t("calendar.filters.description"),
                categories: t("calendar.filters.categories"),
                people: t("calendar.filters.people"),
                peopleHint: t("calendar.filters.peopleHint"),
                onlyMine: t("calendar.filters.onlyMine"),
                confirmedOnly: t("calendar.filters.confirmedOnly"),
                holidays: t("calendar.filters.holidays"),
                openOn: t("calendar.filters.openOn"),
                save: t("calendar.filters.save"),
                saving: t("calendar.filters.saving"),
                failed: t("calendar.filters.failed"),
              }}
              categories={CALENDAR_CATEGORIES.map((value) => ({ value, label: t(`calendar.category.${value}`) }))}
              shown={CALENDAR_CATEGORIES.filter((category) => !preferences.filters.hiddenCategories.includes(category))}
              members={memberChoices}
              memberIds={preferences.filters.memberIds}
              onlyMine={preferences.filters.onlyMine}
              confirmedOnly={preferences.filters.confirmedOnly}
              holidayOptions={holidayOptions}
              holidayRegion={preferences.holidayRegion ?? ""}
              views={VIEW_ORDER.map((value) => ({ value, label: t(`calendar.view.${value}`) }))}
              defaultView={preferences.defaultView}
            />
            <NewEventForm householdId={householdId} labels={formLabels} members={memberChoices} defaultDate={focus} variant="primary" />
          </div>
        </div>

        <SegmentedControl
          label={t("calendar.view.label")}
          active={view}
          segments={VIEW_ORDER.map((key) => ({ key, label: t(`calendar.view.${key}`), href: href(key, focus) }))}
        />

        {result.failedSources.length > 0 ? (
          <p role="status" className="rounded-[var(--wh-radius-sm)] bg-[var(--wh-attention-soft)] px-3 py-2 text-sm">{t("calendar.failed")}</p>
        ) : null}

        <CalendarGestures previousHref={previousHref} nextHref={nextHref} zoomInHref={zoomInHref} zoomOutHref={zoomOutHref} label={periodTitle}>
          {view === "month" ? (
            <Card className="p-2 sm:p-3">
              <CalendarMonthGrid label={periodTitle} weekdays={words.weekdays(weekStartsOn, "short")} cells={monthCells({ year, month, focus, today, weekStartsOn, byDay, words, t })} />
            </Card>
          ) : view === "week" ? (
            <WeekView days={eachDay(range.from, range.to)} byDay={byDay} today={today} timeZone={timeZone} words={words} entryWords={entryWords} t={t} now={now} />
          ) : view === "day" ? (
            <DayView focus={focus} today={today} weekStartsOn={weekStartsOn} byDay={byDay} timeZone={timeZone} words={words} entryWords={entryWords} t={t} now={now} />
          ) : (
            <CalendarYear
              legend={t("calendar.year.legend")}
              weekdays={words.weekdays(weekStartsOn, "narrow")}
              months={yearMonths({ year, today, weekStartsOn, density: densityByDay(entries, timeZone), words, t })}
            />
          )}
        </CalendarGestures>

        {showsPanel ? <div className="xl:hidden">{agenda}</div> : null}

        <QuoteCard>{t("calendar.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}

function regionLabel(region: string, t: Translate): string {
  return region === "IN" || region === "IN-DL" ? t(`calendar.filters.holidays.${region}`) : region;
}

function dayLabel(date: string, count: number, words: DateWords, t: Translate): string {
  const name = words.dayTitle(date);
  return count > 0 ? t("calendar.day.count", { date: name, count }) : t("calendar.day.free", { date: name });
}

function monthCells({
  year,
  month,
  focus,
  today,
  weekStartsOn,
  byDay,
  words,
  t,
}: {
  year: number;
  month: number;
  focus: string;
  today: string;
  weekStartsOn: number;
  byDay: Map<string, CalendarEntry[]>;
  words: DateWords;
  t: Translate;
}): MonthCell[] {
  return monthGrid(year, month, weekStartsOn).map((key) => {
    const list = byDay.get(key) ?? [];
    return {
      key,
      label: words.dayNumber(key),
      href: calendarHref("month", key),
      ariaLabel: dayLabel(key, list.length, words, t),
      inMonth: partsOf(key).month === month,
      isToday: key === today,
      isSelected: key === focus,
      dots: list.slice(0, 3).map((entry) => entry.category),
      titles: list.slice(0, 2).map((entry) => ({ title: entry.title, category: entry.category, proposed: entry.status === "proposed" })),
      moreShort: list.length > 3 ? t("calendar.day.more", { count: list.length - 3 }) : null,
      moreLong: list.length > 2 ? t("calendar.day.moreLong", { count: list.length - 2 }) : null,
    };
  });
}

function yearMonths({
  year,
  today,
  weekStartsOn,
  density,
  words,
  t,
}: {
  year: number;
  today: string;
  weekStartsOn: number;
  density: ReturnType<typeof densityByDay>;
  words: DateWords;
  t: Translate;
}): YearMonth[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const name = words.monthName(year, month);
    const first = `${year}-${String(month).padStart(2, "0")}-01`;
    return {
      key: first,
      name,
      href: calendarHref("month", first),
      ariaLabel: t("calendar.year.month", { month: words.monthTitle(year, month) }),
      days: monthGrid(year, month, weekStartsOn).map((key) => {
        if (partsOf(key).month !== month) return null;
        const total = density[key]?.total ?? 0;
        return {
          key,
          label: words.dayNumber(key),
          href: calendarHref("day", key),
          ariaLabel: dayLabel(key, total, words, t),
          level: total === 0 ? 0 : total === 1 ? 1 : total <= 3 ? 2 : 3,
          isToday: key === today,
        };
      }),
    };
  });
}

function DayAgenda({ day, entries, today, words, entryWords, t }: { day: string; entries: CalendarEntry[]; today: string; words: DateWords; entryWords: EntryWords; t: Translate }) {
  return (
    <section aria-label={words.dayTitle(day)} className="space-y-2">
      <SectionHeader title={words.dayTitle(day)} />
      {entries.length === 0 ? (
        <EmptyState icon={CalendarDays} tone="people" title={t("calendar.agenda.empty")} description={t("calendar.agenda.emptyLede")} />
      ) : (
        <Card className="px-2 py-1">
          <ul className="divide-y divide-[var(--wh-border)]">
            {entries.map((entry) => {
              const { key, ...row } = entryRow(entry, day, entryWords);
              return <CalendarEntryRow key={key} {...row} />;
            })}
          </ul>
        </Card>
      )}
      {day === today ? (
        <Card className="px-3 py-1">
          <ul>
            <NavRow icon={ListChecks} tone="primary" title={t("calendar.agenda.todayPlan")} meta={t("calendar.agenda.todayPlanLede")} href="/today" />
          </ul>
        </Card>
      ) : null}
    </section>
  );
}

function blocksFor(entries: CalendarEntry[], day: string, timeZone: string, options: DayGridOptions, entryWords: EntryWords): DayBlock[] {
  return layoutDay(entries, day, timeZone, options).map((placed) => {
    const row = entryRow(placed.entry, day, entryWords);
    return {
      key: placed.entry.id,
      title: placed.entry.title,
      when: placed.clippedStart ? entryWords.t("calendar.entry.until", { time: entryWords.time(placed.entry.end ?? placed.entry.start) }) : whenOn(placed.entry, day, entryWords),
      who: row.who,
      category: placed.entry.category,
      proposed: placed.entry.status === "proposed",
      href: row.href,
      top: placed.top,
      height: placed.height,
      column: placed.column,
      columns: placed.columns,
    };
  });
}

/** "6 am", "18" — each hour line in the person's own time format, on the household's clock. */
function hourLabels(options: DayGridOptions, day: string, timeZone: string, time: (at: Date) => string): string[] {
  return Array.from({ length: options.endHour - options.startHour + 1 }, (_, index) => {
    const hour = options.startHour + index;
    return hour >= 24 ? "" : time(atLocal(day, hour * 60, timeZone)).replace(/[:.]00(?=\D|$)/, "");
  });
}

/** Minutes from the grid's first hour to now, when now is on that day's grid. */
function nowOffset(day: string, today: string, now: Date, timeZone: string, options: DayGridOptions): number | null {
  if (day !== today) return null;
  const minute = localMoment(now, timeZone).minuteOfDay - options.startHour * 60;
  return minute >= 0 && minute <= (options.endHour - options.startHour) * 60 ? minute : null;
}

const isLaneEntry = (entry: CalendarEntry) => entry.allDay || entry.kind !== "block" || !entry.end;

function DayView({
  focus,
  today,
  weekStartsOn,
  byDay,
  timeZone,
  words,
  entryWords,
  t,
  now,
}: {
  focus: string;
  today: string;
  weekStartsOn: number;
  byDay: Map<string, CalendarEntry[]>;
  timeZone: string;
  words: DateWords;
  entryWords: EntryWords;
  t: Translate;
  now: Date;
}) {
  const weekFrom = startOfWeek(focus, weekStartsOn);
  const list = byDay.get(focus) ?? [];
  const lane = list.filter(isLaneEntry);
  const options = gridHoursFor(list, focus, timeZone, DAY_GRID);
  const hours = hourLabels(options, focus, timeZone, entryWords.time);
  return (
    <div className="space-y-4">
      <CalendarWeekStrip
        label={t("calendar.day.week")}
        days={eachDay(weekFrom, shiftDate(weekFrom, 6)).map((key) => ({
          key,
          weekday: words.weekdayOf(key),
          label: words.dayNumber(key),
          href: calendarHref("day", key),
          ariaLabel: dayLabel(key, (byDay.get(key) ?? []).length, words, t),
          isToday: key === today,
          isSelected: key === focus,
          busy: (byDay.get(key) ?? []).length > 0,
        }))}
      />
      {lane.length > 0 ? (
        <Card className="px-2 py-1">
          <ul className="divide-y divide-[var(--wh-border)]" aria-label={t("calendar.agenda.allDay")}>
            {lane.map((entry) => {
              const { key, ...row } = entryRow(entry, focus, entryWords);
              return <CalendarEntryRow key={key} {...row} />;
            })}
          </ul>
        </Card>
      ) : null}
      {list.length === 0 ? <EmptyState icon={CalendarDays} tone="people" title={t("calendar.agenda.empty")} description={t("calendar.agenda.emptyLede")} /> : null}
      <Card className="p-3">
        <CalendarDayGrid
          label={words.dayTitle(focus)}
          hours={hours}
          blocks={blocksFor(list, focus, timeZone, options, entryWords)}
          nowTop={nowOffset(focus, today, now, timeZone, options)}
        />
      </Card>
      {focus === today ? (
        <Card className="px-3 py-1">
          <ul>
            <NavRow icon={ListChecks} tone="primary" title={t("calendar.agenda.todayPlan")} meta={t("calendar.agenda.todayPlanLede")} href="/today" />
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function WeekView({
  days,
  byDay,
  today,
  timeZone,
  words,
  entryWords,
  t,
  now,
}: {
  days: string[];
  byDay: Map<string, CalendarEntry[]>;
  today: string;
  timeZone: string;
  words: DateWords;
  entryWords: EntryWords;
  t: Translate;
  now: Date;
}) {
  // One set of hours for the whole week, wide enough for its earliest start and latest end.
  const options = days.reduce<DayGridOptions>((wide, day) => {
    const own = gridHoursFor(byDay.get(day) ?? [], day, timeZone, DAY_GRID);
    return { ...wide, startHour: Math.min(wide.startHour, own.startHour), endHour: Math.max(wide.endHour, own.endHour) };
  }, DAY_GRID);
  const hours = Array.from({ length: options.endHour - options.startHour + 1 }, (_, index) => String(options.startHour + index));

  return (
    <>
      {/* Below lg: seven stacked days, never a squeezed grid (rules 15 and 19). */}
      <div className="space-y-4 lg:hidden">
        {days.map((day) => {
          const list = byDay.get(day) ?? [];
          return (
            <section key={day} aria-labelledby={`week-${day}`} className="space-y-1.5">
              <h3 id={`week-${day}`} className="flex items-center gap-2 text-sm font-semibold">
                <Link href={calendarHref("day", day)} className="rounded-[var(--wh-radius-sm)] hover:text-[var(--wh-primary)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]" aria-current={day === today ? "date" : undefined}>
                  {words.dayTitle(day)}
                </Link>
              </h3>
              {list.length === 0 ? (
                <p className="px-1 text-sm text-[var(--wh-foreground-muted)]">{t("calendar.agenda.empty")}</p>
              ) : (
                <Card className="px-2 py-1">
                  <ul className="divide-y divide-[var(--wh-border)]">
                    {list.map((entry) => {
                      const { key, ...row } = entryRow(entry, day, entryWords);
                      return <CalendarEntryRow key={key} {...row} />;
                    })}
                  </ul>
                </Card>
              )}
            </section>
          );
        })}
      </div>

      {/* lg and up: a seven-column time grid, all-day entries above it. */}
      <Card className="hidden p-3 lg:block">
        <div className="grid grid-cols-7 gap-2">
          {days.map((day) => {
            const list = byDay.get(day) ?? [];
            const lane = list.filter(isLaneEntry);
            return (
              <div key={day} className="min-w-0 space-y-2">
                <Link href={calendarHref("day", day)} className={`block rounded-[var(--wh-radius-sm)] px-1 text-sm font-semibold hover:text-[var(--wh-primary)] ${day === today ? "text-[var(--wh-primary)]" : ""}`}>
                  {words.weekdayOf(day)} {words.dayNumber(day)}
                </Link>
                <ul className="min-h-6 space-y-1">
                  {lane.map((entry) => {
                    const target = entryRow(entry, day, entryWords).href;
                    const chip = "block rounded-[0.375rem] bg-[var(--wh-surface-muted)] px-1.5 py-0.5 text-xs [overflow-wrap:anywhere]";
                    return (
                      <li key={entry.id}>
                        {target ? <Link href={target} className={`${chip} hover:text-[var(--wh-primary)]`}>{entry.title}</Link> : <span className={chip}>{entry.title}</span>}
                      </li>
                    );
                  })}
                </ul>
                <CalendarDayGrid compact label={words.dayTitle(day)} hours={hours} blocks={blocksFor(list, day, timeZone, options, entryWords)} nowTop={nowOffset(day, today, now, timeZone, options)} />
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}
