import { notFound } from "next/navigation";
import { after } from "next/server";

import { CHAT_PAGE_KEYS, pageKeyFor, type ChatLinkKind } from "@wonderhome/core/chat/links";
import { linkOptions, markRead, readMessages, readThread } from "@wonderhome/core/chat/repository";
import { calledName, listMembers } from "@wonderhome/core/identity/households";
import { AppShell } from "@wonderhome/core/shell/app-shell";

import { formatDate, formatTime, requireSession } from "../../_lib/session";
import { ThreadView, type ThreadLabels, type ThreadMessage } from "./thread-view";

export const metadata = { title: "Chat" };
export const dynamic = "force-dynamic";

/**
 * One chat (story 12-015): its messages, oldest first, each with the bill,
 * meal, event, thing to buy or screen it was about, opening where that thing
 * lives so whoever reads it can act on it; a composer that attaches one of
 * them, picked, never typed (rule 20); and, for a direct or group chat, who
 * is in it, Add people one or several at a time, and Leave for a group.
 * RLS decides what this member reads; a chat that is not theirs is not found.
 */
export default async function ChatThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(threadId)) notFound();
  const session = await requireSession(`/chat/${threadId}`);
  if (!session.chatOn) notFound();
  const { supabase, membership, viewer, secondary, locale } = session;
  const { t } = locale;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());

  const [thread, messages, members, options] = await Promise.all([
    readThread(supabase, threadId).catch(() => null),
    readMessages(supabase, threadId).catch(() => null),
    listMembers(supabase, householdId, membership.household.ownerMemberId).catch(() => []),
    linkOptions(supabase, householdId, today).catch(() => []),
  ]);
  if (!thread || !messages || thread.householdId !== householdId) notFound();
  if (thread.kind !== "household" && !thread.people.some((person) => person.memberId === membership.memberId)) notFound();
  // Read once the page is on its way: nothing a person waits for.
  after(() => markRead(supabase, threadId).catch(() => undefined));

  const nameOf = new Map(members.map((member) => [member.id, calledName(member)]));
  const inChat = new Set(thread.people.map((person) => person.memberId));
  const others = thread.people.filter((person) => person.memberId !== membership.memberId).map((person) => nameOf.get(person.memberId) ?? "");
  const title = thread.kind === "household" ? t("chat.household") : thread.title || others.filter(Boolean).join(", ") || t("chat.title");
  // Anyone in the family can be in a chat (the owner, 2026-10-21); someone who has not signed in yet reads it once they do. Family chat never includes a househelper.
  const waiting = members
    .filter((member) => member.id !== membership.memberId && member.status === "active" && !member.hasAccount && (thread.kind === "household" ? member.memberType !== "helper" : inChat.has(member.id)))
    .map((member) => calledName(member));
  const notice = waiting.length > 0 ? t("chat.notJoined", { names: waiting.join(", "), count: waiting.length }) : null;
  const now = new Date();
  const stamp = (at: string) => {
    const date = new Date(at);
    return formatDate(timezone, date) === formatDate(timezone, now) ? formatTime(timezone, date) : `${formatDate(timezone, date)}, ${formatTime(timezone, date)}`;
  };
  const kindWord = (kind: ChatLinkKind) => t(`chat.kind.${kind}`);

  const shown: ThreadMessage[] = messages.map((message) => {
    const pageKey = message.link?.kind === "page" ? pageKeyFor(message.link.path) : null;
    return {
      id: message.id,
      mine: message.authorMemberId === membership.memberId,
      author: message.authorMemberId === membership.memberId ? t("chat.you") : (nameOf.get(message.authorMemberId) ?? ""),
      body: message.body,
      at: stamp(message.createdAt),
      edited: Boolean(message.editedAt),
      removed: message.removed,
      link: message.link ? { path: message.link.path, label: pageKey ? t(`nav.item.${pageKey}`) : message.link.label, kind: kindWord(message.link.kind) } : null,
    };
  });

  const labels: ThreadLabels = {
    placeholder: t("chat.placeholder"),
    send: t("chat.send"),
    sending: t("chat.sending"),
    failed: t("chat.failed"),
    attach: t("chat.attach"),
    attachTitle: t("chat.attachTitle"),
    attachLede: t("chat.attachLede"),
    attachFromHome: t("chat.attachFromHome"),
    attachScreens: t("chat.attachScreens"),
    attachNone: t("chat.attachNone"),
    attachRemove: t("chat.attachRemove"),
    open: t("chat.open"),
    edited: t("chat.edited"),
    removed: t("chat.removed"),
    edit: t("chat.edit"),
    takeBack: t("chat.takeBack"),
    save: t("chat.save"),
    cancel: t("chat.cancel"),
    messageActions: t("chat.messageActions"),
    people: t("chat.people"),
    addPeople: t("chat.addPeople"),
    addPeopleTitle: t("chat.addPeopleTitle"),
    addPeopleLede: t("chat.addPeopleLede"),
    addPeopleNone: t("chat.addPeopleNone"),
    add: t("chat.add"),
    leave: t("chat.leave"),
    leaveLede: t("chat.leaveLede"),
    leaveConfirm: t("chat.leaveConfirm"),
    empty: t("chat.emptyThread"),
    you: t("chat.you"),
  };

  return (
    <AppShell active="more" viewer={viewer} secondary={secondary} pathname={`/chat/${threadId}`} back={{ href: "/chat", label: t("chat.back") }} title={title}>
      <ThreadView
        householdId={householdId}
        threadId={threadId}
        kind={thread.kind}
        title={title}
        meta={thread.kind === "household" ? t("chat.householdMeta") : thread.kind === "direct" ? t("chat.directMeta") : t("chat.groupMeta", { count: thread.people.length })}
        messages={shown}
        people={thread.kind === "household" ? [] : thread.people.map((person) => ({ id: person.memberId, name: person.memberId === membership.memberId ? t("chat.you") : (nameOf.get(person.memberId) ?? "") }))}
        canAdd={members
          .filter((member) => !inChat.has(member.id) && member.status === "active" && member.id !== membership.memberId)
          .map((member) => ({ id: member.id, name: calledName(member) }))}
        options={options.map((option) => ({ kind: option.kind, id: option.id, label: option.label, kindLabel: kindWord(option.kind) }))}
        pages={CHAT_PAGE_KEYS.filter((key) => secondary.some((item) => item.key === key)).map((key) => ({ key, label: t(`nav.item.${key}`) }))}
        labels={labels}
        notice={notice}
      />
    </AppShell>
  );
}
