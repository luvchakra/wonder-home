"use client";

import { Info } from "lucide-react";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";

import { cn } from "../../lib/cn";
import { ActionPreview, type ActionPreviewProps } from "./action-preview";
import { Popover } from "./popover";
import { Sheet } from "./sheet";

/**
 * A finished turn's action preview behind a small "i" beside its time (the
 * owner, 2026-10-26: "do not show separate card for action preview, rather
 * show a small i icon left to time, clicking on i should pop up the action
 * preview"). A popover on a desktop, a bottom sheet on a phone; Radix keeps
 * Escape, a tap outside and focus right, and focus goes back to the "i".
 *
 * Only for what is settled. A preview still waiting for a decision keeps its
 * inline card with Confirm and Cancel: a decision is never hidden behind an
 * icon. The icon is small, the tap target 44 px (rule 10).
 */
export function PreviewInfo({
  label,
  preview,
}: {
  /** The button's name for a screen reader ("Details of what WonderHome did"). */
  label: string;
  preview: Omit<ActionPreviewProps, "controls" | "className">;
}) {
  const [open, setOpen] = useState(false);
  const wide = useWide();
  const button = useRef<HTMLButtonElement>(null);

  const change = useCallback((next: boolean) => {
    setOpen(next);
    // Back to the "i" it was opened from, however it closed.
    if (!next) requestAnimationFrame(() => button.current?.focus());
  }, []);

  // On a desktop the popover's own trigger opens and closes it; on a phone this click opens the sheet.
  const trigger = (
    <button
      ref={button}
      type="button"
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={open}
      {...(wide ? {} : { onClick: () => change(true) })}
      className={cn(
        "relative grid size-4 shrink-0 place-items-center rounded-full text-[var(--wh-foreground-subtle)] transition-colors hover:text-[var(--wh-primary)]",
        // 44 px to tap, around a 16 px icon.
        "before:absolute before:-inset-3.5 before:content-['']",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]",
      )}
    >
      <Info aria-hidden className="size-3.5" />
    </button>
  );
  const body = <ActionPreview {...preview} className="border-0 shadow-none" />;

  if (wide) {
    return (
      <Popover open={open} onOpenChange={change} trigger={trigger} label={preview.labels?.title ?? "Action preview"} side="top" align="end" className="w-80 p-0">
        {body}
      </Popover>
    );
  }
  return (
    <>
      {trigger}
      <Sheet open={open} onOpenChange={change} title={preview.labels?.title ?? "Action preview"}>
        <ActionPreview {...preview} className="-mx-4 border-0 shadow-none" />
      </Sheet>
    </>
  );
}

const WIDE = "(min-width: 640px)";

/** Desktop and tablet (the kit's `sm`): a popover; a phone: a sheet. A phone first on the server. */
function useWide(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(WIDE);
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}
