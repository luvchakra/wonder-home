"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { Dialog } from "radix-ui";

import { Wordmark } from "@wonderhome/core/ui/brand";

import { BACK_TO_APP_HREF, type PlatformMenuItem } from "./menu";
import { MenuBody } from "./menu-shell";

/** The phone drawer, in a module of its own so Radix Dialog loads on the first tap. */
export default function MenuDrawer({
  open,
  onOpenChange,
  items,
  role,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: readonly PlatformMenuItem[];
  role: string;
}) {
  const setOpen = onOpenChange;
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="wh-rise fixed inset-0 z-50 bg-[oklch(0.27_0.05_255/0.35)] backdrop-blur-[2px]" />
        <Dialog.Content className="wh-slide-in-left fixed inset-y-0 left-0 z-50 flex h-dvh w-[min(20rem,85vw)] flex-col gap-4 overflow-y-auto bg-[var(--wh-surface)] px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-[env(safe-area-inset-bottom)] shadow-[var(--wh-shadow-float)] outline-none">
          <Dialog.Title className="sr-only">Platform admin menu</Dialog.Title>
          <div className="flex items-start justify-between gap-2 px-1">
            <Link href={BACK_TO_APP_HREF} onClick={() => setOpen(false)}>
              <Wordmark />
            </Link>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close menu"
                className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)]"
              >
                <X className="size-5" />
              </button>
            </Dialog.Close>
          </div>
          <MenuBody
            items={items}
            role={role}
            onNavigate={() => setOpen(false)}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
