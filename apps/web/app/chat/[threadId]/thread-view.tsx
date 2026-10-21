"use client";

import { ArrowUpRight, Info, LogOut, MoreHorizontal, Paperclip, SendHorizontal, UserPlus, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { activeTrigger, normaliseTag, piecesOf, replaceTrigger, type Mentionable } from "@wonderhome/core/chat/composer";
import { Avatar } from "@wonderhome/core/ui/avatar";
import { Button } from "@wonderhome/core/ui/button";
import { Card } from "@wonderhome/core/ui/card";
import { ConfirmationSheet, Sheet } from "@wonderhome/core/ui/sheet";

import { addChatPeopleAction, editChatMessageAction, leaveChatAction, sendChatMessageAction, takeBackChatMessageAction } from "../actions";

export type ThreadMessage = {
  id: string;
  mine: boolean;
  author: string;
  body: string;
  at: string;
  edited: boolean;
  removed: boolean;
  link: { path: string; label: string; kind: string } | null;
};

export type ThreadLabels = Record<
  | "placeholder" | "send" | "sending" | "failed" | "attach" | "attachTitle" | "attachLede" | "attachFromHome" | "attachScreens" | "attachNone" | "attachRemove"
  | "open" | "edited" | "removed" | "edit" | "takeBack" | "save" | "cancel" | "messageActions"
  | "people" | "addPeople" | "addPeopleTitle" | "addPeopleLede" | "addPeopleNone" | "add" | "leave" | "leaveLede" | "leaveConfirm" | "empty" | "you"
  | "pickAttach" | "pickMention" | "pickTag" | "pickNone" | "newTag" | "helper" | "pet",
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

/**
 * A chat on screen (story 12-015): the messages, the composer with its
 * Attach sheet, and — for a direct or group chat — who is in it, Add people
 * and Leave. Every write is a server action that checks again; after one,
 * the page is read again from the server, never patched in the browser.
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
  /** Who in this chat has not signed in yet, said once, so a message to them is never assumed read. */
  /** A short note above the message box (the owner, 2026-10-21): who reads this chat, the paperclip, and who reads it once they sign in. */
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
    end.current?.scrollIntoView({ block: "end" });
  }, [lastId]);

  // Others' new messages, while the chat is on screen.
  useEffect(() => {
    const tick = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(tick);
  }, [router]);

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
    <div className="space-y-4">
      <header className="wh-rise flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
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

      <ol className="space-y-3" aria-live="polite">
        {messages.length === 0 ? (
          <li>
            <Card className="p-4 text-sm text-[var(--wh-foreground-muted)]">{labels.empty}</Card>
          </li>
        ) : (
          messages.map((message) => <MessageBubble key={message.id} message={message} threadId={threadId} labels={labels} names={names} />)
        )}
      </ol>

      <div ref={end} className="scroll-mb-28 space-y-2">
        {notice && notice.length > 0 ? (
          <ul className="space-y-0.5 px-1 text-xs break-words text-[var(--wh-foreground-subtle)]">
            {notice.map((line) => (
              <li key={line} className="flex gap-1.5">
                <Info aria-hidden className="mt-0.5 size-3 shrink-0" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <Card className="space-y-2 p-3">
          {attachment ? (
            <div className="flex items-center gap-2 rounded-[var(--wh-radius-sm)] bg-[var(--wh-primary-soft)]/50 px-3 py-2 text-sm">
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
            <div id="chat-picks" className="rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)]">
              <p className="px-3 pt-2 text-[0.6875rem] font-semibold text-[var(--wh-foreground-subtle)] uppercase">
                {trigger.char === "/" ? labels.pickAttach : trigger.char === "@" ? labels.pickMention : labels.pickTag}
              </p>
              {picks.length === 0 ? (
                <p className="px-3 pt-1 pb-2 text-sm text-[var(--wh-foreground-muted)]">{labels.pickNone}</p>
              ) : (
                <ul className="max-h-56 overflow-y-auto py-1">
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
          <label className="sr-only" htmlFor="chat-body">{labels.placeholder}</label>
          <textarea
            id="chat-body"
            ref={box}
            value={body}
            aria-controls={trigger ? "chat-picks" : undefined}
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
            rows={2}
            maxLength={4000}
            placeholder={labels.placeholder}
            className="block w-full resize-y rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 py-2 text-base"
          />
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => setAttachOpen(true)} aria-label={labels.attach} title={labels.attach} className={ICON_BUTTON}>
              <Paperclip aria-hidden className="size-4" />
            </button>
            {error ? <p role="alert" className="min-w-0 flex-1 text-sm text-[var(--wh-risk)]">{error}</p> : null}
            <Button type="button" onClick={send} disabled={pending || !body.trim()} className="gap-1.5">
              <SendHorizontal aria-hidden className="size-4" /> {pending ? labels.sending : labels.send}
            </Button>
          </div>
        </Card>
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

function MessageBubble({ message, threadId, labels, names }: { message: ThreadMessage; threadId: string; labels: ThreadLabels; names: readonly string[] }) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [pending, startTransition] = useTransition();

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
      const result = await takeBackChatMessageAction({ threadId, messageId: message.id });
      if ("ok" in result) router.refresh();
    });

  return (
    <li className={`flex gap-2 ${message.mine ? "flex-row-reverse" : ""}`}>
      {!message.mine ? <Avatar name={message.author || "?"} size="sm" className="mt-5" /> : null}
      <div className={`min-w-0 max-w-[85%] space-y-1 ${message.mine ? "items-end text-end" : ""}`}>
        <p className="text-xs text-[var(--wh-foreground-subtle)]">
          <span className="font-medium text-[var(--wh-foreground-muted)]">{message.author}</span> · <span className="tabular-nums">{message.at}</span>
          {message.edited && !message.removed ? ` · ${labels.edited}` : ""}
        </p>
        <div
          className={`inline-block rounded-[var(--wh-radius)] px-3 py-2 text-start text-sm shadow-[var(--wh-shadow-card)] ${
            message.removed
              ? "bg-[var(--wh-surface-muted)] text-[var(--wh-foreground-subtle)] italic"
              : message.mine
                ? "bg-[var(--wh-primary-soft)] text-[var(--wh-foreground)]"
                : "bg-[var(--wh-surface)]"
          }`}
        >
          {message.removed ? (
            labels.removed
          ) : editing ? (
            <div className="space-y-2">
              <label className="sr-only" htmlFor={`edit-${message.id}`}>{labels.edit}</label>
              <textarea id={`edit-${message.id}`} value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} maxLength={4000} className="block w-64 max-w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-2 py-1 text-base" />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="quiet" onClick={() => { setEditing(false); setDraft(message.body); }}>{labels.cancel}</Button>
                <Button type="button" onClick={save} disabled={pending || !draft.trim()}>{labels.save}</Button>
              </div>
            </div>
          ) : (
            <p className="whitespace-pre-wrap break-words">
              {piecesOf(message.body, names).map((piece, index) =>
                piece.kind === "text" ? piece.text : (
                  <span key={index} className="font-semibold text-[var(--wh-primary)]">{piece.text}</span>
                ),
              )}
            </p>
          )}
          {message.link && !message.removed && !editing ? (
            <Link
              href={message.link.path}
              className="mt-2 flex items-center gap-2 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 py-2 text-start hover:border-[var(--wh-primary)]"
            >
              <span className="min-w-0 flex-1">
                {message.link.kind ? <span className="block text-[0.6875rem] font-semibold text-[var(--wh-foreground-subtle)] uppercase">{message.link.kind}</span> : null}
                <span className="block font-medium break-words">{message.link.label}</span>
              </span>
              <span className="flex shrink-0 items-center gap-0.5 text-xs font-semibold whitespace-nowrap text-[var(--wh-primary)]">
                {labels.open} <ArrowUpRight aria-hidden className="size-3.5" />
              </span>
            </Link>
          ) : null}
        </div>
        {message.mine && !message.removed && !editing ? (
          <div className="flex justify-end">
            {menu ? (
              <div className="flex items-center gap-1">
                <Button type="button" variant="quiet" onClick={() => { setMenu(false); setEditing(true); }}>{labels.edit}</Button>
                <Button type="button" variant="quiet" onClick={takeBack} disabled={pending}>{labels.takeBack}</Button>
                <button type="button" onClick={() => setMenu(false)} aria-label={labels.cancel} title={labels.cancel} className={ICON_BUTTON}>
                  <X aria-hidden className="size-4" />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setMenu(true)} aria-label={labels.messageActions} title={labels.messageActions} className={ICON_BUTTON}>
                <MoreHorizontal aria-hidden className="size-4" />
              </button>
            )}
          </div>
        ) : null}
      </div>
    </li>
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
