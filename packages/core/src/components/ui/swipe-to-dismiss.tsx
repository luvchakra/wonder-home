"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "../../lib/cn";

/**
 * A row that leaves when swiped left or right (the owner, 2026-10-20: "make
 * item disappear on left or right swipe, show hint by jiggling").
 *
 * The row follows the finger sideways; past a third of its width it slides
 * off and folds away and `onDismiss` runs, otherwise it springs back. A drag
 * that starts mostly up or down is a scroll and is left alone, and a tap on a
 * button inside the row stays a tap. The row claims its own swipe
 * (`data-swipe="own"`), so the swipe between primary areas leaves it be
 * (rule 16). What it does is also a button somewhere in the row — a swipe is
 * a shortcut, never the only way. `hint` gives one small jiggle so the
 * gesture can be found; reduced motion skips the jiggle and the slide.
 */
export function SwipeToDismiss({
  children,
  onDismiss,
  label,
  hint = false,
  as: Tag = "li",
  className,
}: {
  children: ReactNode;
  /** Runs once the row has slid away; resolves false to bring it back (the change did not save). */
  onDismiss: () => Promise<boolean> | boolean;
  /** What a swipe does, shown behind the row as it moves ("Off the list"). */
  label: string;
  /** One jiggle on arrival, so the swipe can be discovered. */
  hint?: boolean;
  as?: "li" | "div";
  className?: string;
}) {
  const [dx, setDx] = useState(0);
  const [gone, setGone] = useState(false);
  const [jiggle, setJiggle] = useState(false);
  const start = useRef<{ x: number; y: number; id: number; width: number; decided: "swipe" | "scroll" | null } | null>(null);
  const moved = useRef(false);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!hint || reduced.current) return;
    const begin = window.setTimeout(() => setJiggle(true), 600);
    const end = window.setTimeout(() => setJiggle(false), 1800);
    return () => {
      window.clearTimeout(begin);
      window.clearTimeout(end);
    };
  }, [hint]);

  const finish = async (direction: number) => {
    setDx(direction * (start.current?.width ?? 400) * 1.1);
    setGone(true);
    const kept = await onDismiss();
    if (kept === false) {
      setGone(false);
      setDx(0);
    }
  };

  return (
    <Tag
      data-swipe="own"
      className={cn("relative overflow-hidden transition-[max-height,opacity] duration-300", gone && "pointer-events-none max-h-0 opacity-0", !gone && "max-h-[60rem]", className)}
    >
      {/* What the swipe does, behind the row, on whichever side it is uncovering. */}
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 flex items-center px-5 text-sm font-semibold text-[var(--wh-foreground-muted)]",
          dx > 0 ? "justify-start" : "justify-end",
          Math.abs(dx) > 8 || jiggle ? "bg-[var(--wh-surface-muted)]" : "bg-transparent",
        )}
      >
        {Math.abs(dx) > 8 || jiggle ? label : null}
      </div>
      <div
        className={cn("relative bg-[var(--wh-surface)] [touch-action:pan-y]", jiggle && "wh-swipe-hint")}
        style={{ transform: `translateX(${dx}px)`, transition: start.current ? "none" : reduced.current ? "none" : "transform 220ms ease-out" }}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;
          start.current = { x: event.clientX, y: event.clientY, id: event.pointerId, width: event.currentTarget.offsetWidth, decided: null };
          moved.current = false;
        }}
        onPointerMove={(event) => {
          const s = start.current;
          if (!s || s.id !== event.pointerId) return;
          const x = event.clientX - s.x;
          const y = event.clientY - s.y;
          if (!s.decided) {
            if (Math.abs(x) < 10 && Math.abs(y) < 10) return;
            s.decided = Math.abs(x) > Math.abs(y) * 1.3 ? "swipe" : "scroll";
            if (s.decided === "swipe") event.currentTarget.setPointerCapture(event.pointerId);
          }
          if (s.decided !== "swipe") return;
          moved.current = true;
          setDx(x);
        }}
        onPointerUp={(event) => {
          const s = start.current;
          start.current = null;
          if (!s || s.decided !== "swipe") return;
          const x = event.clientX - s.x;
          if (Math.abs(x) > s.width / 3) void finish(Math.sign(x));
          else setDx(0);
        }}
        onPointerCancel={() => {
          start.current = null;
          setDx(0);
        }}
        // A swipe is not also a tap on whatever button it started on.
        onClickCapture={(event) => {
          if (moved.current) {
            event.preventDefault();
            event.stopPropagation();
            moved.current = false;
          }
        }}
      >
        {children}
      </div>
    </Tag>
  );
}
