"use client";

import { Plus } from "lucide-react";
import { useState, type ComponentType } from "react";

import { IconTile, type IconTone } from "./icon-tile";
import { Pill } from "./pill";
import { Sheet } from "./sheet";

export type AddMenuItem = {
  key: string;
  icon: ComponentType<{ className?: string }>;
  tone: IconTone;
  title: string;
  /** One line of what it is for, so two close-sounding choices are told apart. */
  meta: string;
};

export type AddMenuGroup = { title: string; items: readonly AddMenuItem[] };

/**
 * One "Add" for a screen that can add many kinds of thing (rules 12, 14 and
 * 17; the owner, 2026-10-21: "too many entry options"). A single pill opens a
 * sheet of every kind, grouped by what the person is deciding, each row an
 * icon tile, a name and one line of what it is for. Picking one closes this
 * sheet and hands the key back, so the screen opens that kind's own form —
 * nothing a screen could add before becomes unreachable.
 */
export function AddMenu({
  label,
  title,
  description,
  groups,
  onPick,
}: {
  /** The pill's words: "Add". */
  label: string;
  title: string;
  description?: string;
  groups: readonly AddMenuGroup[];
  onPick: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const visible = groups.filter((group) => group.items.length > 0);
  if (visible.length === 0) return null;
  return (
    <>
      <Pill type="button" tone="primary" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus aria-hidden className="size-3.5" /> {label}
      </Pill>
      <Sheet open={open} onOpenChange={setOpen} title={title} description={description}>
        <div className="space-y-4">
          {visible.map((group) => (
            <section key={group.title}>
              <h3 className="mb-1 text-xs font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{group.title}</h3>
              <ul className="divide-y divide-[var(--wh-border)]">
                {group.items.map((item) => (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        onPick(item.key);
                      }}
                      className="flex min-h-14 w-full items-center gap-3 rounded-[var(--wh-radius-sm)] px-1 py-2 text-start hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]"
                    >
                      <IconTile icon={item.icon} tone={item.tone} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{item.title}</span>
                        <span className="block text-xs text-[var(--wh-foreground-muted)]">{item.meta}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Sheet>
    </>
  );
}
