"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { cn } from "@wonderhome/core/lib/cn";

import { setDishTasteAction } from "./taste-actions";

export type DishTasteLabels = { like: string; dislike: string; failed: string };

/**
 * Like and dislike for one dish, for the person looking (the owner,
 * 2026-10-21). Two icon buttons with their names (rule 11); the pressed one
 * is filled and says so to a screen reader (`aria-pressed`). A second tap on
 * the same one takes the taste back. What it writes is the person's own food
 * preference, which meal ideas and HomeBrain already read.
 */
export function DishTaste({ householdId, dish, taste, labels, className }: { householdId: string; dish: string; taste: "like" | "dislike" | null; labels: DishTasteLabels; className?: string }) {
  const router = useRouter();
  const [shown, setShown] = useState(taste);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const choose = (next: "like" | "dislike") => {
    const before = shown;
    setShown(before === next ? null : next);
    setError(null);
    startTransition(async () => {
      const result = await setDishTasteAction({ householdId, dish, taste: next });
      if ("error" in result) {
        setShown(before);
        setError(result.error || labels.failed);
        return;
      }
      setShown(result.taste);
      router.refresh();
    });
  };

  const button = (kind: "like" | "dislike") => {
    const on = shown === kind;
    const Icon = kind === "like" ? ThumbsUp : ThumbsDown;
    const label = kind === "like" ? labels.like : labels.dislike;
    return (
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          choose(kind);
        }}
        disabled={pending}
        aria-pressed={on}
        aria-label={label}
        title={label}
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)] disabled:opacity-60",
          on
            ? kind === "like"
              ? "bg-[var(--wh-handled-soft)] text-[var(--wh-handled)]"
              : "bg-[var(--wh-attention-soft)] text-[var(--wh-attention)]"
            : "text-[var(--wh-foreground-subtle)] hover:bg-[var(--wh-surface-muted)] hover:text-[var(--wh-foreground)]",
        )}
      >
        <Icon aria-hidden className={cn("size-4", on && "fill-current")} />
      </button>
    );
  };

  return (
    <span className={cn("inline-flex shrink-0 flex-col items-end", className)}>
      <span className="inline-flex items-center">
        {button("like")}
        {button("dislike")}
      </span>
      {error ? (
        <span role="alert" className="max-w-[12rem] text-end text-[0.6875rem] text-[var(--wh-risk)]">
          {error}
        </span>
      ) : null}
    </span>
  );
}
