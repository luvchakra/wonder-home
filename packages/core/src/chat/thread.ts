/**
 * How a chat thread reads on screen, WhatsApp-compact (the owner,
 * 2026-10-21): consecutive messages from one person read as one group, a day
 * that changes gets a small separator, and each message's reactions are
 * tallied per emoji. Pure: the page decides the words, this decides the shape.
 */

/** The reactions a person can pick, in the order they are offered and shown (rule 20: picked, never typed). */
export const CHAT_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;
export type ChatReaction = (typeof CHAT_REACTIONS)[number];

/** The catalog word for each reaction, read aloud by a screen reader. */
export const CHAT_REACTION_KEYS = {
  "👍": "thumbsUp",
  "❤️": "heart",
  "😂": "laugh",
  "😮": "wow",
  "😢": "sad",
  "🙏": "thanks",
} as const satisfies Record<ChatReaction, string>;

export function isChatReaction(value: unknown): value is ChatReaction {
  return typeof value === "string" && (CHAT_REACTIONS as readonly string[]).includes(value);
}

/** A run of one person's messages breaks after this long a pause, as well as when someone else speaks or the day changes. */
export const GROUP_GAP_MS = 10 * 60 * 1000;

export type Groupable = { authorMemberId: string; createdAt: string; /** The local day, YYYY-MM-DD, on the household's clock. */ day: string };
export type GroupPlace = { first: boolean; last: boolean; dayStart: boolean };

/** Where each message sits in its run: the first of a run shows its author, the last closes it with a wider gap. */
export function groupMessages(messages: readonly Groupable[]): GroupPlace[] {
  const starts = messages.map((message, index) => {
    const previous = messages[index - 1];
    if (!previous) return { run: true, day: true };
    const day = previous.day !== message.day;
    const pause = Date.parse(message.createdAt) - Date.parse(previous.createdAt) > GROUP_GAP_MS;
    return { run: day || pause || previous.authorMemberId !== message.authorMemberId, day };
  });
  return messages.map((_, index) => ({
    first: starts[index]!.run,
    last: index === messages.length - 1 || starts[index + 1]!.run,
    dayStart: starts[index]!.day,
  }));
}

/** "today", "yesterday", or the day itself, for a day separator. */
export function dayKind(day: string, today: string): "today" | "yesterday" | "date" {
  if (day === today) return "today";
  const yesterday = new Date(`${today}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return yesterday.toISOString().slice(0, 10) === day ? "yesterday" : "date";
}

export type ReactionRow = { memberId: string; emoji: string };
export type ReactionTally = { emoji: ChatReaction; count: number; mine: boolean; memberIds: string[] };

/** Each emoji with how many reacted with it and who, in the offered order; an emoji outside the set is ignored. */
export function tallyReactions(rows: readonly ReactionRow[], me: string): ReactionTally[] {
  const by = new Map<ChatReaction, string[]>();
  for (const row of rows) {
    if (!isChatReaction(row.emoji)) continue;
    const list = by.get(row.emoji) ?? [];
    if (!list.includes(row.memberId)) list.push(row.memberId);
    by.set(row.emoji, list);
  }
  return CHAT_REACTIONS.filter((emoji) => by.has(emoji)).map((emoji) => {
    const memberIds = by.get(emoji)!;
    return { emoji, count: memberIds.length, mine: memberIds.includes(me), memberIds };
  });
}

/** What tapping an emoji does to my reaction: the same one again takes it away, another one changes it. */
export function nextReaction(current: ChatReaction | null, picked: ChatReaction): ChatReaction | null {
  return current === picked ? null : picked;
}

/** The tally as it reads the moment I tap, before the server answers (optimistic). */
export function withMyReaction(tally: readonly ReactionTally[], me: string, mine: ChatReaction | null): ReactionTally[] {
  const rows: ReactionRow[] = tally.flatMap((entry) => entry.memberIds.filter((id) => id !== me).map((memberId) => ({ memberId, emoji: entry.emoji })));
  if (mine) rows.push({ memberId: me, emoji: mine });
  return tallyReactions(rows, me);
}
