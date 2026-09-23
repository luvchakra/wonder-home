import { AppShell } from "@wonderhome/core/shell/app-shell";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { channelAdaptersFromEnv } from "@wonderhome/core/notifications/channels";
import { loadChannelPreferences } from "@wonderhome/core/notifications/preferences";

import { saveChannelPreferenceAction } from "../../(auth)/notification-preferences-actions";
import { CHANNEL_DESCRIPTIONS, ChannelPreferenceCard } from "../../_components/notification-preferences-form";
import { requireSession } from "../../_lib/session";

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

  const preferences = await loadChannelPreferences(supabase, membership.memberId);
  // Which channels actually reach someone on this deployment (story 17-006):
  // WhatsApp once its Cloud API is configured, in-app always.
  const adapters = channelAdaptersFromEnv();

  return (
    <AppShell
      active="more"
      viewer={viewer}
      secondary={secondary}
      pathname="/settings/notifications"
      back={{ href: "/settings", label: "Back to settings" }}
      title="Notifications"
    >
      <div className="space-y-6">
        <header className="wh-rise">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">How you hear from WonderHome</h1>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">
            Your own preferences — nobody else&rsquo;s notifications change when you set yours.
          </p>
        </header>

        <div className="space-y-4">
          {preferences.map((preference) => (
            <ChannelPreferenceCard
              key={preference.channel}
              householdId={membership.household.id}
              tone="attention"
              preference={preference}
              live={adapters[preference.channel].live}
              description={CHANNEL_DESCRIPTIONS[preference.channel]}
              save={saveChannelPreferenceAction}
            />
          ))}
        </div>

        <QuoteCard>Told once, told well.</QuoteCard>
      </div>
    </AppShell>
  );
}
