import { notFound } from "next/navigation";

import { languageInfo, LANGUAGES } from "@wonderhome/core/i18n/locales";
import { currencyLabel, regionName } from "@wonderhome/core/i18n/options";
import { isHouseholdAdmin, listMembers } from "@wonderhome/core/identity/households";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Alert } from "@wonderhome/core/ui/alert";
import { Avatar } from "@wonderhome/core/ui/avatar";
import { Card } from "@wonderhome/core/ui/card";

import {
  saveDateTimeAction,
  saveHouseholdLocaleAction,
  saveMemberLanguagesAction,
  savePersonalLocaleAction,
} from "../../../(auth)/locale-actions";
import { LocaleForm } from "../../../_components/locale-form";
import { CurrencyPicker, DateTimeUnitsFields, LanguagePicker, RegionPicker } from "../../../_components/locale-pickers";
import { SubmitButton } from "../../../_components/submit-pill";
import { requireSession } from "../../../_lib/session";

export const dynamic = "force-dynamic";

const FIELDS = ["language", "region", "currency", "datetime", "members"] as const;
type FieldKey = (typeof FIELDS)[number];

const BACK = "/settings/language-region";

/**
 * One preference at a time (story 22-002), with the same pickers the setup
 * uses. The household's own settings — region, currency, time zone — are an
 * Admin's to change; anyone else sees them as they are and who decides them.
 */
export default async function LanguageRegionFieldPage({
  params,
  searchParams,
}: {
  params: Promise<{ field: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const [{ field }, query] = await Promise.all([params, searchParams]);
  if (!(FIELDS as readonly string[]).includes(field)) notFound();
  const key = field as FieldKey;
  const session = await requireSession(`${BACK}/${key}`);
  const { supabase, membership, viewer, secondary, locale } = session;
  const { t, preferences } = locale;
  const admin = isHouseholdAdmin(membership);

  const titles: Record<FieldKey, string> = {
    language: t("field.language"),
    region: t("field.region"),
    currency: t("field.currency"),
    datetime: t("l10n.datetime.title"),
    members: t("settings.memberLanguages"),
  };

  const shell = (children: React.ReactNode) => (
    <AppShell active="more" viewer={viewer} secondary={secondary} pathname="/settings" back={{ href: BACK, label: t("common.back") }} title={titles[key]}>
      <div className="space-y-5">{children}</div>
    </AppShell>
  );

  const readOnly = (value: string) => (
    <Card className="space-y-1 p-4">
      <p className="text-base font-medium">{value}</p>
      <p className="text-sm text-[var(--wh-foreground-muted)]">{t("l10n.householdSet")}</p>
    </Card>
  );

  const save = (
    <SubmitButton className="w-full" pendingLabel={t("common.saving")}>
      {t("common.save")}
    </SubmitButton>
  );

  if (key === "language") {
    return shell(
      <LocaleForm action={savePersonalLocaleAction} className="space-y-4">
        <p className="text-sm text-[var(--wh-foreground-muted)]">{t("l10n.language.lede")}</p>
        <input type="hidden" name="returnTo" value={BACK} />
        <LanguagePicker t={t} value={membership.locale?.member.language ?? null} withDefault={`${t("settings.memberLanguages.default")} · ${languageInfo(membership.locale?.household.language ?? "en").nativeName}`} />
        {preferences.language !== "en" ? <p className="text-xs text-[var(--wh-foreground-subtle)]">{t("l10n.language.coverage")}</p> : null}
        {save}
      </LocaleForm>,
    );
  }

  if (key === "region") {
    if (!admin) return shell(readOnly(`${regionName(preferences.region, preferences.language)} (${preferences.timezone})`));
    return shell(
      <LocaleForm action={saveHouseholdLocaleAction} className="space-y-4">
        <p className="text-sm text-[var(--wh-foreground-muted)]">{t("l10n.region.lede")}</p>
        <input type="hidden" name="returnTo" value={BACK} />
        <RegionPicker t={t} language={preferences.language} value={preferences.region} />
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input type="checkbox" name="applySuggestions" className="mt-0.5 size-5 accent-[var(--wh-primary)]" />
          <span>{t("settings.region.applySuggestions")}</span>
        </label>
        {save}
      </LocaleForm>,
    );
  }

  if (key === "currency") {
    if (!admin) return shell(readOnly(currencyLabel(preferences.currency, preferences.language)));
    return shell(
      <LocaleForm action={saveHouseholdLocaleAction} className="space-y-4">
        <p className="text-sm text-[var(--wh-foreground-muted)]">{t("l10n.currency.lede")}</p>
        <input type="hidden" name="returnTo" value={BACK} />
        <CurrencyPicker t={t} language={preferences.language} value={preferences.currency} />
        <p className="text-xs text-[var(--wh-foreground-subtle)]">{t("l10n.currency.history")}</p>
        {save}
      </LocaleForm>,
    );
  }

  if (key === "datetime") {
    return shell(
      <LocaleForm action={saveDateTimeAction} className="space-y-4">
        <p className="text-sm text-[var(--wh-foreground-muted)]">{t("l10n.datetime.lede")}</p>
        <input type="hidden" name="returnTo" value={BACK} />
        <div id="units">
          <DateTimeUnitsFields t={t} preferences={preferences} admin={admin} />
        </div>
        {save}
      </LocaleForm>,
    );
  }

  // Member languages: everyone the household has, each with their own choice.
  const [members, { data: languageRows }] = await Promise.all([
    listMembers(supabase, membership.household.id, membership.household.ownerMemberId),
    supabase.from("household_members").select("id, language").eq("household_id", membership.household.id),
  ]);
  const chosen = new Map(((languageRows as { id: string; language: string | null }[] | null) ?? []).map((row) => [row.id, row.language]));
  const active = members.filter((member) => member.status === "active");
  const householdDefault = membership.locale?.household.language ?? null;
  const roleOf = (member: (typeof active)[number]) =>
    member.isOwner ? t("member.owner") : member.memberType === "child" ? t("member.child") : member.memberType === "helper" ? t("member.helper") : member.roles.includes("administrator") || member.roles.includes("head") ? t("member.admin") : t("member.adult");
  const languageSelect = (name: string, value: string, disabled: boolean, label: string, defaultLabel: string) => (
    <>
      <label htmlFor={name} className="sr-only">
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={value}
        disabled={disabled}
        className="block min-h-11 w-full min-w-0 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base disabled:opacity-70 sm:w-44"
      >
        <option value="default">{defaultLabel}</option>
        {LANGUAGES.map((language) => (
          <option key={language.code} value={language.code} lang={language.code}>
            {language.nativeName}
          </option>
        ))}
      </select>
    </>
  );

  return shell(
    <LocaleForm action={saveMemberLanguagesAction} className="space-y-4">
      {query.saved ? <Alert tone="info">{t("common.saved")}</Alert> : null}
      <p className="text-sm text-[var(--wh-foreground-muted)]">{t("settings.memberLanguages.lede")}</p>
      {admin ? (
        <Card className="space-y-2 p-4">
          <p className="text-sm font-medium">{t("settings.memberLanguages.default")}</p>
          <p className="text-xs text-[var(--wh-foreground-subtle)]">{t("settings.householdChoice")}</p>
          {languageSelect("defaultLanguage", householdDefault ?? "default", false, t("settings.memberLanguages.default"), "English")}
        </Card>
      ) : null}
      <Card className="divide-y divide-[var(--wh-border)] p-1">
        {active.map((member) => {
          const value = chosen.get(member.id) ?? "default";
          const editable = admin || member.id === membership.memberId;
          return (
            <div key={member.id} className="flex flex-wrap items-center gap-3 p-3">
              <Avatar name={member.displayName} imageUrl={member.avatarUrl ?? undefined} size="md" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{member.displayName}</span>
                <span className="block text-xs text-[var(--wh-foreground-muted)]">{roleOf(member)}</span>
              </span>
              <input type="hidden" name={`was_${member.id}`} value={value} />
              <div className="w-full sm:w-auto">
                {languageSelect(
                  editable ? `language_${member.id}` : `view_${member.id}`,
                  value,
                  !editable,
                  `${t("field.language")} — ${member.displayName}`,
                  `${t("settings.memberLanguages.default")} (${languageInfo(householdDefault ?? "en").nativeName})`,
                )}
              </div>
            </div>
          );
        })}
      </Card>
      <p className="text-xs text-[var(--wh-foreground-subtle)]">{t("settings.memberLanguages.pets")}</p>
      {save}
    </LocaleForm>,
  );
}
