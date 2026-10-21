"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@wonderhome/core/lib/cn";

/** How long a thought stays, and the quiet between thoughts (each a random span). */
const SHOW_MS = 6_000;
const FIRST_MS: [number, number] = [1_200, 3_500];
const QUIET_MS: [number, number] = [5_000, 13_000];

const between = ([low, high]: [number, number]) => low + Math.random() * (high - low);

/**
 * The cat's thought bubble on Home (the owner, 2026-10-21): it comes and goes
 * at random moments, floating up and fading in, then away again, with a new
 * thought each time. A fact from the record is said in a cat's voice (one of
 * `voices`, each with `{fact}`); a passing thought is shown as it is. Under
 * reduced motion it simply shows one thought and stays.
 */
export function CatThoughtBubble({
  facts,
  thoughts,
  voices,
  className,
  trail = "end",
  follow = false,
}: {
  facts: string[];
  thoughts: string[];
  voices: string[];
  className?: string;
  /** Where the little trail of circles goes, towards the cat: down from a corner, or out of the end side. */
  trail?: "start" | "end" | "toward-end";
  /**
   * Finds the cat's head in the header (`data-cat-head`) and sits just above
   * it, moved below the date card (`data-today-card`) when the card is in the
   * way, and kept inside the header.
   */
  follow?: boolean;
}) {
  const [line, setLine] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!follow || !line) return;
    const place = () => {
      const bubble = box.current;
      const header = bubble?.closest("header");
      if (!bubble || !header) return;
      const frame = header.getBoundingClientRect();
      const head = [...header.querySelectorAll("[data-cat-head]")].map((node) => node.getBoundingClientRect()).find((rect) => rect.width > 0);
      if (!head) return;
      const card = header.querySelector("[data-today-card]")?.getBoundingClientRect();
      const words = header.querySelector("[data-hero-words]")?.getBoundingClientRect();
      const width = bubble.offsetWidth;
      const height = bubble.offsetHeight;
      // Spots around the cat's head, nearest first; the first one that covers neither the date card nor the greeting wins.
      const spots = [
        { left: head.left + head.width * 0.55, top: head.top - height - 4 },
        { left: head.right + 6, top: head.top - height * 0.4 },
        { left: head.left - width + head.width * 0.3, top: head.top - height - 4 },
        ...(card ? [{ left: card.left, top: card.bottom + 8 }] : []),
        { left: head.left - width - 6, top: head.top },
      ];
      const hits = (rect: DOMRect | undefined, x: number, y: number) =>
        Boolean(rect && rect.width > 0 && x < rect.right && x + width > rect.left && y < rect.bottom && y + height > rect.top);
      const inside = (x: number, y: number) => x >= frame.left + 8 && x + width <= frame.right - 8 && y >= frame.top + 8 && y + height <= frame.bottom - 8;
      const spot = spots.find(({ left: x, top: y }) => inside(x, y) && !hits(card, x, y) && !hits(words, x, y)) ?? spots[0]!;
      const left = Math.min(Math.max(8, spot.left - frame.left), frame.width - width - 8);
      const top = Math.max(8, Math.min(spot.top - frame.top, frame.height - height - 8));
      bubble.style.left = `${Math.round(left)}px`;
      bubble.style.top = `${Math.round(top)}px`;
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [follow, line]);

  useEffect(() => {
    const said = facts.map((fact, index) => (voices.length > 0 ? voices[index % voices.length]!.replace("{fact}", fact) : fact));
    const lines = [...said, ...thoughts];
    if (lines.length === 0) return;
    const pick = (previous: string | null) => {
      const others = lines.length > 1 ? lines.filter((candidate) => candidate !== previous) : lines;
      // Facts come up more often than passing thoughts.
      const weighted = [...others.filter((candidate) => said.includes(candidate)), ...others];
      return weighted[Math.floor(Math.random() * weighted.length)]!;
    };
    let timer: number;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // One thought, and it stays: shown once the page has settled.
      timer = window.setTimeout(() => {
        setLine(pick(null));
        setShown(true);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    let last: string | null = null;
    const appear = () => {
      last = pick(last);
      setLine(last);
      setShown(true);
      timer = window.setTimeout(fade, SHOW_MS + last.length * 25);
    };
    const fade = () => {
      setShown(false);
      timer = window.setTimeout(appear, between(QUIET_MS));
    };
    timer = window.setTimeout(appear, between(FIRST_MS));
    return () => window.clearTimeout(timer);
  }, [facts, thoughts, voices]);

  if (!line) return null;
  return (
    <div
      ref={box}
      className={cn(
        "relative origin-bottom transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none",
        shown ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-95 opacity-0",
        className,
      )}
    >
      <p className="rounded-[1.25rem] bg-[var(--wh-surface)] px-3 py-2 text-[0.8125rem] leading-snug break-words text-[var(--wh-foreground)] shadow-[var(--wh-shadow-card)]">{line}</p>
      {/* The little trail of a thought, down to the cat. */}
      {trail === "toward-end" ? (
        <>
          <span className="absolute -end-2.5 bottom-3 size-2.5 rounded-full bg-[var(--wh-surface)] shadow-[var(--wh-shadow-card)]" />
          <span className="absolute -end-4.5 bottom-1 size-1.5 rounded-full bg-[var(--wh-surface)] shadow-[var(--wh-shadow-card)]" />
        </>
      ) : (
        <>
          <span className={cn("absolute -bottom-2 size-2.5 rounded-full bg-[var(--wh-surface)] shadow-[var(--wh-shadow-card)]", trail === "end" ? "end-5" : "start-8")} />
          <span className={cn("absolute -bottom-4 size-1.5 rounded-full bg-[var(--wh-surface)] shadow-[var(--wh-shadow-card)]", trail === "end" ? "end-3" : "start-10")} />
        </>
      )}
    </div>
  );
}
