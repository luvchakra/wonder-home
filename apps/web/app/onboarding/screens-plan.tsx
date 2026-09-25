import {
  Backpack,
  Check,
  ChevronRight,
  GraduationCap,
  HandHelping,
  Home,
  PawPrint,
  Send,
  ShoppingBasket,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import {
  completionChecklist,
  onboardingSummary,
  responsibilityCategory,
  SUGGESTION_CATEGORIES,
  type GuidedQuestion,
  type NextAction,
  type OnboardingSummary,
  type ReadinessArea,
  type ReadinessRow,
  type ReadinessState,
  type SuggestedResponsibility,
  type SuggestionCategory,
} from "@wonderhome/core/household/onboarding";
import type { OnboardingSnapshot } from "@wonderhome/core/household/onboarding-repository";
import { AiOrb } from "@wonderhome/core/ui/ai-message";
import { Card } from "@wonderhome/core/ui/card";
import { Field } from "@wonderhome/core/ui/field";
import { HomeIllustration } from "@wonderhome/core/ui/home-illustration";
import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";
import { Badge, type BadgeTone } from "@wonderhome/core/ui/pill";
import { ProgressRing } from "@wonderhome/core/ui/progress-ring";

import {
  acceptCategoryAction,
  addResponsibilityAction,
  answerHelperHoursAction,
  answerSchoolAction,
  completeAction,
  moveAction,
  reviewCategoryAction,
} from "../(auth)/onboarding-actions";
import { SubmitButton, SubmitPill } from "../_components/submit-pill";
import { LaterButton, OnboardingFrame, setupChrome, type SetupWords } from "./frame";
import { OnboardingForm } from "./onboarding-form";
import { HelperHours } from "./screens-people";

/** Each category's tile; its name and subtitle are `setupWizard.category.<key>` in the reader's language. */
const CATEGORY_LOOK: Record<SuggestionCategory, { icon: LucideIcon; tone: IconTone }> = {
  home: { icon: Home, tone: "home" },
  kids: { icon: Backpack, tone: "school" },
  groceries: { icon: ShoppingBasket, tone: "meals" },
  finance: { icon: Wallet, tone: "money" },
  pets: { icon: PawPrint, tone: "handled" },
  help: { icon: HandHelping, tone: "people" },
};

const AREA_LOOK: Record<ReadinessArea, { icon: LucideIcon; tone: IconTone; href: string }> = {
  family: { icon: Users, tone: "people", href: "/onboarding?step=adults" },
  home: { icon: Home, tone: "home", href: "/onboarding?step=review&category=home" },
  groceries: { icon: ShoppingBasket, tone: "meals", href: "/onboarding?step=review&category=groceries" },
  kids: { icon: Backpack, tone: "school", href: "/onboarding?step=review&category=kids" },
  school: { icon: GraduationCap, tone: "school", href: "/onboarding?step=guided" },
  finance: { icon: Wallet, tone: "money", href: "/onboarding?step=review&category=finance" },
  pets: { icon: PawPrint, tone: "handled", href: "/onboarding?step=pets" },
  help: { icon: HandHelping, tone: "people", href: "/onboarding?step=pets" },
};

const STATE_TONE: Record<ReadinessState, BadgeTone> = {
  ready: "handled",
  needs_review: "attention",
  needs_info: "attention",
  not_configured: "neutral",
};

function nameOf(snapshot: OnboardingSnapshot, id: string | null): string | null {
  if (!id) return null;
  return snapshot.configMembers.find((member) => member.id === id)?.displayName ?? null;
}

/**
 * A readiness row's detail in the reader's language (story 22-004). The
 * arithmetic is onboarding's; only the words are said here. Pets and help
 * count the names on record, which the row folds into its progress.
 */
function rowDetail(row: ReadinessRow, snapshot: OnboardingSnapshot, t: SetupWords["t"]): string {
  switch (row.area) {
    case "family":
      return t("setupWizard.count.members", { count: row.done });
    case "school":
      return t("setupWizard.count.children", { count: row.total });
    case "pets":
      return t("setupWizard.count.pets", { count: snapshot.facts.profile.pets.length });
    case "help":
      return t("setupWizard.count.helpers", { count: snapshot.facts.profile.helpers.length });
    default: {
      const done = row.done;
      const open = row.total - row.done;
      if (open > 0) return done > 0 ? t("setupWizard.detail.suggestedAndSet", { open, done }) : t("setupWizard.detail.suggested", { open });
      return done > 0 ? t("setupWizard.detail.set", { done }) : t("setupWizard.detail.nothing");
    }
  }
}

/** The one thing worth doing next, said in the reader's language; the choice of it is onboarding's. */
function nextWords(next: NextAction, summary: OnboardingSummary, snapshot: OnboardingSnapshot, t: SetupWords["t"]): string {
  const children = snapshot.facts.profile.children;
  switch (next.area) {
    case "family":
      return t("setupWizard.nextStep.family");
    case "school":
      return children.length === 1 ? t("setupWizard.nextStep.schoolOne", { name: children[0]!.name }) : t("setupWizard.nextStep.schoolEach");
    case "help":
      return t("setupWizard.nextStep.help");
    case "pets":
      return next.step === "pets" ? t("setupWizard.nextStep.petNames") : t("setupWizard.nextStep.petCare");
    case "home":
    case "groceries":
    case "kids":
    case "finance": {
      const state = summary.rows.find((row) => row.area === next.area)?.state;
      return state === "needs_review" ? t(`setupWizard.nextStep.review.${next.area}`) : t(`setupWizard.nextStep.setUp.${next.area}`);
    }
  }
}

/** Guided setup's question, said in the reader's language from the same facts onboarding asked it from. */
function questionWords(question: GuidedQuestion, t: SetupWords["t"]): string {
  switch (question.id) {
    case "school":
      if (question.children.length === 1) return t("setupWizard.question.schoolOne", { name: question.children[0]!.name });
      return question.children.length === 2 ? t("setupWizard.question.schoolTwo") : t("setupWizard.question.schoolMany", { count: question.children.length });
    case "helper_hours":
      return question.helpers.length === 1 ? t("setupWizard.question.helperOne", { name: question.helpers[0]!.name }) : t("setupWizard.question.helperMany");
    case "accept_category":
      return t(`setupWizard.question.${question.category}`, { count: question.count });
  }
}

/** Who may be offered as an owner: adults always, helpers for the home, a child only for their own kind of thing. */
function ownerChoices(
  snapshot: OnboardingSnapshot,
  suggestion: Pick<SuggestedResponsibility, "adultOnly" | "category" | "primaryMemberId" | "backupMemberId">,
  t: SetupWords["t"],
) {
  const members = snapshot.configMembers.filter((member) => {
    if (member.memberType === "adult") return true;
    if (suggestion.adultOnly) return false;
    if (member.memberType === "child") return suggestion.category === "kids";
    return member.memberType === "helper";
  });
  const options: { value: string; label: string }[] = [];
  const primary = nameOf(snapshot, suggestion.primaryMemberId);
  const backup = nameOf(snapshot, suggestion.backupMemberId);
  if (primary && backup) options.push({ value: `${suggestion.primaryMemberId}:${suggestion.backupMemberId}`, label: t("setupWizard.review.withBackup", { primary, backup }) });
  for (const member of members) options.push({ value: member.id, label: member.displayName });
  options.push({ value: "", label: t("manage.resp.nobodyYet") });
  return options;
}

// ---------------------------------------------------------------------------
// 7. Suggested responsibilities
// ---------------------------------------------------------------------------

export function SuggestionsScreen({ snapshot, words }: { snapshot: OnboardingSnapshot; words: SetupWords }) {
  const { t } = words;
  const { pending, responsibilityKeys } = snapshot.facts;
  const rows = SUGGESTION_CATEGORIES.map((category) => ({
    category,
    waiting: pending.filter((entry) => entry.category === category).length,
    set: responsibilityKeys.filter((key) => responsibilityCategory(key) === category).length,
  })).filter((row) => row.waiting > 0 || row.set > 0);
  const first = rows.find((row) => row.waiting > 0)?.category;

  return (
    <OnboardingFrame
      step="suggestions"
      progress={4}
      {...setupChrome(words, 4)}
      back="/onboarding?step=adults"
      title={t("setupWizard.suggestions.title")}
      lede={t("setupWizard.suggestions.lede")}
      accent={t("setupWizard.suggestions.accent")}
    >
      {rows.length === 0 ? (
        <Card className="p-5 text-[0.9375rem] text-[var(--wh-foreground-muted)]">{t("setupWizard.suggestions.empty")}</Card>
      ) : (
        <Card className="divide-y divide-[var(--wh-border)] p-1">
          {rows.map((row) => {
            const look = CATEGORY_LOOK[row.category];
            return (
              <Link
                key={row.category}
                href={`/onboarding?step=review&category=${row.category}`}
                className="flex items-center gap-3 rounded-[var(--wh-radius-sm)] p-3 hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]"
              >
                <IconTile icon={look.icon} tone={look.tone} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{t(`setupWizard.category.${row.category}`)}</span>
                  <span className="block text-sm text-[var(--wh-foreground-muted)]">
                    {row.waiting > 0 ? t("setupWizard.suggestions.waiting", { count: row.waiting }) : ""}
                    {row.waiting > 0 && row.set > 0 ? " · " : ""}
                    {row.set > 0 ? t("setupWizard.suggestions.set", { count: row.set }) : ""}
                  </span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-[var(--wh-foreground-subtle)]" aria-hidden />
              </Link>
            );
          })}
        </Card>
      )}
      <OnboardingForm action={moveAction}>
        <input type="hidden" name="to" value={first ? "review" : "summary"} />
        {first ? <input type="hidden" name="category" value={first} /> : null}
        <SubmitButton className="w-full" pendingLabel={t("setupWizard.oneMoment")}>
          {first ? t("setupWizard.suggestions.review") : t("setupWizard.seeSummary")}
        </SubmitButton>
      </OnboardingForm>
    </OnboardingFrame>
  );
}

// ---------------------------------------------------------------------------
// 8–9. One category's responsibilities, reviewed
// ---------------------------------------------------------------------------

export function ReviewScreen({ snapshot, category, words }: { snapshot: OnboardingSnapshot; category: SuggestionCategory; words: SetupWords }) {
  const { t } = words;
  const look = CATEGORY_LOOK[category];
  const suggestions = snapshot.facts.pending.filter((entry) => entry.category === category);
  const alreadySet = snapshot.facts.responsibilityKeys.filter((key) => responsibilityCategory(key) === category).length;
  const addOwners = ownerChoices(snapshot, { adultOnly: category === "finance", category, primaryMemberId: null, backupMemberId: null }, t);

  return (
    <OnboardingFrame step="review" progress={4} {...setupChrome(words, 4)} back="/onboarding?step=suggestions" close accent={t("entry.script.lessLoad")}>
      <header className="flex items-center gap-3">
        <IconTile icon={look.icon} tone={look.tone} size="lg" />
        <div className="min-w-0">
          <h1 className="text-[length:var(--wh-text-heading)] leading-tight font-bold tracking-tight">
            {t("setupWizard.review.title", { category: t(`setupWizard.category.${category}`) })}
          </h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">{t(`setupWizard.category.${category}.subtitle`)}</p>
        </div>
      </header>

      <OnboardingForm action={reviewCategoryAction} className="space-y-4">
        <input type="hidden" name="category" value={category} />
        {suggestions.length === 0 ? (
          <Card className="p-5 text-[0.9375rem] text-[var(--wh-foreground-muted)]">
            {alreadySet > 0 ? t("setupWizard.review.emptyWithSet", { count: alreadySet }) : t("setupWizard.review.empty")}
          </Card>
        ) : (
          <Card className="divide-y divide-[var(--wh-border)] p-1">
            {suggestions.map((suggestion) => {
              const choices = ownerChoices(snapshot, suggestion, t);
              const suggested = suggestion.backupMemberId && nameOf(snapshot, suggestion.backupMemberId) ? `${suggestion.primaryMemberId}:${suggestion.backupMemberId}` : (suggestion.primaryMemberId ?? "");
              return (
                <div key={suggestion.key} className="space-y-2.5 p-3">
                  <input type="hidden" name={`seen_${suggestion.key}`} value="1" />
                  <div className="flex items-start gap-3">
                    <IconTile icon={look.icon} tone={look.tone} size="sm" className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{suggestion.title}</p>
                      <p className="text-sm text-[var(--wh-foreground-muted)]">
                        {suggestion.frequency} · {suggestion.rationale}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pl-11">
                    <label className="sr-only" htmlFor={`owner_${suggestion.key}`}>
                      {t("setupWizard.review.whoFor", { title: suggestion.title })}
                    </label>
                    <select
                      id={`owner_${suggestion.key}`}
                      name={`owner_${suggestion.key}`}
                      defaultValue={suggested}
                      className="block min-h-10 min-w-0 flex-1 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--wh-primary)]"
                    >
                      {choices.map((choice) => (
                        <option key={choice.value || "none"} value={choice.value}>
                          {choice.label}
                        </option>
                      ))}
                    </select>
                    <label className="relative shrink-0 cursor-pointer">
                      <input type="checkbox" name={`keep_${suggestion.key}`} defaultChecked className="peer absolute inset-0 size-full cursor-pointer opacity-0" aria-label={t("setupWizard.review.keepLabel", { title: suggestion.title })} />
                      <span className="inline-flex min-h-10 items-center gap-1 rounded-[var(--wh-radius-pill)] border border-[var(--wh-border)] px-3 text-xs font-semibold text-[var(--wh-foreground-muted)] peer-checked:border-[var(--wh-primary)] peer-checked:bg-[var(--wh-primary-soft)] peer-checked:text-[var(--wh-primary)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--wh-primary)]">
                        <Check className="size-3.5" aria-hidden />
                        {t("setupWizard.review.keep")}
                      </span>
                    </label>
                  </div>
                </div>
              );
            })}
          </Card>
        )}
        {suggestions.length > 0 ? <p className="text-xs text-[var(--wh-foreground-subtle)]">{t("setupWizard.review.keepHint")}</p> : null}
        <SubmitButton className="w-full" pendingLabel={t("common.saving")}>
          {t("setupWizard.review.saveContinue")}
        </SubmitButton>
      </OnboardingForm>

      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">{t("setupWizard.review.addOwn")}</h2>
        <OnboardingForm action={addResponsibilityAction} className="space-y-3">
          <input type="hidden" name="category" value={category} />
          <Field label={t("setupWizard.review.whatField")} name="title" placeholder={t("setupWizard.review.whatPlaceholder")} autoComplete="off" required />
          <div className="space-y-1.5">
            <label htmlFor="new-owner" className="block text-sm font-medium">
              {t("setupWizard.review.whoField")}
            </label>
            <select id="new-owner" name="owner" defaultValue="" className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base">
              {addOwners.map((choice) => (
                <option key={choice.value || "none"} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
          </div>
          <SubmitPill tone="soft" pendingLabel={t("common.adding")} className="min-h-11 w-full text-sm">
            {t("setupWizard.review.add")}
          </SubmitPill>
        </OnboardingForm>
      </Card>
    </OnboardingFrame>
  );
}

// ---------------------------------------------------------------------------
// 10. Setup summary
// ---------------------------------------------------------------------------

export function SummaryScreen({ snapshot, hasQuestions, words }: { snapshot: OnboardingSnapshot; hasQuestions: boolean; words: SetupWords }) {
  const { t } = words;
  const summary = onboardingSummary(snapshot.facts);
  return (
    <OnboardingFrame
      step="summary"
      {...setupChrome(words)}
      back="/onboarding?step=suggestions"
      title={t("setupWizard.summary.title")}
      lede={t("setupWizard.summary.lede")}
      accent={t("entry.script.together")}
    >
      <Card className="flex items-center gap-4 p-4">
        <ProgressRing value={summary.percent} label={t("setupWizard.summary.ringLabel")} size={96} />
        <div className="min-w-0">
          <p className="font-semibold">{t("setupWizard.summary.percent", { percent: summary.percent })}</p>
          <p className="text-sm text-[var(--wh-foreground-muted)]">{t("setupWizard.summary.counted")}</p>
        </div>
      </Card>

      <Card className="divide-y divide-[var(--wh-border)] p-1">
        {summary.rows.map((row) => {
          const look = AREA_LOOK[row.area];
          const body = (
            <>
              <IconTile icon={look.icon} tone={look.tone} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{t(`setupWizard.area.${row.area}`)}</span>
                <span className="block text-sm text-[var(--wh-foreground-muted)]">{rowDetail(row, snapshot, t)}</span>
              </span>
              <Badge tone={STATE_TONE[row.state]}>{t(`setupWizard.readiness.${row.state}`)}</Badge>
            </>
          );
          // A ready row has nothing to do, and says so by having no way in.
          return row.state === "ready" ? (
            <div key={row.area} className="flex items-center gap-3 p-3">
              {body}
            </div>
          ) : (
            <Link key={row.area} href={look.href} className="flex items-center gap-3 rounded-[var(--wh-radius-sm)] p-3 hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]">
              {body}
              <ChevronRight className="size-4 shrink-0 text-[var(--wh-foreground-subtle)]" aria-hidden />
            </Link>
          );
        })}
      </Card>

      {hasQuestions ? (
        <OnboardingForm action={moveAction}>
          <input type="hidden" name="to" value="guided" />
          <button type="submit" className="flex w-full items-center gap-3 rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-4 text-left shadow-[var(--wh-shadow-card)] hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]">
            <AiOrb size={36} />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{t("setupWizard.summary.askRest")}</span>
              <span className="block text-sm text-[var(--wh-foreground-muted)]">
                {summary.next ? t("setupWizard.summary.next", { label: nextWords(summary.next, summary, snapshot, t) }) : t("setupWizard.summary.oneAtATime")}
              </span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-[var(--wh-foreground-subtle)]" aria-hidden />
          </button>
        </OnboardingForm>
      ) : null}

      <OnboardingForm action={moveAction}>
        <input type="hidden" name="to" value="done" />
        <SubmitButton className="w-full" pendingLabel={t("setupWizard.oneMoment")}>
          {t("setupWizard.summary.start")}
        </SubmitButton>
      </OnboardingForm>
      <LaterButton step="summary" label={t("setupWizard.summary.later")} />
    </OnboardingFrame>
  );
}

// ---------------------------------------------------------------------------
// 11. Guided setup: one question at a time
// ---------------------------------------------------------------------------

export function GuidedScreen({
  snapshot,
  question,
  skipped,
  skipToken,
  words,
}: {
  snapshot: OnboardingSnapshot;
  question: GuidedQuestion | null;
  skipped: string[];
  skipToken: string | null;
  words: SetupWords;
}) {
  const { t } = words;
  const laterHref = `/onboarding?${new URLSearchParams({ step: "guided", skip: [...skipped, skipToken ?? ""].filter(Boolean).join(",") }).toString()}`;
  return (
    <OnboardingFrame step="guided" {...setupChrome(words)} back="/onboarding?step=summary" accent={t("entry.script.lessLoad")}>
      <header className="flex items-center gap-3">
        <AiOrb size={44} />
        <div>
          <h1 className="text-lg font-bold tracking-tight">WonderHome</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">{t("setupWizard.guided.subtitle")}</p>
        </div>
      </header>

      {question ? (
        <>
          <p className="max-w-[34rem] rounded-[var(--wh-radius-lg)] rounded-tl-[var(--wh-radius-xs)] bg-[var(--wh-surface)] p-4 text-[0.9375rem] shadow-[var(--wh-shadow-card)]">{questionWords(question, t)}</p>
          {question.id === "school" ? (
            <OnboardingForm action={answerSchoolAction} className="space-y-3">
              <Card className="space-y-4 p-4">
                {question.children.map((child) => (
                  <Field
                    key={child.id}
                    label={t("setupWizard.guided.schoolOf", { name: child.name })}
                    name={`school_${child.id}`}
                    autoComplete="off"
                    placeholder={t("setupWizard.guided.schoolPlaceholder")}
                  />
                ))}
              </Card>
              <div className="flex flex-wrap justify-end gap-2">
                <Link href={laterHref} className="inline-flex min-h-11 items-center rounded-[var(--wh-radius-pill)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-4 text-sm font-semibold text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)]">
                  {t("setupWizard.guided.maybeLater")}
                </Link>
                <SubmitPill tone="primary" pendingLabel={t("common.saving")} className="min-h-11 px-5 text-sm">
                  {t("common.save")}
                </SubmitPill>
              </div>
            </OnboardingForm>
          ) : question.id === "helper_hours" ? (
            <OnboardingForm action={answerHelperHoursAction} className="space-y-3">
              {question.helpers.map((helper) => (
                <Card key={helper.id} className="space-y-3 p-4">
                  <p className="font-semibold">{helper.name}</p>
                  <HelperHours prefix={`helper_${helper.id}_`} windows={snapshot.availability.get(helper.id) ?? []} words={words} />
                </Card>
              ))}
              <div className="flex flex-wrap justify-end gap-2">
                <Link href={laterHref} className="inline-flex min-h-11 items-center rounded-[var(--wh-radius-pill)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-4 text-sm font-semibold text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)]">
                  {t("setupWizard.guided.maybeLater")}
                </Link>
                <SubmitPill tone="primary" pendingLabel={t("common.saving")} className="min-h-11 px-5 text-sm">
                  {t("common.save")}
                </SubmitPill>
              </div>
            </OnboardingForm>
          ) : (
            <OnboardingForm action={acceptCategoryAction} className="space-y-3">
              <input type="hidden" name="category" value={question.category} />
              <Card className="p-4">
                <ul className="space-y-1.5 text-sm">
                  {snapshot.facts.pending
                    .filter((entry) => entry.category === question.category)
                    .map((entry) => (
                      <li key={entry.key} className="flex gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-[var(--wh-handled)]" aria-hidden />
                        <span>
                          {entry.title}
                          {nameOf(snapshot, entry.primaryMemberId) ? <span className="text-[var(--wh-foreground-muted)]"> — {nameOf(snapshot, entry.primaryMemberId)}</span> : null}
                        </span>
                      </li>
                    ))}
                </ul>
              </Card>
              <div className="flex flex-wrap justify-end gap-2">
                <Link href={laterHref} className="inline-flex min-h-11 items-center rounded-[var(--wh-radius-pill)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-4 text-sm font-semibold text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)]">
                  {t("setupWizard.guided.maybeLater")}
                </Link>
                <SubmitPill tone="primary" pendingLabel={t("setupWizard.guided.settingUp")} className="min-h-11 px-5 text-sm">
                  {t("setupWizard.guided.yes")}
                </SubmitPill>
              </div>
            </OnboardingForm>
          )}
        </>
      ) : (
        <Card className="space-y-3 p-4">
          <p className="text-[0.9375rem]">{t("setupWizard.guided.allAsked")}</p>
          <Link href="/onboarding?step=summary" className="inline-flex min-h-11 items-center font-semibold text-[var(--wh-primary)] underline-offset-2 hover:underline">
            {t("setupWizard.seeSummary")}
          </Link>
        </Card>
      )}

      {/* The same one door as everywhere else (rule 13): anything else about
          the family goes to HomeTalk, which reads and writes through the
          same governed engine. */}
      <form action="/ai" method="get" className="flex items-center gap-2 rounded-[var(--wh-radius-pill)] border border-[var(--wh-border)] bg-[var(--wh-surface)] py-1.5 pr-1.5 pl-4 shadow-[var(--wh-shadow-card)]">
        <label htmlFor="guided-q" className="sr-only">
          {t("setupWizard.guided.tellLabel")}
        </label>
        <input id="guided-q" name="q" maxLength={500} placeholder={t("setupWizard.guided.tellPlaceholder")} className="min-h-10 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[var(--wh-foreground-subtle)]" />
        <button type="submit" aria-label={t("setupWizard.guided.send")} className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--wh-primary)] text-[var(--wh-primary-foreground)] hover:bg-[var(--wh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]">
          <Send className="size-4" aria-hidden />
        </button>
      </form>
    </OnboardingFrame>
  );
}

// ---------------------------------------------------------------------------
// 12. Your home is ready
// ---------------------------------------------------------------------------

export function DoneScreen({ snapshot, words }: { snapshot: OnboardingSnapshot; words: SetupWords }) {
  const { t } = words;
  const summary = onboardingSummary(snapshot.facts);
  const checklist = completionChecklist(summary);
  const allDone = checklist.every((item) => item.done);
  return (
    <OnboardingFrame step="done" {...setupChrome(words)} accent={t("entry.script.lessLoad")}>
      <div className="relative overflow-hidden rounded-[var(--wh-radius-lg)] p-6 pb-0 text-center" style={{ background: "var(--wh-gradient-hero)" }}>
        <h1 className="text-[length:var(--wh-text-title)] leading-tight font-bold tracking-tight">{allDone ? t("setupWizard.done.readyTitle") : t("setupWizard.done.startTitle")}</h1>
        <p className="mt-2 text-sm text-[var(--wh-foreground-muted)]">
          {allDone ? t("setupWizard.done.readyLede") : t("setupWizard.done.startLede")}
        </p>
        <HomeIllustration className="mx-auto mt-4 block h-auto w-full max-w-sm" />
      </div>
      <Card className="space-y-3 p-4">
        {checklist.map((item) => (
          <p key={item.key} className="flex items-center gap-3 text-[0.9375rem]">
            {item.done ? (
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--wh-handled)] text-white">
                <Check className="size-4" aria-hidden />
              </span>
            ) : (
              <span className="size-6 shrink-0 rounded-full border-2 border-[var(--wh-border-strong)]" aria-hidden />
            )}
            <span className="flex-1">{t(`setupWizard.checklist.${item.key}`)}</span>
            {item.done ? <span className="sr-only">{t("setupWizard.done.done")}</span> : <span className="text-xs text-[var(--wh-foreground-subtle)]">{t("setupWizard.done.notYet")}</span>}
          </p>
        ))}
      </Card>
      <OnboardingForm action={completeAction}>
        <SubmitButton className="w-full" pendingLabel={t("setupWizard.done.opening")}>
          {t("setupWizard.done.go")}
        </SubmitButton>
      </OnboardingForm>
      {allDone ? null : <LaterButton step="summary" label={t("setupWizard.done.later")} />}
    </OnboardingFrame>
  );
}
