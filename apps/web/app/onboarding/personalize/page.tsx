import { CalendarClock, ChevronRight, Languages, MapPin, Settings2 } from "lucide-react";
import Link from "next/link";

import { formatterFor } from "@wonderhome/core/i18n/format";
import { describeTimezone, languageInfo } from "@wonderhome/core/i18n/locales";
import { currencyLabel, regionName } from "@wonderhome/core/i18n/options";
import { LOCALE_SETUP_STEPS, localeSetupSteps, type LocaleSetupStep } from "@wonderhome/core/i18n/preferences";
import type { Translate } from "@wonderhome/core/i18n/translate";
import { isHouseholdAdmin } from "@wonderhome/core/identity/households";
import { Card } from "@wonderhome/core/ui/card";
import { CozyCornerIllustration } from "@wonderhome/core/ui/cozy-corner-illustration";
import { IconTile } from "@wonderhome/core/ui/icon-tile";

import { localeSetupAction } from "../../(auth)/locale-actions";
import { SubmitButton } from "../../_components/submit-pill";
import { LocaleForm } from "../../_components/locale-form";
import { CurrencyPicker, DateTimeUnitsFields, LanguagePicker, RegionPicker } from "../../_components/locale-pickers";
import { requireSession } from "../../_lib/session";
import { OnboardingFrame } from "../frame";

export const metadata = { title: "How WonderHome speaks to you" };
export const dynamic = "force-dynamic";

/**
 * "How would you like WonderHome to speak to you?" (story 22-003) — the
 * optional, resumable personalization that follows family setup. It adds
 * nothing to family setup and asks each person only what is theirs to
 * decide: everyone chooses their language and formats; only an Admin is
 * asked the household's region, currency and time zone. "Later" is kept,
 * and Settings has every one of these for good.
 */
export default async function PersonalizePage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const [params, session] = await Promise.all([searchParams, requireSession("/onboarding/personalize")]);
  const { membership, locale } = session;
  const { t, preferences } = locale;
  const admin = isHouseholdAdmin(membership);
  const steps = localeSetupSteps(admin);
  const requested = (LOCALE_SETUP_STEPS as readonly string[]).includes(params.step ?? "") ? (params.step as LocaleSetupStep) : null;
  const saved = membership.locale?.setup.step ?? null;
  const step: LocaleSetupStep = requested && steps.includes(requested) ? requested : saved && steps.includes(saved) ? saved : "intro";
  const index = steps.indexOf(step);
  const previous = index > 0 ? steps[index - 1] : null;

  const frame = {
    step: "welcome" as const,
    progress: index + 1,
    total: steps.length,
    stepLabel: t("l10n.step", { current: index + 1, total: steps.length }),
    back: previous ? `/onboarding/personalize?step=${previous}` : null,
    backLabel: t("common.back"),
    accent: "Less mental load. More family time.",
  };

  const actions = (primary: string) => (
    <div className="space-y-2 pt-2">
      <SubmitButton name="intent" value="next" className="w-full" pendingLabel={t("common.saving")}>
        {primary}
      </SubmitButton>
      <button
        type="submit"
        name="intent"
        value="later"
        className="mx-auto block min-h-11 px-4 text-sm font-semibold text-[var(--wh-primary)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]"
      >
        {step === "review" ? t("common.setLater") : t("common.later")}
      </button>
    </div>
  );

  if (step === "intro") {
    const points = [
      { icon: MapPin, tone: "primary" as const, text: t("l10n.intro.point.location") },
      { icon: CalendarClock, tone: "school" as const, text: t("l10n.intro.point.formats") },
      { icon: Settings2, tone: "handled" as const, text: t("l10n.intro.point.change") },
    ];
    return (
      <OnboardingFrame {...frame} title={t("l10n.intro.title")} lede={t("l10n.intro.lede")}>
        <div className="overflow-hidden rounded-[var(--wh-radius-lg)]" style={{ background: "var(--wh-gradient-hero)" }}>
          <CozyCornerIllustration className="mx-auto block h-auto w-full max-w-md" />
        </div>
        <Card className="space-y-3 p-4">
          {points.map((point) => (
            <div key={point.text} className="flex items-center gap-3">
              <IconTile icon={point.icon} tone={point.tone} size="sm" />
              <p className="text-[0.9375rem]">{point.text}</p>
            </div>
          ))}
        </Card>
        <LocaleForm action={localeSetupAction}>
          <input type="hidden" name="step" value="intro" />
          {actions(t("l10n.intro.start"))}
        </LocaleForm>
      </OnboardingFrame>
    );
  }

  if (step === "language") {
    return (
      <OnboardingFrame {...frame} title={t("l10n.language.title")} lede={t("l10n.language.lede")}>
        <LocaleForm action={localeSetupAction} className="space-y-4">
          <input type="hidden" name="step" value="language" />
          <LanguagePicker t={t} value={preferences.language} />
          {preferences.language !== "en" ? <p className="text-xs text-[var(--wh-foreground-subtle)]">{t("l10n.language.coverage")}</p> : null}
          {actions(t("common.next"))}
        </LocaleForm>
      </OnboardingFrame>
    );
  }

  if (step === "region") {
    return (
      <OnboardingFrame {...frame} title={t("l10n.region.title")} lede={t("l10n.region.lede")}>
        <LocaleForm action={localeSetupAction} className="space-y-4">
          <input type="hidden" name="step" value="region" />
          <RegionPicker t={t} language={preferences.language} value={preferences.region} />
          {actions(t("common.next"))}
        </LocaleForm>
      </OnboardingFrame>
    );
  }

  if (step === "currency") {
    return (
      <OnboardingFrame {...frame} title={t("l10n.currency.title")} lede={t("l10n.currency.lede")}>
        <LocaleForm action={localeSetupAction} className="space-y-4">
          <input type="hidden" name="step" value="currency" />
          <CurrencyPicker t={t} language={preferences.language} value={preferences.currency} />
          <p className="text-xs text-[var(--wh-foreground-subtle)]">{t("l10n.currency.history")}</p>
          {actions(t("common.next"))}
        </LocaleForm>
      </OnboardingFrame>
    );
  }

  if (step === "datetime") {
    return (
      <OnboardingFrame {...frame} title={t("l10n.datetime.title")} lede={t("l10n.datetime.lede")}>
        <LocaleForm action={localeSetupAction} className="space-y-4">
          <input type="hidden" name="step" value="datetime" />
          <DateTimeUnitsFields t={t} preferences={preferences} admin={admin} />
          {actions(t("common.next"))}
        </LocaleForm>
      </OnboardingFrame>
    );
  }

  // Review: everything in one place, each row a way back to change it.
  return (
    <OnboardingFrame {...frame} title={t("l10n.review.title")} lede={t("l10n.review.lede")}>
      <ReviewRows t={t} preferences={preferences} admin={admin} />
      {admin ? (
        <Link
          href="/settings/language-region/members"
          className="flex min-h-14 items-center gap-3 rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-4 py-3 shadow-[var(--wh-shadow-card)] hover:bg-[var(--wh-surface-muted)]"
        >
          <IconTile icon={Languages} tone="people" size="sm" />
          <span className="min-w-0 flex-1 font-medium">{t("settings.memberLanguages")}</span>
          <ChevronRight aria-hidden className="size-4 shrink-0 text-[var(--wh-foreground-subtle)] rtl:rotate-180" />
        </Link>
      ) : null}
      <LocaleForm action={localeSetupAction}>
        <input type="hidden" name="step" value="review" />
        {actions(t("l10n.review.confirm"))}
      </LocaleForm>
    </OnboardingFrame>
  );
}

function ReviewRows({ t, preferences, admin }: { t: Translate; preferences: Parameters<typeof formatterFor>[0]; admin: boolean }) {
  const format = formatterFor(preferences);
  const rows: { label: string; value: string; step: LocaleSetupStep | null }[] = [
    { label: t("field.language"), value: languageInfo(preferences.language).nativeName, step: "language" },
    { label: t("field.region"), value: regionName(preferences.region, preferences.language), step: admin ? "region" : null },
    { label: t("field.currency"), value: currencyLabel(preferences.currency, preferences.language), step: admin ? "currency" : null },
    { label: t("field.timezone"), value: describeTimezone(preferences.timezone), step: admin ? "datetime" : null },
    { label: t("field.dateFormat"), value: format.numericDate(new Date()), step: "datetime" },
    { label: t("field.timeFormat"), value: preferences.timeFormat === "12h" ? t("time.12h") : t("time.24h"), step: "datetime" },
    { label: t("field.units"), value: preferences.measurement === "metric" ? t("units.metric") : t("units.imperial"), step: "datetime" },
  ];
  return (
    <Card className="divide-y divide-[var(--wh-border)] p-1">
      {rows.map((row) => {
        const body = (
          <>
            <span className="min-w-0 flex-1 text-sm text-[var(--wh-foreground-muted)]">{row.label}</span>
            <span className="text-end text-sm font-medium">{row.value}</span>
          </>
        );
        return row.step ? (
          <Link key={row.label} href={`/onboarding/personalize?step=${row.step}`} className="flex min-h-12 items-center gap-3 rounded-[var(--wh-radius-sm)] px-3 py-2 hover:bg-[var(--wh-surface-muted)]">
            {body}
            <ChevronRight aria-hidden className="size-4 shrink-0 text-[var(--wh-foreground-subtle)] rtl:rotate-180" />
          </Link>
        ) : (
          <div key={row.label} className="flex min-h-12 items-center gap-3 px-3 py-2">
            {body}
            <span className="size-4 shrink-0" />
          </div>
        );
      })}
    </Card>
  );
}
