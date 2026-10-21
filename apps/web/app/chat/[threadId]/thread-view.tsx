"use client";

import { ArrowUpRight, Info, LogOut, Paperclip, Pencil, SendHorizontal, SmilePlus, Undo2, UserPlus, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useOptimistic, useRef, useState, useTransition, type MouseEvent, type ReactNode } from "react";

import { activeTrigger, normaliseTag, piecesOf, replaceTrigger, type Mentionable } from "@wonderhome/core/chat/composer";
import { CHAT_REACTIONS, nextReaction, withMyReaction, type ChatReaction, type ReactionTally } from "@wonderhome/core/chat/thread";
import { Avatar } from "@wonderhome/core/ui/avatar";
import { Button } from "@wonderhome/core/ui/button";
import { Card } from "@wonderhome/core/ui/card";
import { Popover } from "@wonderhome/core/ui/popover";
import { ConfirmationSheet, Sheet } from "@wonderhome/core/ui/sheet";

import { addChatPeopleAction, editChatMessageAction, leaveChatAction, reactToChatMessageAction, sendChatMessageAction, takeBackChatMessageAction } from "../actions";

export type ThreadReaction = ReactionTally & { names: string[] };

export type ThreadMessage = {
  id: string;
  mine: boolean;
  author: string;
  body: string;
  /** The time it was sent, on the household's clock; the day is the separator's. */
  at: string;
  edited: boolean;
  removed: boolean;
  link: { path: string; label: string; kind: string } | null;
  /** The first and last of a run of one person's messages. */
  first: boolean;
  last: boolean;
  /** The day separator above it ("Today", "Yesterday", a date), when the day changes here. */
  day: string | null;
  reactions: ThreadReaction[];
};

export type ThreadLabels = Record<
  | "placeholder" | "send" | "sending" | "failed" | "attach" | "attachTitle" | "attachLede" | "attachFromHome" | "attachScreens" | "attachNone" | "attachRemove"
  | "open" | "edited" | "removed" | "edit" | "takeBack" | "save" | "cancel" | "messageActions"
  | "people" | "addPeople" | "addPeopleTitle" | "addPeopleLede" | "addPeopleNone" | "add" | "leave" | "leaveLede" | "leaveConfirm" | "empty" | "you"
  | "pickAttach" | "pickMention" | "pickTag" | "pickNone" | "newTag" | "helper" | "pet"
  | "react" | "removeReaction" | "reactedBy",
  string
>;

type Option = { kind: "bill" | "meal" | "event" | "grocery" | "school" | "home"; id: string; label: string; kindLabel: string };

/** How many picks a /, @ or # list shows at once; typing narrows it. */
const PICKS = 8;
type Attachment = { kind: Option["kind"]; id: string; label: string; kindLabel: string } | { kind: "page"; key: string; label: string; kindLabel: string };

const ICON_BUTTON =
  "grid size-9 shrink-0 place-items-center rounded-full text-[var(--wh-foreground-muted)] transition-colors hover:bg-[var(--wh-surface-muted)] hover:text-[var(--wh-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)] disabled:opacity-50";

/** How often an open chat looks for what others have said, while it is on screen. */
const REFRESH_MS = 10_000;
/** How long a finger rests on a message before its options open (iOS fires no contextmenu). */
const LONG_PRESS_MS = 450;
/** The composer grows with what is typed up to about six lines, then scrolls. */
const COMPOSER_MAX_PX = 144;

/**
 * A chat on screen (story 12-015), WhatsApp-compact (the owner, 2026-10-21):
 * one row per message, the time inside the bubble, a person's name only on
 * the first of their run, a day chip where the day changes, reactions under
 * a bubble's corner, and a one-row composer that stays clear of the tab bar
 * (rule 15). A message's options — react, and for your own change and take
 * back — open from a long-press, a right-click or the small icon beside it.
 * Every write is a server action that checks again; after one, the page is
 * read again from the server (a reaction shows at once, optimistically).
 */
export function ThreadView({
  householdId,
  threadId,
  kind,
  title,
  meta,
  messages,
  people,
  canAdd,
  options,
  pages,
  labels,
  reactionNames,
  me,
  notice = null,
  mentionables = [],
  tags = [],
}: {
  householdId: string;
  threadId: string;
  kind: "household" | "direct" | "group";
  title: string;
  meta: string;
  messages: ThreadMessage[];
  people: { id: string; name: string }[];
  canAdd: { id: string; name: string }[];
  options: Option[];
  pages: { key: string; label: string }[];
  labels: ThreadLabels;
  /** Each reaction's name, for a screen reader: "Thumbs up". */
  reactionNames: Record<ChatReaction, string>;
  /** This member's id, so a reaction tapped shows at once. */
  me: string;
  /** A short note above the message box (the owner, 2026-10-21): who reads this chat, the / @ # keys, and who reads it once they sign in. */
  notice?: string[] | null;
  /** Everyone and everything a message can mention with @: members, helpers and pets (the owner, 2026-10-21). */
  mentionables?: Mentionable[];
  /** Tags already used in chats this member reads, most used first, for #. */
  tags?: string[];
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [closedAt, setClosedAt] = useState<number | null>(null);
  const found = activeTrigger(body, caret);
  const trigger = found && found.start !== closedAt ? found : null;
  const names = mentionables.map((entry) => entry.name);

  const query = trigger?.query.toLocaleLowerCase() ?? "";
  const matches = (label: string) => label.toLocaleLowerCase().includes(query);
  type Pick = { key: string; label: string; meta: string; attach: Attachment | null; text: string };
  const picks: Pick[] = !trigger
    ? []
    : trigger.char === "/"
      ? [
          ...options.filter((option) => matches(option.label)).map((option) => ({ key: `${option.kind}-${option.id}`, label: option.label, meta: option.kindLabel, attach: option as Attachment, text: "" })),
          ...pages.filter((page) => matches(page.label)).map((page) => ({ key: `page-${page.key}`, label: page.label, meta: "", attach: { kind: "page" as const, key: page.key, label: page.label, kindLabel: "" }, text: "" })),
        ].slice(0, PICKS)
      : trigger.char === "@"
        ? mentionables.filter((entry) => matches(entry.name)).slice(0, PICKS).map((entry) => ({ key: `${entry.kind}-${entry.name}`, label: entry.name, meta: entry.kind === "helper" ? labels.helper : entry.kind === "pet" ? labels.pet : "", attach: null, text: `@${entry.name}` }))
        : (() => {
            const typed = normaliseTag(trigger.query);
            const known = tags.filter((tag) => tag.startsWith(typed ?? "")).slice(0, PICKS);
            const fresh = typed && !known.includes(typed) ? [{ key: `new-${typed}`, label: `#${typed}`, meta: labels.newTag, attach: null, text: `#${typed}` }] : [];
            return [...fresh, ...known.map((tag) => ({ key: `tag-${tag}`, label: `#${tag}`, meta: "", attach: null, text: `#${tag}` }))];
          })();
  // A pick goes in where the trigger was: a "/" pick becomes the attachment, the others become text.
  const choose = (pick: Pick) => {
    if (!trigger) return;
    if (pick.attach) setAttachment(pick.attach);
    const next = replaceTrigger(body, trigger, pick.text);
    setBody(next.text);
    setCaret(next.caret);
    window.requestAnimationFrame(() => {
      box.current?.focus();
      box.current?.setSelectionRange(next.caret, next.caret);
    });
  };
  const lastId = messages.at(-1)?.id;

  // The newest message in view on arrival and whenever a new one lands.
  useEffect(() => {
    // The composer is sticky, so the page's own end is what comes into view.
    window.scrollTo({ top: document.documentElement.scrollHeight });
  }, [lastId]);

  // Others' new messages, while the chat is on screen.
  useEffect(() => {
    const tick = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(tick);
  }, [router]);

  // One row that grows with what is typed (WhatsApp style), up to a few lines.
  useLayoutEffect(() => {
    const field = box.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, COMPOSER_MAX_PX)}px`;
  }, [body]);

  // While typing on a phone the tab bar steps aside, so the keyboard, the
  // composer and the conversation have the screen (ui-theme.css, data-wh-typing).
  const typing = (on: boolean) => {
    const root = document.documentElement;
    if (on) root.dataset.whTyping = "on";
    else delete root.dataset.whTyping;
  };
  useEffect(() => () => typing(false), []);

  const send = () => {
    if (!body.trim()) return;
    setError(null);
    startTransition(async () => {
      const choice = attachment ? (attachment.kind === "page" ? { kind: "page" as const, key: attachment.key } : { kind: attachment.kind, id: attachment.id }) : null;
      const result = await sendChatMessageAction({ householdId, threadId, body, attachment: choice as never });
      if ("error" in result) {
        setError(labels.failed);
        return;
      }
      setBody("");
      setAttachment(null);
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <header className="wh-rise flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight break-words lg:text-2xl">{title}</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">{meta}</p>
        </div>
        {kind !== "household" ? (
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={() => setAddOpen(true)} aria-label={labels.addPeople} title={labels.addPeople} className={ICON_BUTTON}>
              <UserPlus aria-hidden className="size-4" />
            </button>
            {kind === "group" ? <LeaveButton threadId={threadId} labels={labels} /> : null}
          </div>
        ) : null}
      </header>

      {kind !== "household" && people.length > 0 ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--wh-foreground-subtle)]">
          <Users aria-hidden className="size-3.5" />
          <span className="font-medium">{labels.people}:</span>
          {people.map((person) => (
            <span key={person.id} className="whitespace-nowrap">{person.name}</span>
          ))}
        </p>
      ) : null}

      <ol className="flex flex-col" aria-live="polite">
        {messages.length === 0 ? (
          <li>
            <Card className="p-4 text-sm text-[var(--wh-foreground-muted)]">{labels.empty}</Card>
          </li>
        ) : (
          messages.flatMap((message) => [
            ...(message.day
              ? [
                  <li key={`day-${message.id}`} className="my-2 flex justify-center">
                    <span className="rounded-full bg-[var(--wh-surface)] px-2.5 py-0.5 text-[0.6875rem] font-medium text-[var(--wh-foreground-muted)] shadow-[var(--wh-shadow-card)]">{message.day}</span>
                  </li>,
                ]
              : []),
            <MessageBubble
              key={message.id}
              message={message}
              threadId={threadId}
              labels={labels}
              names={names}
              showAuthor={!message.mine && message.first && kind !== "direct"}
              reactionNames={reactionNames}
              me={me}
            />,
          ])
        )}
      </ol>

      {/* Sticky above the tab bar (and the raised assistant button), so it is never behind it (rule 15). */}
      <div ref={end} className="wh-chat-composer sticky z-30 -mx-1 space-y-1.5 bg-[var(--wh-background)] px-1 pt-1 pb-1 shadow-[0_2.75rem_0_0_var(--wh-background)] lg:shadow-[0_1rem_0_0_var(--wh-background)]">
        {notice && notice.length > 0 ? (
          <p className="flex gap-1 px-1 text-[0.6875rem] leading-snug break-words text-[var(--wh-foreground-subtle)]">
            <Info aria-hidden className="mt-px size-3 shrink-0" />
            <span>{notice.join(" · ")}</span>
          </p>
        ) : null}
        {attachment ? (
          <div className="flex items-center gap-2 rounded-[var(--wh-radius-sm)] bg-[var(--wh-primary-soft)] px-3 py-1 text-sm">
            <Paperclip aria-hidden className="size-4 shrink-0 text-[var(--wh-primary)]" />
            <span className="min-w-0 flex-1 break-words">
              <span className="text-xs font-semibold text-[var(--wh-foreground-subtle)] uppercase">{attachment.kindLabel}</span> {attachment.label}
            </span>
            <button type="button" onClick={() => setAttachment(null)} aria-label={labels.attachRemove} title={labels.attachRemove} className={ICON_BUTTON}>
              <X aria-hidden className="size-4" />
            </button>
          </div>
        ) : null}
        {trigger ? (
          // What "/", "@" or "#" asks for, narrowed by what follows it; a tap puts it in (the owner, 2026-10-21).
          <div id="chat-picks" className="rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] shadow-[var(--wh-shadow-card)]">
            <p className="px-3 pt-2 text-[0.6875rem] font-semibold text-[var(--wh-foreground-subtle)] uppercase">
              {trigger.char === "/" ? labels.pickAttach : trigger.char === "@" ? labels.pickMention : labels.pickTag}
            </p>
            {picks.length === 0 ? (
              <p className="px-3 pt-1 pb-2 text-sm text-[var(--wh-foreground-muted)]">{labels.pickNone}</p>
            ) : (
              <ul className="max-h-48 overflow-y-auto py-1">
                {picks.map((pick) => (
                  <li key={pick.key}>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => choose(pick)}
                      className="flex min-h-11 w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-[var(--wh-primary-soft)]/30"
                    >
                      <span className="min-w-0 flex-1 text-sm break-words">{pick.label}</span>
                      {pick.meta ? <span className="shrink-0 text-[0.6875rem] font-semibold text-[var(--wh-foreground-subtle)] uppercase">{pick.meta}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
        <div className="flex items-end gap-1.5">
          <div className="flex min-w-0 flex-1 items-end gap-0.5 rounded-[1.375rem] border border-[var(--wh-border)] bg-[var(--wh-surface)] py-0.5 ps-0.5 pe-3 shadow-[var(--wh-shadow-card)] focus-within:border-[var(--wh-primary)]">
            <button type="button" onClick={() => setAttachOpen(true)} aria-label={labels.attach} title={labels.attach} className={ICON_BUTTON}>
              <Paperclip aria-hidden className="size-[1.125rem]" />
            </button>
            <label className="sr-only" htmlFor="chat-body">{labels.placeholder}</label>
            <textarea
              id="chat-body"
              ref={box}
              value={body}
              aria-controls={trigger ? "chat-picks" : undefined}
              onFocus={() => typing(true)}
              onBlur={() => typing(false)}
              onChange={(event) => {
                setBody(event.target.value);
                setCaret(event.target.selectionStart ?? event.target.value.length);
                setClosedAt(null);
              }}
              onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
              onKeyDown={(event) => {
                if (trigger && event.key === "Escape") {
                  event.preventDefault();
                  setClosedAt(trigger.start);
                  return;
                }
                if (trigger && picks.length > 0 && (event.key === "Enter" || event.key === "Tab") && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  choose(picks[0]!);
                  return;
                }
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  send();
                }
              }}
              rows={1}
              maxLength={4000}
              placeholder={labels.placeholder}
              className="block max-h-36 min-h-9 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-base leading-6 outline-none placeholder:text-[var(--wh-foreground-subtle)]"
            />
          </div>
          <button
            type="button"
            onClick={send}
            disabled={pending || !body.trim()}
            aria-label={pending ? labels.sending : labels.send}
            title={labels.send}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--wh-primary)] text-[var(--wh-primary-foreground)] shadow-[var(--wh-shadow-card)] transition-colors hover:bg-[var(--wh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)] disabled:opacity-50"
          >
            <SendHorizontal aria-hidden className="size-5 rtl:-scale-x-100" />
          </button>
        </div>
        {error ? <p role="alert" className="px-1 text-sm text-[var(--wh-risk)]">{error}</p> : null}
      </div>

      <Sheet open={attachOpen} onOpenChange={setAttachOpen} title={labels.attachTitle} description={labels.attachLede}>
        <div className="space-y-4">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">{labels.attachFromHome}</h3>
            {options.length === 0 ? (
              <p className="text-sm text-[var(--wh-foreground-muted)]">{labels.attachNone}</p>
            ) : (
              <ul className="divide-y divide-[var(--wh-border)] rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)]">
                {options.map((option) => (
                  <li key={`${option.kind}-${option.id}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setAttachment(option);
                        setAttachOpen(false);
                      }}
                      className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left hover:bg-[var(--wh-primary-soft)]/30"
                    >
                      <span className="w-16 shrink-0 text-[0.6875rem] font-semibold text-[var(--wh-foreground-subtle)] uppercase">{option.kindLabel}</span>
                      <span className="min-w-0 flex-1 text-sm break-words">{option.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {pages.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">{labels.attachScreens}</h3>
              <div className="flex flex-wrap gap-2">
                {pages.map((page) => (
                  <button
                    key={page.key}
                    type="button"
                    onClick={() => {
                      setAttachment({ kind: "page", key: page.key, label: page.label, kindLabel: "" });
                      setAttachOpen(false);
                    }}
                    className="min-h-11 rounded-[var(--wh-radius-pill)] border border-[var(--wh-border)] px-3 text-sm whitespace-nowrap hover:bg-[var(--wh-primary-soft)]/30"
                  >
                    {page.label}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </Sheet>

      {kind !== "household" ? (
        <AddPeopleSheet open={addOpen} onOpenChange={setAddOpen} threadId={threadId} canAdd={canAdd} labels={labels} onAdded={() => router.refresh()} />
      ) : null}
    </div>
  );
}

function MessageBubble({
  message,
  threadId,
  labels,
  names,
  showAuthor,
  reactionNames,
  me,
}: {
  message: ThreadMessage;
  threadId: string;
  labels: ThreadLabels;
  names: readonly string[];
  showAuthor: boolean;
  reactionNames: Record<ChatReaction, string>;
  me: string;
}) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [who, setWho] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [pending, startTransition] = useTransition();
  const press = useRef<number | null>(null);
  // A reaction shows the moment it is tapped; the server's answer replaces it.
  const [reactions, setOptimistic] = useOptimistic(message.reactions, (current: ThreadReaction[], mine: ChatReaction | null) => {
    const nameOf = new Map(current.flatMap((entry) => entry.memberIds.map((id, index) => [id, entry.names[index] ?? ""] as const)));
    nameOf.set(me, labels.you);
    return withMyReaction(current, me, mine).map((entry) => ({ ...entry, names: entry.memberIds.map((id) => nameOf.get(id) ?? "") }));
  });
  const myReaction = reactions.find((entry) => entry.mine)?.emoji ?? null;
  const actionable = !message.removed && !editing;

  const save = () =>
    startTransition(async () => {
      const result = await editChatMessageAction({ threadId, messageId: message.id, body: draft });
      if ("ok" in result) {
        setEditing(false);
        router.refresh();
      }
    });
  const takeBack = () =>
    startTransition(async () => {
      setMenu(false);
      const result = await takeBackChatMessageAction({ threadId, messageId: message.id });
      if ("ok" in result) router.refresh();
    });
  const react = (picked: ChatReaction | null) =>
    startTransition(async () => {
      setMenu(false);
      setWho(false);
      setOptimistic(picked);
      const result = await reactToChatMessageAction({ threadId, messageId: message.id, emoji: picked });
      if ("ok" in result) router.refresh();
    });

  // Long-press (a phone), right-click (a computer) or the icon: the same options.
  const cancelPress = () => {
    if (press.current !== null) window.clearTimeout(press.current);
    press.current = null;
  };
  const gestures = actionable
    ? {
        onContextMenu: (event: MouseEvent) => {
          event.preventDefault();
          cancelPress();
          setMenu(true);
        },
        onTouchStart: () => {
          cancelPress();
          press.current = window.setTimeout(() => setMenu(true), LONG_PRESS_MS);
        },
        onTouchEnd: cancelPress,
        onTouchMove: cancelPress,
        onTouchCancel: cancelPress,
      }
    : {};

  const stamp = (
    <>
      {message.edited && !message.removed ? `${labels.edited} · ` : ""}
      {message.at}
    </>
  );
  // The time sits inside the bubble at its bottom corner: an invisible copy
  // keeps room for it at the end of the last line, so it never covers a word.
  const time = (
    <>
      <span aria-hidden className="invisible inline-block ps-2 text-[0.6875rem] whitespace-nowrap">{stamp}</span>
      <span className="absolute end-2 bottom-1 text-[0.6875rem] leading-none whitespace-nowrap text-[var(--wh-foreground-subtle)] tabular-nums">{stamp}</span>
    </>
  );

  const bubble = (
    <div
      {...gestures}
      className={`relative min-w-0 rounded-2xl px-2.5 py-1.5 text-start text-sm leading-snug shadow-[var(--wh-shadow-card)] [-webkit-touch-callout:none] ${
        message.first ? (message.mine ? "rounded-se-md" : "rounded-ss-md") : ""
      } ${
        message.removed
          ? "bg-[var(--wh-surface-muted)] text-[var(--wh-foreground-subtle)] italic"
          : message.mine
            ? "bg-[var(--wh-primary-soft)] text-[var(--wh-foreground)]"
            : "bg-[var(--wh-surface)]"
      }`}
    >
      {showAuthor ? <p className="text-xs font-semibold break-words text-[var(--wh-primary)]">{message.author}</p> : null}
      {!showAuthor ? <span className="sr-only">{message.author}: </span> : null}
      {message.removed ? (
        <p className="break-words">
          {labels.removed}
          {time}
        </p>
      ) : editing ? (
        <div className="space-y-1.5 py-0.5">
          <label className="sr-only" htmlFor={`edit-${message.id}`}>{labels.edit}</label>
          <textarea id={`edit-${message.id}`} value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} maxLength={4000} className="block w-64 max-w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-2 py-1 text-base" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="quiet" onClick={() => { setEditing(false); setDraft(message.body); }}>{labels.cancel}</Button>
            <Button type="button" onClick={save} disabled={pending || !draft.trim()}>{labels.save}</Button>
          </div>
        </div>
      ) : (
        <>
          <p className="whitespace-pre-wrap break-words">
            {piecesOf(message.body, names).map((piece, index) =>
              piece.kind === "text" ? piece.text : (
                <span key={index} className="font-semibold text-[var(--wh-primary)]">{piece.text}</span>
              ),
            )}
            {message.link ? null : time}
          </p>
          {message.link ? (
            <>
              <Link
                href={message.link.path}
                className="mt-1 flex items-center gap-2 rounded-[var(--wh-radius-xs)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-2 py-1 text-start hover:border-[var(--wh-primary)]"
              >
                <span className="min-w-0 flex-1">
                  {message.link.kind ? <span className="block text-[0.625rem] font-semibold text-[var(--wh-foreground-subtle)] uppercase">{message.link.kind}</span> : null}
                  <span className="block font-medium break-words">{message.link.label}</span>
                </span>
                <span className="flex shrink-0 items-center gap-0.5 text-xs font-semibold whitespace-nowrap text-[var(--wh-primary)]">
                  {labels.open} <ArrowUpRight aria-hidden className="size-3.5" />
                </span>
              </Link>
              <p className="h-3.5">{time}</p>
            </>
          ) : null}
        </>
      )}
    </div>
  );

  return (
    <li className={`group flex items-center gap-1 ${message.mine ? "flex-row-reverse" : ""} ${message.last ? "mb-2" : "mb-0.5"}`}>
      <Popover
        open={menu}
        onOpenChange={setMenu}
        label={labels.messageActions}
        toggleId={message.id}
        align={message.mine ? "end" : "start"}
        anchor={
          <div className={`flex max-w-[calc(100%-2.75rem)] min-w-0 flex-col sm:max-w-[75%] ${message.mine ? "items-end" : "items-start"}`}>
            {bubble}
            {reactions.length > 0 && !message.removed ? (
              <Popover
                open={who}
                onOpenChange={setWho}
                label={labels.reactedBy}
                align={message.mine ? "end" : "start"}
                side="bottom"
                trigger={
                  <button
                    type="button"
                    aria-label={`${labels.reactedBy}: ${reactions.map((entry) => `${reactionNames[entry.emoji]} ${entry.count}`).join(", ")}`}
                    className={`relative z-10 -mt-1 mx-2 flex min-h-6 items-center gap-1 rounded-full border border-[var(--wh-border)] bg-[var(--wh-surface)] px-1.5 text-xs leading-none shadow-[var(--wh-shadow-card)] hover:border-[var(--wh-primary)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)] ${myReaction ? "border-[var(--wh-primary)]/40" : ""}`}
                  >
                    {reactions.map((entry) => (
                      <span key={entry.emoji} className="flex items-center gap-0.5">
                        <span aria-hidden>{entry.emoji}</span>
                        <span className="tabular-nums text-[var(--wh-foreground-muted)]">{entry.count}</span>
                      </span>
                    ))}
                  </button>
                }
              >
                <p className="px-2 pt-1 pb-0.5 text-[0.6875rem] font-semibold text-[var(--wh-foreground-subtle)] uppercase">{labels.reactedBy}</p>
                <ul className="min-w-48">
                  {reactions.map((entry) => (
                    <li key={entry.emoji} className="flex items-start gap-2 px-2 py-1 text-sm">
                      <span aria-hidden className="text-base leading-5">{entry.emoji}</span>
                      <span className="sr-only">{reactionNames[entry.emoji]}:</span>
                      <span className="min-w-0 flex-1 break-words">{entry.names.join(", ")}</span>
                    </li>
                  ))}
                </ul>
                {myReaction ? (
                  <button type="button" onClick={() => react(null)} className="mt-0.5 flex min-h-10 w-full items-center gap-2 rounded-[var(--wh-radius-sm)] px-2 text-sm text-[var(--wh-primary)] hover:bg-[var(--wh-surface-muted)]">
                    <X aria-hidden className="size-4" /> {labels.removeReaction}
                  </button>
                ) : null}
              </Popover>
            ) : null}
          </div>
        }
        trigger={
          actionable ? (
            <button
              type="button"
              onClick={() => setMenu((open) => !open)}
              data-popover-toggle={message.id}
              data-state={menu ? "open" : "closed"}
              aria-haspopup="dialog"
              aria-expanded={menu}
              aria-label={labels.messageActions}
              title={labels.messageActions}
              className="grid size-8 shrink-0 place-items-center rounded-full text-[var(--wh-foreground-subtle)] transition hover:bg-[var(--wh-surface-muted)] hover:text-[var(--wh-primary)] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)] data-[state=open]:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 motion-reduce:transition-none">
              <SmilePlus aria-hidden className="size-4" />
            </button>
          ) : undefined
        }
      >
        <ReactionChoices current={myReaction} names={reactionNames} labels={labels} onPick={(emoji) => react(nextReaction(myReaction, emoji))} />
        {message.mine ? (
          <div className="mt-1 border-t border-[var(--wh-border)] pt-1">
            <MenuItem icon={<Pencil aria-hidden className="size-4" />} onClick={() => { setMenu(false); setDraft(message.body); setEditing(true); }}>{labels.edit}</MenuItem>
            <MenuItem icon={<Undo2 aria-hidden className="size-4" />} onClick={takeBack} disabled={pending}>{labels.takeBack}</MenuItem>
          </div>
        ) : null}
      </Popover>
    </li>
  );
}

/** The six reactions, picked never typed (rule 20); the one already chosen is marked, and tapping it takes it away. */
function ReactionChoices({ current, names, labels, onPick }: { current: ChatReaction | null; names: Record<ChatReaction, string>; labels: ThreadLabels; onPick: (emoji: ChatReaction) => void }) {
  return (
    <div role="group" aria-label={labels.react} className="flex items-center gap-0.5">
      {CHAT_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onPick(emoji)}
          aria-pressed={current === emoji}
          aria-label={current === emoji ? `${labels.removeReaction}: ${names[emoji]}` : names[emoji]}
          title={names[emoji]}
          className={`grid size-10 place-items-center rounded-full text-xl transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)] motion-reduce:transition-none motion-reduce:hover:scale-100 ${current === emoji ? "bg-[var(--wh-primary-soft)] ring-1 ring-[var(--wh-primary)]/40" : "hover:bg-[var(--wh-surface-muted)]"}`}
        >
          <span aria-hidden>{emoji}</span>
        </button>
      ))}
    </div>
  );
}

function MenuItem({ icon, children, onClick, disabled = false }: { icon: ReactNode; children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="flex min-h-10 w-full items-center gap-2.5 rounded-[var(--wh-radius-sm)] px-2 text-sm hover:bg-[var(--wh-surface-muted)] disabled:opacity-50">
      <span className="text-[var(--wh-foreground-subtle)]">{icon}</span>
      {children}
    </button>
  );
}

function AddPeopleSheet({
  open,
  onOpenChange,
  threadId,
  canAdd,
  labels,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  threadId: string;
  canAdd: { id: string; name: string }[];
  labels: ThreadLabels;
  onAdded: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const add = () =>
    startTransition(async () => {
      const result = await addChatPeopleAction({ threadId, memberIds: [...picked] });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setPicked(new Set());
      onOpenChange(false);
      onAdded();
    });

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={labels.addPeopleTitle} description={labels.addPeopleLede}>
      {canAdd.length === 0 ? (
        <p className="text-sm text-[var(--wh-foreground-muted)]">{labels.addPeopleNone}</p>
      ) : (
        <div className="space-y-3">
          <ul className="divide-y divide-[var(--wh-border)] rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)]">
            {canAdd.map((person) => (
              <li key={person.id}>
                <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={picked.has(person.id)}
                    onChange={(event) =>
                      setPicked((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(person.id);
                        else next.delete(person.id);
                        return next;
                      })
                    }
                    className="size-5 accent-[var(--wh-primary)]"
                  />
                  <Avatar name={person.name} size="sm" />
                  <span className="min-w-0 flex-1 text-sm break-words">{person.name}</span>
                </label>
              </li>
            ))}
          </ul>
          {error ? <p role="alert" className="text-sm text-[var(--wh-risk)]">{error}</p> : null}
          <Button type="button" onClick={add} disabled={pending || picked.size === 0} className="w-full">
            {labels.add}
          </Button>
        </div>
      )}
    </Sheet>
  );
}

function LeaveButton({ threadId, labels }: { threadId: string; labels: ThreadLabels }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={labels.leave} title={labels.leave} className={ICON_BUTTON}>
        <LogOut aria-hidden className="size-4" />
      </button>
      <ConfirmationSheet
        open={open}
        onOpenChange={setOpen}
        title={labels.leave}
        description={labels.leaveLede}
        confirmLabel={labels.leaveConfirm}
        cancelLabel={labels.cancel}
        destructive
        pending={pending}
        onConfirm={() =>
          startTransition(async () => {
            const result = await leaveChatAction({ threadId });
            if ("ok" in result) router.push("/chat");
          })
        }
      />
    </>
  );
}
