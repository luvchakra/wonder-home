import { Search } from "lucide-react";

import { cn } from "../../lib/cn";

/**
 * The search field in the header. It submits to the AI conversation, because
 * in WonderHome "search" and "ask" are the same thing: typing "Anaya's
 * schedule" should answer, not list documents containing the word.
 */
export function SearchBar({
  placeholder = "Search anything… (e.g. add a task, plan a meal)",
  action = "/ai",
  name = "q",
  className,
}: {
  placeholder?: string;
  action?: string;
  name?: string;
  className?: string;
}) {
  return (
    <form role="search" action={action} method="get" className={cn("relative", className)}>
      <label htmlFor="wh-search" className="sr-only">
        Search or ask WonderHome
      </label>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-[var(--wh-foreground-subtle)]"
      />
      <input
        id="wh-search"
        name={name}
        type="search"
        placeholder={placeholder}
        autoComplete="off"
        className="block h-10 w-full rounded-[var(--wh-radius-pill)] border border-[var(--wh-border)] bg-[var(--wh-surface)] pr-4 pl-10 text-sm shadow-[var(--wh-shadow-card)] placeholder:text-[var(--wh-foreground-subtle)] focus-visible:border-[var(--wh-primary)] focus-visible:outline-none"
      />
    </form>
  );
}
