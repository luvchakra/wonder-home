import { MessageCircle, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { chatInbox, householdThreadId, type ChatInboxRow } from "@wonderhome/core/chat/repository";
import { calledName, listMembers, type HouseholdMember } from "@wonderhome/core/identity/households";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Avatar, AvatarGroup } from "@wonderhome/core/ui/avatar";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { ErrorState } from "@wonderhome/core/ui/states";

import { formatDate, formatTime, requireSession } from "../_lib/session";

export const metadata = { title: "Chat" };
export const dynamic = "force-dynamic";

/**
 * Household chat (story 12-015, the owner, 2026-10-21: "an internal chat
 * feature for each member, including household … direct link or tasks can be
 * mentioned in the chat so other member can look at them and take action").
 *
 * The inbox: the household's own thread, which everyone is in, first; then
 * this member's direct and group chats, newest first, each with what was last
 * said and how many messages from others are new; then everyone they can
 * start a chat with. Only people who sign in themselves can read a chat, so
 * only they are offered.
 */
export default async function ChatPage() {
  const session = await requireSession("/chat");
  if (!session.chatOn) notFound();
  const { supabase, membership, viewer, secondary, locale } = session;
  const { t } = locale;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;
  const shell = { active: "more" as const, viewer, secondary, pathname: "/chat", back: { href: "/more", label: t("common.back") }, title: t("nav.item.chat") };

  let rows: ChatInboxRow[];
  let members: HouseholdMember[];
  try {
    // The family chat exists from the first visit on; then one wave for the inbox and the names.
    // A househelper is never in the family chat (the owner, 2026-10-21), so it is not opened for one.
    if (membership.memberType !== "helper") await householdThreadId(supabase, householdId);
    [rows, members] = await Promise.all([chatInbox(supabase, householdId), listMembers(supabase, householdId, membership.household.ownerMemberId)]);
  } catch {
    return (
      <AppShell {...shell}>
        <ErrorState title={t("chat.loadError")} description={t("chat.loadErrorBody")} retryHref="/chat" />
      </AppShell>
    );
  }

  const nameOf = new Map(members.map((member) => [member.id, calledName(member)]));
  const others = (row: ChatInboxRow) => row.people.filter((id) => id !== membership.memberId).map((id) => nameOf.get(id)).filter((name): name is string => Boolean(name));
  const now = new Date();
  const when = (at: string | null) => {
    if (!at) return null;
    const date = new Date(at);
    return formatDate(timezone, date) === formatDate(timezone, now) ? formatTime(timezone, date) : formatDate(timezone, date);
  };
  const preview = (row: ChatInboxRow) => {
    if (row.lastRemoved) return t("chat.removedPreview");
    if (!row.lastBody) return t("chat.noMessages");
    const who = row.lastAuthor === membership.memberId ? t("chat.you") : row.lastAuthor ? (nameOf.get(row.lastAuthor) ?? null) : null;
    return who && row.kind !== "direct" ? `${who}: ${row.lastBody}` : row.lastBody;
  };
  const household = rows.find((row) => row.kind === "household");
  const chats = rows.filter((row) => row.kind !== "household");
  const reachable = members.filter((member) => member.id !== membership.memberId && member.status === "active");
  const firstName = viewer.displayName.split(/\s+/)[0] ?? viewer.displayName;

  const threadRow = (row: ChatInboxRow) => {
    const names = others(row);
    const title = row.kind === "household" ? t("chat.household") : row.title || names.join(", ") || t("chat.title");
    const meta = row.kind === "household" ? t("chat.householdMeta") : row.kind === "direct" ? t("chat.directMeta") : t("chat.groupMeta", { count: names.length + 1 });
    const time = when(row.lastMessageAt);
    return (
      <li key={row.threadId}>
        <Link
          href={`/chat/${row.threadId}`}
          className="flex min-h-16 items-start gap-3 rounded-[var(--wh-radius-sm)] px-2 py-3 transition-colors hover:bg-[var(--wh-primary-soft)]/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]"
        >
          {row.kind === "household" ? (
            <IconTile icon={Users} tone="people" />
          ) : row.kind === "direct" && names[0] ? (
            <Avatar name={names[0]} size="md" />
          ) : (
            <AvatarGroup names={names} max={2} size="sm" />
          )}
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline justify-between gap-x-2">
              <span className="text-sm font-semibold break-words">{title}</span>
              {time ? <span className="text-xs whitespace-nowrap text-[var(--wh-foreground-subtle)] tabular-nums">{time}</span> : null}
            </span>
            <span className="block text-xs text-[var(--wh-foreground-subtle)]">{meta}</span>
            <span className="mt-0.5 flex items-start justify-between gap-2">
              <span className={`line-clamp-2 text-sm break-words ${row.unread > 0 ? "font-medium text-[var(--wh-foreground)]" : "text-[var(--wh-foreground-muted)]"}`}>{preview(row)}</span>
              {row.unread > 0 ? (
                <span className="shrink-0 rounded-[var(--wh-radius-pill)] bg-[var(--wh-primary)] px-2 py-0.5 text-[0.6875rem] font-bold whitespace-nowrap text-[var(--wh-primary-foreground)]">
                  {t("chat.unread", { count: row.unread })}
                </span>
              ) : null}
            </span>
          </span>
        </Link>
      </li>
    );
  };

  return (
    <AppShell {...shell}>
      <div className="space-y-6">
        <header className="wh-rise space-y-1">
          <h1 className="hidden text-[1.625rem] font-bold tracking-tight sm:text-3xl lg:block">{t("nav.item.chat")}</h1>
          <p className="text-[0.9375rem] text-[var(--wh-foreground-muted)]">{t("chat.greeting", { name: firstName })}</p>
          <p className="text-sm text-[var(--wh-foreground-subtle)]">{t("chat.lede")}</p>
        </header>

        <section className="space-y-2">
          <SectionHeader title={t("chat.chats")} count={chats.length + (household ? 1 : 0)} />
          <Card className="p-2">
            <ul className="divide-y divide-[var(--wh-border)]">
              {household ? threadRow(household) : null}
              {chats.map(threadRow)}
            </ul>
          </Card>
        </section>

        <section className="space-y-2">
          <SectionHeader title={t("chat.start")} />
          <p className="text-sm text-[var(--wh-foreground-muted)]">{reachable.length > 0 ? t("chat.startLede") : t("chat.startNone")}</p>
          {reachable.length > 0 ? (
            <Card className="p-2">
              <ul className="divide-y divide-[var(--wh-border)]">
                {reachable.map((member) => (
                  <li key={member.id}>
                    <Link
                      href={`/chat/with/${member.id}`}
                      className="flex min-h-14 items-center gap-3 rounded-[var(--wh-radius-sm)] px-2 py-2.5 transition-colors hover:bg-[var(--wh-primary-soft)]/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]"
                    >
                      <Avatar name={member.displayName} size="md" imageUrl={member.avatarUrl} />
                      <span className="min-w-0 flex-1 text-sm font-medium break-words">{calledName(member)}</span>
                      <MessageCircle aria-hidden className="size-4 shrink-0 text-[var(--wh-primary)]" />
                      <span className="sr-only">{t("chat.with", { name: calledName(member) })}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </section>

        <QuoteCard>{t("chat.closing")}</QuoteCard>
      </div>
    </AppShell>
  );
}
