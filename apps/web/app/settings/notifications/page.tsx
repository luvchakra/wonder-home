import { ListChecks } from "lucide-react";
import Link from "next/link";

import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { channelAdaptersFromEnv } from "@wonderhome/core/notifications/channels";
import { loadChannelPreferences, loadSmartReminderChoices } from "@wonderhome/core/notifications/preferences";
import { REMINDER_POLICIES } from "@wonderhome/core/notifications/policies";
import { loadReminderPreferences } from "@wonderhome/core/notifications/reminder-preferences";
import { atLocal, localMoment } from "@wonderhome/core/notifications/timing";

import {
  saveChannelPreferenceAction,
  saveQuietHoursAction,
  saveReminderPreferencesAction,
  saveSmartRemindersAction,
} from "../../(auth)/notification-preferences-actions";
import { ChannelPreferenceCard } from "../../_components/notification-preferences-form";
import { QuietHoursCard, ReminderPreferencesCard, SmartRemindersCard } from "../../_components/reminder-settings-form";
import { STARTER_OUTCOMES } from "../../_lib/starter-outcomes";
import { requireSession } from "../../_lib/session";
import { channelPreferenceLabels, reminderPresetLabel, reminderSettingsLabels } from "../../_lib/settings-labels";

export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

/**
 * How WonderHome reaches this person (story 06-008).
 *
 * Every channel `notification_preferences` already stores — in-app, push,
 * email, WhatsApp — gets its own card, each independently on/off with its
 * own quiet hours, because someone can want push silenced overnight while
 * still wanting email waiting for them in the morning. In-app is the one
 * channel actually live today; the rest are honest about not being
 * connected yet rather than pretending a toggle already does something.
 */
export default async function NotificationSettingsPage() {
  const session = await requireSession("/settings/notifications");
  const { supabase, membership, viewer, secondary } = session;

  const [preferences, reminderPreferences, smart, { data: responsibilityData }] = await Promise.all([
    loadChannelPreferences(supabase, membership.memberId),
    loadReminderPreferences(supabase, membership.memberId),
    loadSmartReminderChoices(supabase, membership.memberId),
    supabase
      .from("responsibilities")
      .select("outcome_key, primary_member_id, backup_member_id, playbook_items(name)")
      .eq("household_id", membership.household.id),
  ]);
  // What routes reminders to this person (story 23-009): the responsibilities
  // they hold, first or as backup — the same ones the engine reads.
  const routing = ((responsibilityData ?? []) as { outcome_key: string; primary_member_id: string | null; backup_member_id: string | null; playbook_items: { name: string } | { name: string }[] | null }[])
    .filter((row) => row.primary_member_id === membership.memberId || row.backup_member_id === membership.memberId)
    .map((row) => {
      const item = Array.isArray(row.playbook_items) ? row.playbook_items[0] : row.playbook_items;
      const name = item?.name ?? STARTER_OUTCOMES.find((starter) => starter.key === row.outcome_key)?.label ?? row.outcome_key.replace(/[._]/g, " ");
      return { key: row.outcome_key, name, primary: row.primary_member_id === membership.memberId };
    })
    .sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name));
  const timeZone = membership.household.timezone;
  const { t, format } = session.locale;
  const reminderLabels = reminderSettingsLabels(t);

  // Quiet hours are the in-app channel's own window, to the minute.
  const inApp = preferences.find((preference) => preference.channel === "in_app");
  const clock = (hour: number, minute: number) => `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const quiet =
    inApp && inApp.quietFrom !== null && inApp.quietUntil !== null
      ? { from: clock(inApp.quietFrom, inApp.quietFromMinute ?? 0), until: clock(inApp.quietUntil, inApp.quietUntilMinute ?? 0) }
      : null;
  const today = localMoment(new Date(), timeZone).dateKey;
  const times = Array.from({ length: 96 }, (_, index) => ({
    value: clock(Math.floor(index / 4), (index % 4) * 15),
    label: format.time(atLocal(today, index * 15, timeZone)),
  }));
  // Which channels actually reach someone on this deployment (story 17-006):
  // WhatsApp once its Cloud API is configured, in-app always.
  const adapters = channelAdaptersFromEnv();

  return (
    <AppShell
      active="more"
      viewer={viewer}
      secondary={secondary}
      pathname="/settings/notifications"
      back={{ href: "/settings", label: t("settingsPage.backToSettings") }}
      title={t("settingsPage.notifications.title")}
    >
      <div className="space-y-6">
        <header className="wh-rise">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("settingsPage.notifications.heading")}</h1>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{t("settingsPage.notifications.lede")}</p>
        </header>

        {/* Keyed on what is saved, so a saved change redraws the form with it. */}
        <QuietHoursCard
          key={quiet ? `${quiet.from}-${quiet.until}` : "off"}
          householdId={membership.household.id} quiet={quiet} times={times} timeZone={timeZone} save={saveQuietHoursAction} labels={reminderLabels} />

        <ReminderPreferencesCard
          key={reminderPreferences.map((preference) => `${preference.preset}:${preference.enabled}`).join(",")}
          householdId={membership.household.id}
          rows={reminderPreferences.map((preference) => ({
            ...preference,
            options: REMINDER_POLICIES[preference.category].presets.map((preset) => ({ value: preset.key, label: reminderPresetLabel(t, preset.key, preset.label) })),
          }))}
          save={saveReminderPreferencesAction}
          labels={reminderLabels}
        />

        <SmartRemindersCard
          key={`${smart.dailyDigest}-${smart.learnTiming}`}
          householdId={membership.household.id}
          dailyDigest={smart.dailyDigest}
          learnTiming={smart.learnTiming}
          save={saveSmartRemindersAction}
          labels={reminderLabels}
        />

        <Card className="space-y-3">
          <div className="flex items-start gap-3">
            <IconTile icon={ListChecks} tone="primary" />
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">{t("settingsPage.notifications.routing.title")}</h2>
              <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">
                {routing.length > 0 ? t("settingsPage.notifications.routing.some") : t("settingsPage.notifications.routing.none")}
              </p>
            </div>
          </div>
          {routing.length > 0 ? (
            <ul className="divide-y divide-[var(--wh-border)]">
              {routing.map((row) => (
                <li key={row.key} className="py-2.5 text-sm">
                  <span className="font-medium">{row.name}</span>
                  <span className="block text-[var(--wh-foreground-muted)]">
                    {row.primary ? t("settingsPage.notifications.routing.primary") : t("settingsPage.notifications.routing.backup")}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <Link href="/household/responsibilities?tab=mine" className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--wh-primary)] underline-offset-4 hover:underline">
            {t("settingsPage.notifications.routing.change")}
          </Link>
        </Card>

        <h2 className="pt-2 text-base font-semibold">{t("settingsPage.notifications.channels")}</h2>
        <div className="space-y-4">
          {preferences.map((preference) => (
            <ChannelPreferenceCard
              key={preference.channel}
              householdId={membership.household.id}
              tone="attention"
              preference={preference}
              live={adapters[preference.channel].live}
              labels={channelPreferenceLabels(t, preference.channel)}
              save={saveChannelPreferenceAction}
            />
          ))}
        </div>

        <QuoteCard>{t("settingsPage.notifications.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}
