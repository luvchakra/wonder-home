import type { TranslationKey } from "@wonderhome/core/i18n/translate";
import { channelAdaptersFromEnv } from "@wonderhome/core/notifications/channels";
import { loadHouseholdQuietHours, presetForMember, type HouseholdNotificationSettings } from "@wonderhome/core/notifications/household-settings";
import { REMINDER_POLICIES, TUNABLE_CATEGORIES, type TunableCategory } from "@wonderhome/core/notifications/policies";
import { ROUTABLE_CHANNELS } from "@wonderhome/core/notifications/routing";
import { atLocal, localMoment } from "@wonderhome/core/notifications/timing";

import type { Session } from "../../_lib/session";
import { reminderPresetLabel, reminderSettingsLabels } from "../../_lib/settings-labels";
import { HouseholdNotificationsForm } from "./household-notifications-form";

/**
 * How the whole household is notified (the owner, 2026-10-22), on the same
 * page as each person's own choices (design/UI-SIMPLIFICATION-v1.md M1) so the
 * two are read together: a person narrows these, never widens them. The page
 * renders this only for an Admin; the save action checks again.
 */
export async function HouseholdNotificationsSection({
  session,
  settings,
}: {
  session: Session;
  settings: HouseholdNotificationSettings;
}) {
  const { supabase, membership, locale } = session;
  const { t, format } = locale;
  const householdId = membership.household.id;
  const timeZone = membership.household.timezone;
  const quiet = await loadHouseholdQuietHours(supabase, householdId);
  const kindNames = reminderSettingsLabels(t).prefs.categories;
  const adapters = channelAdaptersFromEnv();
  const today = localMoment(new Date(), timeZone).dateKey;

  return (
    <section id="household" className="scroll-mt-20 space-y-4">
      <header>
        <h2 className="text-lg font-semibold tracking-tight">{t("manage.section.notifications")}</h2>
        <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{t("manage.notifications.lede")}</p>
      </header>

      <HouseholdNotificationsForm
        householdId={householdId}
        kinds={TUNABLE_CATEGORIES.map((category) => ({
          category,
          name: kindNames[category],
          options: REMINDER_POLICIES[category].presets.map((preset) => ({ value: preset.key, label: reminderPresetLabel(t, preset.key, preset.label) })),
        }))}
        // Only the channels that can send here (rule 10); a channel the household already turned off stays listed so it can be turned back on.
        channels={ROUTABLE_CHANNELS.filter((channel) => adapters[channel].live || settings.channelsOff.includes(channel)).map((channel) => ({
          channel,
          name: t(`settingsPage.notifications.channel.${channel}` as TranslationKey),
        }))}
        hours={Array.from({ length: 24 }, (_, hour) => ({ value: hour, label: format.time(atLocal(today, hour * 60, timeZone)) }))}
        initial={{
          kindsOff: settings.kindsOff,
          defaults: Object.fromEntries(TUNABLE_CATEGORIES.map((category) => [category, presetForMember(settings, category, null)])) as Record<TunableCategory, string>,
          channelsOff: settings.channelsOff,
          channelStep: settings.channelStep,
          backupStep: settings.backupStep,
          quiet: quiet ? { fromHour: Math.floor(quiet.fromMinute / 60), untilHour: Math.floor(quiet.untilMinute / 60) } : null,
        }}
        timeZone={timeZone}
        labels={{
          kinds: {
            title: t("manage.notifications.kinds.title"),
            lede: t("manage.notifications.kinds.lede"),
            on: t("manage.notifications.kinds.on"),
            timing: t("settingsPage.notifications.prefs.timing", { category: "{category}" }),
          },
          channels: {
            title: t("manage.notifications.channels.title"),
            lede: t("manage.notifications.channels.lede"),
            none: t("manage.notifications.channels.none"),
          },
          unanswered: {
            title: t("manage.notifications.unanswered.title"),
            lede: t("manage.notifications.unanswered.lede"),
            channelStep: t("manage.notifications.unanswered.channelStep"),
            channelStepBody: t("manage.notifications.unanswered.channelStepBody"),
            backupStep: t("manage.notifications.unanswered.backupStep"),
            backupStepBody: t("manage.notifications.unanswered.backupStepBody"),
          },
          quiet: {
            title: t("manage.notifications.quiet.title"),
            lede: t("manage.notifications.quiet.lede"),
            on: t("manage.notifications.quiet.on"),
            from: t("settingsPage.notifications.quiet.from"),
            until: t("settingsPage.notifications.quiet.until"),
            clock: t("settingsPage.notifications.quiet.clock", { timeZone: "{timeZone}" }),
          },
          save: t("manage.notifications.save"),
          saving: t("common.saving"),
          saved: t("manage.notifications.saved"),
          failed: t("manage.notifications.failed"),
        }}
      />
    </section>
  );
}
