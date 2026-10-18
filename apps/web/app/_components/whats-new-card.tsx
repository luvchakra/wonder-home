"use client";

import {
  CalendarDays,
  CalendarHeart,
  ChevronRight,
  Clock3,
  House,
  Languages,
  Lock,
  MapPin,
  MessageCircle,
  PartyPopper,
  PawPrint,
  ShoppingBasket,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { unseenEntries, type WhatsNewIcon } from "@wonderhome/core/help/whats-new";
import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";

const ICON: Record<WhatsNewIcon, { icon: LucideIcon; tone: IconTone }> = {
  calendar: { icon: CalendarDays, tone: "primary" },
  lock: { icon: Lock, tone: "people" },
  holiday: { icon: PartyPopper, tone: "care" },
  places: { icon: MapPin, tone: "home" },
  clock: { icon: Clock3, tone: "school" },
  groceries: { icon: ShoppingBasket, tone: "meals" },
  talk: { icon: MessageCircle, tone: "ai" },
  pets: { icon: PawPrint, tone: "care" },
  event: { icon: CalendarHeart, tone: "people" },
  languages: { icon: Languages, tone: "primary" },
  home: { icon: House, tone: "home" },
};

export type WhatsNewItem = { id: string; at: string; icon: WhatsNewIcon; href: string; title: string; body: string };
/** `showMore[n]` is "Show n more", already pluralised on the server for every count the list can have. */
export type WhatsNewLabels = { title: string; lede: string; dismiss: string; showMore: Record<number, string>; showLess: string };

/** Per-browser memory: when this browser last opened WonderHome, and what this visit is showing. */
const LAST_OPENED = "wh.whatsNew.lastOpenedAt";
const THIS_VISIT = "wh.whatsNew.visit";
const FIRST_SHOWN = 3;

function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}
function write(storage: () => Storage, key: string, value: string): void {
  try {
    storage().setItem(key, value);
  } catch {
    // Private mode or blocked storage: the card simply shows again next time.
  }
}

/**
 * "What's new" at the top of Home: what reached WonderHome since this person
 * last opened it here, each opening the place it lives.
 *
 * Temporary twice over: an entry leaves the list by itself a month after it
 * shipped (`help/whats-new.ts`), and once seen it is not shown again — the
 * next visit only lists what is newer. Within one visit the list holds still,
 * so a refresh does not make it vanish; "Got it" puts it away now.
 *
 * Remembered in this browser only. It is a reading convenience, not a record:
 * a blocked or cleared storage just shows the recent list again, never an
 * error.
 */
export function WhatsNewCard({ items, labels }: { items: readonly WhatsNewItem[]; labels: WhatsNewLabels }) {
  const [shown, setShown] = useState<WhatsNewItem[] | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    const visit = read(() => sessionStorage, THIS_VISIT);
    let since: string | null;
    if (visit === "dismissed") {
      since = new Date().toISOString();
    } else if (visit !== null) {
      since = visit === "first" ? null : visit;
    } else {
      // The first look this visit: remember when the last one was, then move the mark to now.
      since = read(() => localStorage, LAST_OPENED);
      write(() => sessionStorage, THIS_VISIT, since ?? "first");
      write(() => localStorage, LAST_OPENED, new Date().toISOString());
    }
    // Reading the browser's own storage has to wait for the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShown(unseenEntries(items, since));
  }, [items]);

  if (!shown || shown.length === 0) return null;
  const visible = all ? shown : shown.slice(0, FIRST_SHOWN);
  const more = shown.length - FIRST_SHOWN;

  return (
    <section aria-labelledby="whats-new-title" className="wh-rise rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-2 shadow-[var(--wh-shadow-card)]">
      <header className="flex items-start gap-3 px-2 pt-2">
        <IconTile icon={Sparkles} tone="primary" size="sm" />
        <div className="min-w-0 flex-1">
          <h2 id="whats-new-title" className="text-base font-semibold tracking-tight">
            {labels.title}
          </h2>
          <p className="text-xs text-[var(--wh-foreground-muted)]">{labels.lede}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            write(() => sessionStorage, THIS_VISIT, "dismissed");
            setShown([]);
          }}
          className="inline-flex min-h-9 shrink-0 items-center rounded-[var(--wh-radius-pill)] bg-[var(--wh-primary-soft)] px-3 text-xs font-semibold text-[var(--wh-primary)] hover:bg-[var(--wh-primary)] hover:text-[var(--wh-primary-foreground)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]"
        >
          {labels.dismiss}
        </button>
      </header>
      <ul className="mt-1 divide-y divide-[var(--wh-border)]">
        {visible.map((item) => {
          const look = ICON[item.icon];
          return (
            <li key={item.id}>
              <Link href={item.href} className="flex min-h-14 items-center gap-3 rounded-[var(--wh-radius-sm)] px-2 py-2.5 hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]">
                <IconTile icon={look.icon} tone={look.tone} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{item.title}</span>
                  <span className="block text-xs text-[var(--wh-foreground-muted)]">{item.body}</span>
                </span>
                <ChevronRight aria-hidden className="size-4 shrink-0 text-[var(--wh-foreground-subtle)] rtl:rotate-180" />
              </Link>
            </li>
          );
        })}
      </ul>
      {more > 0 ? (
        <button
          type="button"
          onClick={() => setAll((value) => !value)}
          aria-expanded={all}
          className="mt-1 flex min-h-11 w-full items-center justify-center rounded-[var(--wh-radius-sm)] text-sm font-medium text-[var(--wh-primary)] hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]"
        >
          {all ? labels.showLess : labels.showMore[more]}
        </button>
      ) : null}
    </section>
  );
}
