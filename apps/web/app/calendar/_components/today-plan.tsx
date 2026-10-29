import {
  AlertTriangle,
  CalendarHeart,
  Clock3,
  GraduationCap,
  ListChecks,
  ShoppingBasket,
  Utensils,
  Wallet,
} from "lucide-react";
import { Suspense } from "react";

import { describePredictionBasis, lookAheadWindow, predictHousehold } from "@wonderhome/core/ai/predictions";
import { listConsumables } from "@wonderhome/core/commerce/repository";
import { listEvents } from "@wonderhome/core/family/repository";
import { listObligations } from "@wonderhome/core/finance/repository";
import { format as formatMoney } from "@wonderhome/core/finance/payments";
import { listMembers } from "@wonderhome/core/identity/households";
import { listMeals, listRecipeChoices } from "@wonderhome/core/meals/repository";
import { listCatalogRecipes } from "@wonderhome/core/meals/recipe-catalog";
import { pickerDishes } from "@wonderhome/core/meals/recipe-picker";
import { publicEnv } from "@wonderhome/core/config/env";
import { isoDateIn } from "@wonderhome/core/context/format";
import { listSchoolItems } from "@wonderhome/core/school/repository";
import { schoolDateValue, schoolTimeWords } from "@wonderhome/core/school/times";
import type { Translate } from "@wonderhome/core/i18n/translate";
import { ActionRow } from "@wonderhome/core/ui/action-row";
import { Card } from "@wonderhome/core/ui/card";
import { PillLink } from "@wonderhome/core/ui/pill";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { SegmentedControl } from "@wonderhome/core/ui/segmented-control";
import { EmptyState, LoadingState } from "@wonderhome/core/ui/states";
import { Timeline, type TimelineItem } from "@wonderhome/core/ui/timeline";

import { AgendaRow } from "../../_components/agenda-row";
import { ChangeMealButton, PlanMealButton } from "../../_components/meal-forms";
import { groceryWords } from "../../_lib/grocery-words";
import { mealFormLabels, recipePickerLabels } from "../../_lib/meal-form-labels";
import { agendaReads, householdAgenda, type AgendaRows } from "../../_lib/agenda";
import { formatTime, type Session } from "../../_lib/session";

export type TodayLens = "mine" | "family" | "household";

/** Where each lens lives: the Calendar's Day view on today, with `lens` for the two that are not the default. */
export function todayLensHref(lens: TodayLens): string {
  return lens === "mine" ? "/calendar?view=day" : `/calendar?view=day&lens=${lens}`;
}

/**
 * The whole-list bill and school reads the household lens needs, started once
 * so the Calendar's Day view can use the same rows for its own entries
 * (performance plan PERF-09). Null on the other lenses and for children.
 */
export function householdLensReads(session: Session, lens: TodayLens): Pick<AgendaRows, "obligations" | "schoolItems"> | null {
  const { supabase, membership, view } = session;
  if (view.tone === "child" || lens !== "household") return null;
  const shares = agendaReads(view);
  const householdId = membership.household.id;
  const reads: Pick<AgendaRows, "obligations" | "schoolItems"> = {
    obligations: shares.obligations ? listObligations(supabase, householdId) : undefined,
    schoolItems: shares.schoolItems ? listSchoolItems(supabase, householdId) : undefined,
  };
  // The page and the plan each attach their own handling; a failed read is never unhandled.
  reads.obligations?.catch(() => undefined);
  reads.schoolItems?.catch(() => undefined);
  return reads;
}

/**
 * Today's plan (requirements §12), as the Calendar's Day view shows it under
 * today's events (design/UI-SIMPLIFICATION-v1.md M4: Today was its own screen).
 *
 * My day is what involves this person. Family is everyone's shared time.
 * Household is what the home itself needs. Items are commitments and
 * deadlines — a meal to be ready, a bill due, a class — never chores to tick.
 * Planning something new is the Calendar's own button, so none here.
 */
export function TodayPlan({ session, lens, now, reads }: { session: Session; lens: TodayLens; now: Date; reads?: Pick<AgendaRows, "obligations" | "schoolItems"> | null }) {
  const { view, locale } = session;
  const { t } = locale;
  const isChild = view.tone === "child";
  const active: TodayLens = isChild && lens === "household" ? "mine" : lens;

  return (
    <section aria-label={t("calendar.agenda.todayPlan")} className="space-y-4">
      <SectionHeader title={t("calendar.agenda.todayPlan")} />
      <SegmentedControl
        label={t("today.whoseDay")}
        active={active}
        segments={[
          { key: "mine", label: t("today.view.mine"), href: todayLensHref("mine") },
          { key: "family", label: t("today.view.family"), href: todayLensHref("family") },
          ...(isChild ? [] : [{ key: "household", label: t("today.view.household"), href: todayLensHref("household") }]),
        ]}
      />

      <Suspense fallback={<LoadingState rows={4} label={t("today.loading")} />}>
        <TodayBody session={session} active={active} now={now} reads={reads ?? null} />
      </Suspense>

      {active === "mine" && !isChild ? (
        <Card className="flex items-center gap-3 p-4">
          <ListChecks aria-hidden className="size-5 shrink-0 text-[var(--wh-primary)]" />
          <p className="min-w-0 flex-1 text-sm text-[var(--wh-foreground-muted)]">{t("today.routinesSilent")}</p>
        </Card>
      ) : null}
    </section>
  );
}

async function TodayBody({ session, active, now, reads }: { session: Session; active: "mine" | "family" | "household"; now: Date; reads: Pick<AgendaRows, "obligations" | "schoolItems"> | null }) {
  const { supabase, membership, view, locale } = session;
  const { t } = locale;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(now);
  dayEnd.setHours(23, 59, 59, 999);
  const today = now.toISOString().slice(0, 10);

  const isChild = view.tone === "child";
  const seesMoney = view.permissions.includes("finance.view");
  const seesSchool = view.permissions.includes("school.manage") || view.permissions.includes("school.view_own");

  // Bills and school items only for today and the look-ahead, never the whole history.
  const ahead = lookAheadWindow(now);
  // The household agenda (a 6-domain scan) feeds only the "household" tab's
  // needsYou + predictions, so compute it only there — not on mine/family.
  // There it reads events, meals, bills, school items and the cupboard too:
  // each table is read once, wide enough for both, and this screen keeps
  // its own window of the rows (performance audit B4).
  const withAgenda = !isChild && active === "household";
  const shares = withAgenda ? agendaReads(view) : null;
  const shared: AgendaRows = {
    events: shares?.events ? listEvents(supabase, householdId, { from: dayStart }) : undefined,
    meals: shares?.meals ? listMeals(supabase, householdId, { from: today }) : undefined,
    obligations: shares?.obligations && seesMoney ? (reads?.obligations ?? listObligations(supabase, householdId)) : undefined,
    schoolItems: shares?.schoolItems && seesSchool ? (reads?.schoolItems ?? listSchoolItems(supabase, householdId)) : undefined,
    consumables: shares?.consumables ? listConsumables(supabase, householdId) : undefined,
  };
  const schoolFrom = ahead.schoolFrom.getTime();
  const schoolTo = ahead.schoolTo.getTime();
  const [eventsR, mealsR, obligationsR, schoolItemsR, members, agendaR, consumablesR, recipeChoices, catalog] = await Promise.all([
    settle(
      shared.events
        ? shared.events.then((rows) => rows.filter((event) => event.startsAt.getTime() <= dayEnd.getTime()))
        : listEvents(supabase, householdId, { from: dayStart, to: dayEnd }),
      [],
    ),
    isChild
      ? ok([])
      : settle(shared.meals ? shared.meals.then((rows) => rows.filter((meal) => meal.onDate <= today)) : listMeals(supabase, householdId, { from: today, to: today }), []),
    seesMoney
      ? settle(
          shared.obligations
            ? shared.obligations.then((rows) => rows.filter((bill) => bill.dueOn !== null && bill.dueOn >= ahead.billsFrom && bill.dueOn <= ahead.billsTo))
            : listObligations(supabase, householdId, { dueFrom: ahead.billsFrom, dueTo: ahead.billsTo }),
          [],
        )
      : ok([]),
    seesSchool
      ? settle(
          shared.schoolItems
            ? shared.schoolItems.then((rows) =>
                rows.filter((item) => item.dueAt !== null && item.dueAt.getTime() >= schoolFrom && item.dueAt.getTime() <= schoolTo),
              )
            : listSchoolItems(supabase, householdId, { dueFrom: ahead.schoolFrom, dueTo: ahead.schoolTo }),
          [],
        )
      : ok([]),
    listMembers(supabase, householdId, membership.household.ownerMemberId).catch(() => []),
    withAgenda ? settle(householdAgenda(supabase, householdId, view, shared), null) : ok(null),
    isChild ? ok([]) : settle(shared.consumables ?? listConsumables(supabase, householdId), []),
    // What a meal here can change to, or a new one be planned from (the owner, 2026-10-20).
    isChild ? Promise.resolve([]) : listRecipeChoices(supabase, householdId).catch(() => []),
    isChild ? Promise.resolve([]) : listCatalogRecipes(supabase, publicEnv().NEXT_PUBLIC_SUPABASE_URL).catch(() => []),
  ]);
  const mealLabels = isChild ? null : mealFormLabels(t, groceryWords(t, locale.preferences.language).unitNames);
  const memberOptions = members.map((member) => ({ id: member.id, displayName: member.displayName }));
  const recipeOptions = recipeChoices.map((recipe) => ({ id: recipe.id, name: recipe.name }));

  const { data: events } = eventsR;
  const { data: meals } = mealsR;
  const { data: obligations } = obligationsR;
  const { data: schoolItems } = schoolItemsR;
  const { data: agenda } = agendaR;
  // Missing data reads as "a quiet day" unless flagged separately — this is
  // the one thing that must never be silently indistinguishable from that.
  const someDataMissing = [eventsR, mealsR, obligationsR, schoolItemsR, agendaR].some((result) => result.failed);

  const nameOf = (memberId: string | null) => members.find((member) => member.id === memberId)?.displayName ?? null;
  const items: (TimelineItem & { at: Date; mine: boolean; family: boolean; household: boolean })[] = [];

  for (const event of events) {
    if (event.status === "cancelled") continue;
    const participates = event.ownerMemberId === membership.memberId || event.participants.some((p) => p.memberId === membership.memberId);
    items.push({
      key: `event.${event.id}`,
      at: event.startsAt,
      time: formatTime(timezone, event.startsAt),
      title: event.title,
      meta: `${formatTime(timezone, event.startsAt)} – ${formatTime(timezone, event.endsAt)}${nameOf(event.ownerMemberId) ? ` · ${nameOf(event.ownerMemberId)}` : ""}`,
      icon: CalendarHeart,
      tone: "people",
      state: stateFor(event.startsAt, event.endsAt, now, event.status === "happened", event.actionState),
      mine: participates || event.participants.length === 0,
      family: true,
      household: false,
      action: event.actionState && event.actionState !== "ready" ? <PillLink href={`/calendar/events/${event.id}`}>{t("today.action.reply")}</PillLink> : undefined,
      href: `/calendar/events/${event.id}`,
    });
  }

  for (const meal of meals) {
    if (meal.status === "skipped") continue;
    items.push({
      key: `meal.${meal.id}`,
      at: meal.readyBy,
      time: formatTime(timezone, meal.readyBy),
      title: `${slotLabel(meal.slot, t)} — ${meal.name}`,
      meta: meal.cookMemberId
        ? nameOf(meal.cookMemberId)
          ? t("today.meal.cooking", { name: nameOf(meal.cookMemberId)! })
          : t("today.meal.someoneCooking")
        : t("today.meal.nobodyAssigned"),
      icon: Utensils,
      tone: "meals",
      state: meal.status === "eaten" || meal.status === "ready" ? "done" : meal.status === "at_risk" ? "needs_you" : stateFor(meal.readyBy, meal.readyBy, now, false, null),
      mine: meal.cookMemberId === membership.memberId || meal.cookMemberId === null,
      family: true,
      household: true,
      // The meal changes in place, to another dish or another time; the card opens Meals.
      action: mealLabels ? (
        <ChangeMealButton
          compact
          householdId={householdId}
          meal={{
            id: meal.id,
            name: meal.name,
            slot: meal.slot,
            onDate: meal.onDate,
            readyByTime: new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(meal.readyBy),
            cookMemberId: meal.cookMemberId,
            recipeId: meal.recipe?.id ?? null,
          }}
          members={memberOptions}
          recipes={recipeOptions}
          labels={mealLabels}
        />
      ) : undefined,
      href: "/meals",
    });
  }

  for (const obligation of obligations) {
    if (obligation.dueOn !== today || obligation.status === "paid" || obligation.status === "cancelled") continue;
    const at = new Date(dayEnd);
    items.push({
      key: `bill.${obligation.id}`,
      at,
      time: t("today.today"),
      title: t("today.bill.due", { name: obligation.name }),
      meta: obligation.amountMinor !== null && obligation.currency ? formatMoney(obligation.amountMinor, obligation.currency) : t("today.bill.amountPending"),
      icon: Wallet,
      tone: "money",
      state: obligation.status === "scheduled" ? "done" : "needs_you",
      mine: obligation.responsibleMemberId === membership.memberId || obligation.responsibleMemberId === null,
      family: false,
      household: true,
      action: obligation.status === "scheduled" ? undefined : <PillLink href="/bills" tone="primary">{t("today.action.pay")}</PillLink>,
      href: "/bills",
    });
  }

  const todayLocal = isoDateIn(now, timezone);
  for (const item of schoolItems) {
    // The household's own day (14-014): a timed item by its local date, an
    // all-day one by the day it names — never a time nobody gave.
    if (!item.dueAt || schoolDateValue(item, timezone) !== todayLocal) continue;
    if (item.status === "done" || item.status === "submitted" || item.status === "cancelled") continue;
    items.push({
      key: `school.${item.id}`,
      at: item.dueTimeKnown ? item.dueAt : new Date(dayEnd),
      time: schoolTimeWords(item, timezone) ?? t("today.today"),
      title: item.title,
      meta: `${nameOf(item.childMemberId) ?? t("today.school")}${item.subject ? ` · ${item.subject}` : ""}`,
      icon: GraduationCap,
      tone: "school",
      state: "needs_you",
      mine: item.childMemberId === membership.memberId || !isChild,
      family: true,
      household: false,
      action: <PillLink href="/school">{t("today.action.review")}</PillLink>,
      href: "/school",
    });
  }

  items.sort((a, b) => a.at.getTime() - b.at.getTime());
  const shown = items.filter((item) => (active === "mine" ? item.mine : active === "family" ? item.family : item.household));
  const householdNeeds = active === "household" && agenda ? agenda.needsYou : [];
  // Looking ahead (story 14-008): the next two weeks, predicted only from
  // what this viewer may already see — never a child's view, never a bill
  // for someone without finance access.
  const predictions =
    active === "household" && !isChild
      ? predictHousehold({
          consumables: consumablesR.data,
          obligations,
          schoolItems,
          childName: (id) => nameOf(id) ?? "your child",
          now,
        })
      : [];

  return (
    <>
      {someDataMissing ? (
        <Card className="flex items-center gap-3 bg-[var(--wh-attention-soft)]/60 p-3">
          <AlertTriangle aria-hidden className="size-5 shrink-0 text-[var(--wh-attention)]" />
          <p className="text-sm text-[var(--wh-foreground-muted)]">
            {t("today.partMissing")}
          </p>
        </Card>
      ) : null}

      {shown.length === 0 ? (
        <EmptyState
          icon={Clock3}
          title={t(someDataMissing ? "today.empty.unconfirmed" : active === "mine" ? "today.empty.mine" : active === "family" ? "today.empty.family" : "today.empty.household")}
          description={t(someDataMissing ? "today.empty.unconfirmedLede" : "today.empty.lede")}
        />
      ) : (
        <Timeline items={shown} />
      )}

      {mealLabels && active !== "family" ? (
        // A new meal for today, from here (the owner, 2026-10-20: "add option to add new meal").
        <div className="flex justify-end">
          <PlanMealButton
            householdId={householdId}
            members={memberOptions}
            recipes={recipeChoices}
            dishes={pickerDishes(recipeChoices, catalog)}
            pickerLabels={recipePickerLabels(t)}
            labels={mealLabels}
            onDate={isoDateIn(now, timezone)}
          />
        </div>
      ) : null}

      {householdNeeds.length > 0 ? (
        <section>
          <SectionHeader title={t("today.needsPerson")} count={householdNeeds.length} />
          <Card className="p-2">
            <ul className="divide-y divide-[var(--wh-border)]">
              {householdNeeds.slice(0, 6).map((item) => (
                <AgendaRow key={item.subjectKey} item={item} />
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      {predictions.length > 0 ? (
        <section>
          <SectionHeader title={t("today.lookingAhead")} />
          <Card className="p-2">
            <ul className="divide-y divide-[var(--wh-border)]">
              {predictions.map((prediction) => (
                <ActionRow
                  key={prediction.key}
                  icon={prediction.domain === "groceries" ? ShoppingBasket : prediction.domain === "bills" ? Wallet : GraduationCap}
                  tone={prediction.domain === "groceries" ? "meals" : prediction.domain === "bills" ? "money" : "school"}
                  title={prediction.title}
                  meta={`${prediction.reason} ${describePredictionBasis(prediction.basis)}.`}
                  action={
                    <PillLink href={prediction.href} tone="soft">
                      {t(prediction.domain === "groceries" ? "today.domain.groceries" : prediction.domain === "bills" ? "today.domain.bills" : "today.domain.school")}
                    </PillLink>
                  }
                />
              ))}
            </ul>
          </Card>
        </section>
      ) : null}
    </>
  );
}

async function settle<T>(promise: Promise<T>, fallback: T): Promise<{ data: T; failed: boolean }> {
  try {
    return { data: await promise, failed: false };
  } catch {
    return { data: fallback, failed: true };
  }
}

async function ok<T>(data: T): Promise<{ data: T; failed: boolean }> {
  return { data, failed: false };
}

function stateFor(start: Date, end: Date, now: Date, happened: boolean, actionState: string | null): TimelineItem["state"] {
  if (happened || end < now) return "done";
  if (actionState && actionState !== "ready") return "needs_you";
  if (start <= now && end >= now) return "now";
  return "upcoming";
}

const SLOTS = ["breakfast", "lunch", "snack", "dinner"] as const;

function slotLabel(slot: string, t: Translate): string {
  const known = SLOTS.find((name) => name === slot);
  return known ? t(`reminder.meal.slot.${known}`) : slot.charAt(0).toUpperCase() + slot.slice(1);
}
