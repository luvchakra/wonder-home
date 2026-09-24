import { describeTimezone, COMMON_TIMEZONES, type DateFormat } from "@wonderhome/core/i18n/locales";
import { currencyOptions, languageOptions, regionOptions } from "@wonderhome/core/i18n/options";
import { formatterFor } from "@wonderhome/core/i18n/format";
import type { LocalePreferences } from "@wonderhome/core/i18n/preferences";
import type { Translate } from "@wonderhome/core/i18n/translate";
import { ChoiceList } from "@wonderhome/core/ui/choice-list";
import { Select } from "@wonderhome/core/ui/select";

/**
 * The language, region, currency and date/time/units pickers (story 22-003),
 * one set shared by the optional setup and by Settings — so the two can never
 * offer different lists (spec §F).
 */

export function LanguagePicker({ t, value, withDefault }: { t: Translate; value: string | null; withDefault?: string }) {
  const options = languageOptions();
  return (
    <ChoiceList
      name="language"
      legend={t("field.language")}
      options={withDefault ? [{ value: "default", label: withDefault }, ...options] : options}
      defaultValue={value ?? (withDefault ? "default" : "en")}
      searchPlaceholder={t("l10n.language.search")}
      emptyText={t("l10n.noMatch")}
    />
  );
}

export function RegionPicker({ t, language, value }: { t: Translate; language: string; value: string }) {
  return (
    <ChoiceList
      name="region"
      legend={t("field.region")}
      options={regionOptions(language)}
      defaultValue={value}
      searchPlaceholder={t("l10n.region.search")}
      emptyText={t("l10n.noMatch")}
    />
  );
}

export function CurrencyPicker({ t, language, value }: { t: Translate; language: string; value: string }) {
  return (
    <ChoiceList
      name="currency"
      legend={t("field.currency")}
      options={currencyOptions(language, value)}
      defaultValue={value}
      searchPlaceholder={t("l10n.currency.search")}
      emptyText={t("l10n.noMatch")}
    />
  );
}

/**
 * Time zone, date format, time format and units on one screen, as the
 * mockup has them. Each date format is shown as today's date written that
 * way, so the choice is made by looking, not by decoding "DD/MM/YYYY".
 * The time zone is the household's: an Admin chooses it, everyone else sees
 * it and is told who does.
 */
export function DateTimeUnitsFields({ t, preferences, admin, now = new Date() }: { t: Translate; preferences: LocalePreferences; admin: boolean; now?: Date }) {
  const example = (dateFormat: DateFormat) => formatterFor({ ...preferences, dateFormat }).numericDate(now);
  const zones: string[] = [...COMMON_TIMEZONES];
  if (!zones.includes(preferences.timezone)) zones.unshift(preferences.timezone);
  const clock = (timeFormat: "12h" | "24h") => formatterFor({ ...preferences, timeFormat }).time(new Date(Date.UTC(2026, 0, 1, 10, 0)));

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        {admin ? (
          <Select label={t("field.timezone")} name="timezone" defaultValue={preferences.timezone}>
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {describeTimezone(zone, now)}
              </option>
            ))}
          </Select>
        ) : (
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("field.timezone")}</p>
            <p className="rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 py-2.5 text-base">{describeTimezone(preferences.timezone, now)}</p>
            <p className="text-xs text-[var(--wh-foreground-subtle)]">{t("l10n.householdSet")}</p>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">{t("field.dateFormat")}</h2>
        <ChoiceList
          name="dateFormat"
          legend={t("field.dateFormat")}
          searchable={false}
          emptyText=""
          defaultValue={preferences.dateFormat}
          options={[
            { value: "dmy", label: "DD/MM/YYYY", detail: example("dmy") },
            { value: "mdy", label: "MM/DD/YYYY", detail: example("mdy") },
            { value: "ymd", label: "YYYY-MM-DD", detail: example("ymd") },
          ]}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">{t("field.timeFormat")}</h2>
        <ChoiceList
          name="timeFormat"
          legend={t("field.timeFormat")}
          searchable={false}
          emptyText=""
          defaultValue={preferences.timeFormat}
          options={[
            { value: "12h", label: t("time.12h"), detail: clock("12h") },
            { value: "24h", label: t("time.24h"), detail: clock("24h") },
          ]}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">{t("field.units")}</h2>
        <ChoiceList
          name="measurement"
          legend={t("field.units")}
          searchable={false}
          emptyText=""
          defaultValue={preferences.measurement}
          options={[
            { value: "metric", label: t("units.metric"), detail: t("units.metricHint") },
            { value: "imperial", label: t("units.imperial"), detail: t("units.imperialHint") },
          ]}
        />
      </section>
    </div>
  );
}
