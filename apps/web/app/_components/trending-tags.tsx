import { Hash } from "lucide-react";
import Link from "next/link";

import { trendingTags } from "@wonderhome/core/chat/composer";
import { recentTaggedMessages } from "@wonderhome/core/chat/repository";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";

import type { Session } from "../_lib/session";

/** How far back a tag counts for "Trending at home", in days. */
const WEEK = 7;

/**
 * "Trending at home" (the owner, 2026-10-21: "# can be used to make a term
 * trending within the app. the trending words can be listed in home page"):
 * the #tags used most this week in the chats this person can read, each a
 * count of messages and a way into the chat it was last used in. Read through
 * the person's own session, so a tag from a chat they are not in never shows
 * here. Nothing is shown when nobody has tagged anything.
 */
export async function TrendingTags({ session, now }: { session: Session; now: Date }) {
  if (!session.chatOn) return null;
  const { supabase, membership, locale } = session;
  const { t } = locale;
  const messages = await recentTaggedMessages(supabase, membership.household.id, WEEK, now).catch(() => []);
  const trending = trendingTags(messages, 6);
  if (trending.length === 0) return null;
  return (
    // Compact (the owner, 2026-10-22): small chips that sit several to a line,
    // so the card stays short however many tags are trending.
    <Card className="space-y-2 p-3">
      <div className="flex items-center gap-2.5">
        <IconTile icon={Hash} tone="people" size="sm" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm leading-tight font-semibold">{t("chat.trending.title")}</h2>
          <p className="text-xs leading-snug text-[var(--wh-foreground-muted)]">{t("chat.trending.lede")}</p>
        </div>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {trending.map((entry) => (
          <li key={entry.tag}>
            <Link
              href={`/chat/${entry.threadId}`}
              className="inline-flex min-h-8 items-center gap-1 rounded-[var(--wh-radius-pill)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-2.5 text-xs hover:border-[var(--wh-primary)]"
            >
              <span className="font-semibold break-all text-[var(--wh-primary)]">#{entry.tag}</span>
              <span className="text-[0.6875rem] whitespace-nowrap text-[var(--wh-foreground-subtle)]">{t("chat.trending.uses", { count: entry.count })}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
