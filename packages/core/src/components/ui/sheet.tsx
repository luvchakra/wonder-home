"use client";

import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { cn } from "../../lib/cn";
import { Button } from "./button";

/**
 * A sheet: rises from the bottom on a phone, sits centred on a desktop.
 *
 * Radix owns focus, escape, scroll locking and the accessible naming, which are
 * the parts a hand-rolled dialog gets wrong. Every sheet has a real title —
 * a dialog with no name is unusable with a screen reader.
 */
export type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

/**
 * How much of the layout the on-screen keyboard covers, in px. Android
 * Chrome resizes the layout for the keyboard itself (the root layout's
 * `interactiveWidget: "resizes-content"`), so this stays 0 there and the
 * sheet rises with the keyboard in one native motion. iOS shrinks only the
 * visual viewport, so a sheet fixed to the bottom would sit behind it: the
 * sheet rises by this much instead, measured once per frame and only when it
 * moves by more than a few pixels, with no CSS transition of its own — two
 * animations chasing each other is what made opening a field flicker.
 */
function useKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const viewport = typeof window === "undefined" ? undefined : window.visualViewport;
    if (!active || !viewport) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const next = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
      setInset((current) => (Math.abs(current - next) < 8 ? current : next));
    };
    const update = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      setInset(0);
    };
  }, [active]);
  return inset;
}

/** A phone or tablet, where focusing a field opens the on-screen keyboard. */
function touchFirst(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
}

const FIELD = "input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable=true]";

/** Brings the field being typed in to the middle of what is still visible, once the keyboard has settled. */
function revealField(element: Element | null) {
  if (!(element instanceof HTMLElement) || !element.matches(FIELD)) return;
  // A field with its list open is kept in view by the list itself (keep-in-view.ts); a second scroll here is the flicker.
  if (element.getAttribute("aria-expanded") === "true") return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
}

export function Sheet({ open, onOpenChange, title, description, children, className }: SheetProps) {
  const keyboard = useKeyboardInset(open);
  const contentRef = useRef<HTMLDivElement>(null);
  // When the keyboard finishes opening (or the sheet finishes rising to it), the field in use is brought into view.
  useEffect(() => {
    if (!open || keyboard === 0) return;
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active && contentRef.current?.contains(active)) revealField(active);
    });
    return () => cancelAnimationFrame(frame);
  }, [open, keyboard]);
  // Only on a phone, where the sheet is anchored to the bottom (sm: centres it).
  const lifted: CSSProperties | undefined =
    keyboard > 0 ? ({ "--wh-keyboard": `${keyboard}px` } as CSSProperties) : undefined;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[oklch(0.27_0.05_255/0.35)] backdrop-blur-[2px] data-[state=open]:animate-[wh-rise_var(--wh-duration)_var(--wh-ease)]" />
        <Dialog.Content
          ref={contentRef}
          style={lifted}
          // On a phone the sheet opens without focusing a field, so the keyboard waits for a tap instead of
          // rising with the sheet; focus goes to the sheet itself, which a screen reader announces.
          onOpenAutoFocus={(event) => {
            if (!touchFirst()) return;
            event.preventDefault();
            contentRef.current?.focus();
          }}
          // A field tapped while the keyboard is already up, or on Android where the layout resizes, is
          // brought into view once the keyboard has had time to settle.
          onFocusCapture={(event) => {
            if (!touchFirst()) return;
            const target = event.target;
            window.setTimeout(() => revealField(target), 320);
          }}
          className={cn(
            "fixed z-50 flex max-h-[calc(92dvh-var(--wh-keyboard,0px))] flex-col bg-[var(--wh-surface)] shadow-[var(--wh-shadow-float)] outline-none",
            "inset-x-0 bottom-[var(--wh-keyboard,0px)] rounded-t-[var(--wh-radius-lg)] pb-[env(safe-area-inset-bottom)]",
            "sm:inset-auto sm:max-h-[92dvh] sm:top-1/2 sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[var(--wh-radius-lg)]",
            "data-[state=open]:animate-[wh-rise_var(--wh-duration)_var(--wh-ease)]",
            className,
          )}
        >
          <div aria-hidden className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-[var(--wh-border-strong)] sm:hidden" />
          <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-semibold tracking-tight">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close asChild>
              <Button variant="quiet" aria-label="Close" className="-mr-2 size-11 rounded-full px-0">
                <X className="size-5" />
              </Button>
            </Dialog.Close>
          </div>
          <div className="overflow-y-auto px-5 pt-1 pb-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * A yes/no question, with the consequence spelled out before the buttons.
 * The dangerous choice is never the default focus and never the primary colour.
 */
export function ConfirmationSheet({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  pending = false,
  onConfirm,
  children,
}: Omit<SheetProps, "children"> & {
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} description={description}>
      {children}
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Dialog.Close asChild>
          <Button variant="secondary">{cancelLabel}</Button>
        </Dialog.Close>
        <Button
          onClick={onConfirm}
          disabled={pending}
          className={cn(destructive && "bg-[var(--wh-risk)] hover:bg-[var(--wh-risk)]/90")}
        >
          {pending ? "Working…" : confirmLabel}
        </Button>
      </div>
    </Sheet>
  );
}
