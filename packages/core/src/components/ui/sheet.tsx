"use client";

import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

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
 * How much of the layout the on-screen keyboard covers, in px. A phone browser
 * shrinks only the visual viewport when the keyboard opens, so a sheet fixed
 * to the bottom would sit behind it; the sheet rises by this much instead, and
 * its height is held to what is still visible.
 */
function useKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const viewport = typeof window === "undefined" ? undefined : window.visualViewport;
    if (!active || !viewport) return;
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)));
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      setInset(0);
    };
  }, [active]);
  return inset;
}

export function Sheet({ open, onOpenChange, title, description, children, className }: SheetProps) {
  const keyboard = useKeyboardInset(open);
  // Only on a phone, where the sheet is anchored to the bottom (sm: centres it).
  const lifted: CSSProperties | undefined =
    keyboard > 0 ? ({ "--wh-keyboard": `${keyboard}px` } as CSSProperties) : undefined;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[oklch(0.27_0.05_255/0.35)] backdrop-blur-[2px] data-[state=open]:animate-[wh-rise_var(--wh-duration)_var(--wh-ease)]" />
        <Dialog.Content
          style={lifted}
          className={cn(
            "fixed z-50 flex max-h-[calc(92dvh-var(--wh-keyboard,0px))] flex-col bg-[var(--wh-surface)] shadow-[var(--wh-shadow-float)] outline-none",
            "inset-x-0 bottom-[var(--wh-keyboard,0px)] rounded-t-[var(--wh-radius-lg)] pb-[env(safe-area-inset-bottom)] transition-[bottom] duration-150 motion-reduce:transition-none",
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
