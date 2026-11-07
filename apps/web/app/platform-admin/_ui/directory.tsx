import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";
import { PAGE_SIZE } from "@wonderhome/core/platform/directory";

const IST = "Asia/Kolkata";
export function day(iso: string | null): string {
  return iso ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: IST }).format(new Date(iso)) : "Never";
}
export function when(iso: string | null): string {
  return iso ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: IST }).format(new Date(iso)) : "Never";
}

export function BackLink({ href = "/platform-admin/households", label = "Households & people" }: { href?: string; label?: string }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-[var(--wh-primary)]">
      <ChevronLeft aria-hidden className="size-4" /> Back to {label}
    </Link>
  );
}

/** A GET search form: no JavaScript, the filters live in the address. */
export function SearchBar({ q, placeholder, hidden }: { q: string; placeholder: string; hidden?: Record<string, string> }) {
  return (
    <form method="get" className="flex gap-2">
      {Object.entries(hidden ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <input name="q" defaultValue={q} placeholder={placeholder} aria-label={placeholder} className="min-h-11 min-w-0 flex-1 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-sm" />
      <button className="min-h-11 rounded-[var(--wh-radius-sm)] bg-[var(--wh-primary)] px-4 text-sm font-semibold text-white">Search</button>
    </form>
  );
}

export function Pager({ base, params, page, total }: { base: string; params: Record<string, string>; page: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => {
    const sp = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `${base}?${qs}` : base;
  };
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3 text-sm">
      {page > 1 ? <Link href={href(page - 1)} className="inline-flex min-h-11 items-center gap-1 font-medium text-[var(--wh-primary)]"><ChevronLeft aria-hidden className="size-4" />Previous</Link> : <span />}
      <span className="text-[var(--wh-foreground-muted)]">Page {page} of {pages} · {total} in all</span>
      {page < pages ? <Link href={href(page + 1)} className="inline-flex min-h-11 items-center gap-1 font-medium text-[var(--wh-primary)]">Next<ChevronRight aria-hidden className="size-4" /></Link> : <span />}
    </nav>
  );
}

/** One row: tinted tile, the name in full, one line of reason, the thing to do (rule 4). */
export function DirectoryRow({ href, icon, tone, name, line, aside }: { href?: string; icon: Parameters<typeof IconTile>[0]["icon"]; tone: IconTone; name: string; line: ReactNode; aside?: ReactNode }) {
  const body = (
    <>
      <IconTile icon={icon} tone={tone} />
      <span className="min-w-0 flex-1">
        <span className="block break-words font-semibold">{name}</span>
        <span className="block break-words text-sm text-[var(--wh-foreground-muted)]">{line}</span>
      </span>
      {aside}
      {href ? <ChevronRight aria-hidden className="size-4 shrink-0 text-[var(--wh-foreground-subtle)]" /> : null}
    </>
  );
  const cls = "flex min-h-14 items-center gap-3 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] px-3 py-2";
  return href ? <Link href={href} className={`${cls} hover:bg-[var(--wh-primary-soft)]`}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function pageNumber(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(n) && n >= 1 && n <= 10_000 ? n : 1;
}
