import { BellOff } from "lucide-react";

import { AppShell } from "@wonderhome/core/shell/app-shell";
import { NotificationCard } from "@wonderhome/core/ui/notification-card";
import { PillLink } from "@wonderhome/core/ui/pill";
import { SegmentedControl } from "@wonderhome/core/ui/segmented-control";
import { EmptyState } from "@wonderhome/core/ui/states";

import { updateNotificationAction } from "../(auth)/notification-actions";
import { SubmitPill } from "../_components/submit-pill";
import { actionLabelFor, presentationFor } from "../_components/agenda-row";
import { formatDate, formatTime, requireSession } from "../_lib/session";

export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  type: "action" | "decision" | "risk" | "completion";
  status: "generated" | "delivered" | "seen" | "acted" | "resolved" | "expired";
  thread_key: string;
  title: string;
  body: string;
  action: { action: string; target?: string } | null;
  created_at: string;
};

/**
 * Notifications (requirements §11): sparse and valuable, threaded rather than
 * repeated, each one carrying its action. Read with the member's own client,
 * so the list is what the decision engine chose to send this person.
 */
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [{ tab }, session] = await Promise.all([searchParams, requireSession("/notifications")]);
  const { supabase, membership, viewer, secondary } = session;
  const timezone = membership.household.timezone;

  const { data } = await supabase
    .from("notifications")
    .select("id, type, status, thread_key, title, body, action, created_at")
    .eq("recipient_member_id", membership.memberId)
    .neq("status", "generated")
    .order("created_at", { ascending: false })
    .limit(60);

  const all = ((data as Row[] | null) ?? []).filter((row) => row.status !== "expired" || row.type === "completion");
  const active = tab === "action" || tab === "decision" || tab === "updates" ? tab : "all";
  const open = (row: Row) => row.status === "delivered" || row.status === "seen";

  const shown = all.filter((row) => {
    if (active === "action") return row.type === "action" || row.type === "risk";
    if (active === "decision") return row.type === "decision";
    if (active === "updates") return row.type === "completion";
    return true;
  });

  const grouped = groupByDay(shown, timezone);
  const now = new Date();

  return (
    <AppShell active="more" viewer={viewer} secondary={secondary} pathname="/notifications" back={{ href: "/", label: "Back home" }} title="Notifications">
      <div className="space-y-5">
        <header className="wh-rise hidden lg:block">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">Notifications</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">Only what needs you. Resolved on its own when the situation is.</p>
        </header>

        <SegmentedControl
          label="Kind of notification"
          active={active}
          segments={[
            { key: "all", label: "All", href: "/notifications", count: all.filter(open).length },
            { key: "action", label: "Action required", href: "/notifications?tab=action", count: all.filter((row) => open(row) && (row.type === "action" || row.type === "risk")).length },
            { key: "decision", label: "Decisions", href: "/notifications?tab=decision", count: all.filter((row) => open(row) && row.type === "decision").length },
            { key: "updates", label: "Updates", href: "/notifications?tab=updates" },
          ]}
        />

        {shown.length === 0 ? (
          <EmptyState
            icon={BellOff}
            title="Nothing to interrupt you with"
            description="WonderHome only sends a notification when a person is genuinely needed, and clears it the moment the situation resolves."
          />
        ) : (
          grouped.map((group) => (
            <section key={group.label} className="space-y-2">
              <h2 className="px-1 text-[0.6875rem] font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{group.label}</h2>
              {group.rows.map((row) => {
                const presentation = presentationFor(row.thread_key);
                return (
                  <NotificationCard
                    key={row.id}
                    type={row.type}
                    status={row.status}
                    title={row.title}
                    body={row.body}
                    when={isToday(new Date(row.created_at), now, timezone) ? formatTime(timezone, new Date(row.created_at)) : formatDate(timezone, new Date(row.created_at))}
                    icon={presentation.icon}
                    tone={presentation.tone}
                    action={
                      <div className="flex items-center gap-2">
                        {row.action ? (
                          <PillLink href={presentation.href} tone={row.type === "risk" ? "primary" : "soft"}>{actionLabelFor(row.action.action)}</PillLink>
                        ) : null}
                        <form action={updateNotificationAction}>
                          <input type="hidden" name="notificationId" value={row.id} />
                          <input type="hidden" name="status" value={row.type === "completion" ? "resolved" : "acted"} />
                          <SubmitPill tone="quiet" pendingLabel="…">{row.type === "completion" ? "Got it" : "Done"}</SubmitPill>
                        </form>
                      </div>
                    }
                  />
                );
              })}
            </section>
          ))
        )}
      </div>
    </AppShell>
  );
}

function isToday(at: Date, now: Date, timezone: string): boolean {
  return formatDate(timezone, at) === formatDate(timezone, now);
}

function groupByDay(rows: Row[], timezone: string): { label: string; rows: Row[] }[] {
  const now = new Date();
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const at = new Date(row.created_at);
    const label = isToday(at, now, timezone) ? "Today" : formatDate(timezone, at) === formatDate(timezone, new Date(now.getTime() - 86_400_000)) ? "Yesterday" : "Earlier";
    groups.set(label, [...(groups.get(label) ?? []), row]);
  }
  return [...groups.entries()].map(([label, rows]) => ({ label, rows }));
}
