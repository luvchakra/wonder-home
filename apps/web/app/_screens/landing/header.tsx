"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { cn } from "@wonderhome/core/lib/cn";
import { Wordmark } from "@wonderhome/core/ui/brand";
import { ButtonLink } from "@wonderhome/core/ui/button";

const NAV = [
  { href: "#why", label: "Why WonderHome" },
  { href: "#features", label: "Features" },
  { href: "#families", label: "For Families" },
  { href: "#pricing", label: "Pricing" },
  { href: "#security", label: "Security" },
  { href: "#stories", label: "Stories" },
];

/**
 * The guide, kept apart from the list above.
 *
 * Every other item here is an anchor down this page; this one leaves it. It is
 * in the header at all because the guide is the honest answer to most of what
 * a landing page is being asked — what does it actually do, what will it never
 * do without asking — and somebody who wants that should not have to create an
 * account or scroll to the footer to find it. It needs no login.
 */
const GUIDE = { href: "/help", label: "Help" };

/** Translucent, blurred and sticky once the page scrolls (requirements §26). */
export function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-[background,box-shadow] duration-300",
        scrolled || open ? "wh-glass border-b border-[var(--wh-border)]/70 shadow-[0_1px_0_0_var(--wh-border)]" : "bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-[var(--wh-content-wide)] items-center justify-between gap-4 px-4 lg:px-8">
        <a href="#top" aria-label="WonderHome" className="min-w-0 shrink">
          <Wordmark size={32} className="[&_span]:whitespace-nowrap" />
        </a>

        <nav aria-label="Landing" className="hidden lg:block">
          <ul className="flex items-center gap-6 text-[0.8125rem] font-medium text-[var(--wh-foreground-muted)]">
            {NAV.map((item) => (
              <li key={item.href}>
                <a href={item.href} className="transition-colors hover:text-[var(--wh-foreground)]">
                  {item.label}
                </a>
              </li>
            ))}
            <li>
              <Link
                href={GUIDE.href}
                className="font-semibold text-[var(--wh-primary)] transition-colors hover:text-[var(--wh-primary-hover)]"
              >
                {GUIDE.label}
              </Link>
            </li>
          </ul>
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <ButtonLink href="/sign-in" variant="quiet">Sign In</ButtonLink>
          <ButtonLink href="/sign-up" className="rounded-[var(--wh-radius-pill)] px-5">Get Started</ButtonLink>
        </div>

        <div className="flex shrink-0 items-center gap-1 lg:hidden">
          <ButtonLink href="/sign-up" className="min-h-10 rounded-[var(--wh-radius-pill)] px-3.5 text-xs">Get Started</ButtonLink>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="wh-landing-menu"
            onClick={() => setOpen((value) => !value)}
            className="grid size-11 place-items-center rounded-full text-[var(--wh-foreground)] hover:bg-[var(--wh-surface-muted)]"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <nav id="wh-landing-menu" aria-label="Landing" className="border-t border-[var(--wh-border)] px-4 pt-2 pb-4 lg:hidden">
          <ul className="space-y-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <a href={item.href} onClick={() => setOpen(false)} className="block min-h-11 rounded-[var(--wh-radius-sm)] px-3 py-2.5 text-sm font-medium hover:bg-[var(--wh-surface-muted)]">
                  {item.label}
                </a>
              </li>
            ))}
            <li>
              <Link
                href={GUIDE.href}
                onClick={() => setOpen(false)}
                className="block min-h-11 rounded-[var(--wh-radius-sm)] px-3 py-2.5 text-sm font-semibold text-[var(--wh-primary)] hover:bg-[var(--wh-surface-muted)]"
              >
                {GUIDE.label}
              </Link>
            </li>
            <li className="pt-2">
              <ButtonLink href="/sign-in" variant="secondary" className="w-full">Sign In</ButtonLink>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
