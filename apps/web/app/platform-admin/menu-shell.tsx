"use client";

import { ArrowLeft, Gauge, LayoutDashboard, Link2, Menu, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog } from "radix-ui";
import { useState, type ReactNode } from "react";

import { Wordmark } from "@wonderhome/core/ui/brand";
import { IconTile } from "@wonderhome/core/ui/icon-tile";

import { BACK_TO_APP_HREF, currentPlatformHref, type PlatformMenuIcon, type PlatformMenuItem } from "./menu";

const ICONS: Record<PlatformMenuIcon, LucideIcon> = { overview: LayoutDashboard, performance: Gauge, careers: Link2 };

function Row({ href, label, icon: Icon, tone, current, onNavigate }: {
  href: string;
  label: string;
  icon: LucideIcon;
  tone: PlatformMenuItem["tone"];
  current: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={current ? "page" : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-[var(--wh-radius-sm)] border-l-[3px] px-2.5 text-sm font-medium transition-colors ${
        current
          ? "border-[var(--wh-primary)] bg-[var(--wh-primary-soft)] text-[var(--wh-primary)]"
          : "border-transparent text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)] hover:text-[var(--wh-foreground)]"
      }`}
    >
      <IconTile icon={Icon} tone={tone} size="sm" />
      <span>{label}</span>
    </Link>
  );
}

function MenuBody({ items, role, onNavigate }: { items: readonly PlatformMenuItem[]; role: string; onNavigate?: () => void }) {
  const current = currentPlatformHref(usePathname(), items);
  return (
    <div className="flex h-full flex-col gap-4">
      <Row href={BACK_TO_APP_HREF} label="Back to WonderHome" icon={ArrowLeft} tone="primary" current={false} onNavigate={onNavigate} />
      <div className="px-3">
        <p className="text-base font-semibold tracking-tight">Platform admin</p>
        <p className="text-xs text-[var(--wh-foreground-muted)]">Signed in as {role}</p>
      </div>
      <nav aria-label="Platform admin sections">
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.href}>
              <Row href={item.href} label={item.label} icon={ICONS[item.icon]} tone={item.tone} current={item.href === current} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/** The platform-admin frame: a left sidebar on desktop, a hamburger drawer on a phone. */
export function PlatformMenuShell({ items, role, children }: { items: readonly PlatformMenuItem[]; role: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lg:flex lg:min-h-dvh">
      <aside className="hidden w-64 shrink-0 border-r border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 py-5 lg:block">
        <MenuBody items={items} role={role} />
      </aside>

      <div className="flex items-center gap-2 border-b border-[var(--wh-border)] bg-[var(--wh-surface)] px-2 lg:hidden">
        <button
          type="button"
          aria-label="Open menu"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
          className="grid size-11 shrink-0 place-items-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)]"
        >
          <Menu className="size-5" />
        </button>
        <span className="text-sm font-semibold">Platform admin</span>
      </div>

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
                <button type="button" aria-label="Close menu" className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)]">
                  <X className="size-5" />
                </button>
              </Dialog.Close>
            </div>
            <MenuBody items={items} role={role} onNavigate={() => setOpen(false)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
