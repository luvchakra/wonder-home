"use client";

import { ArrowRight, Pencil, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Card } from "@wonderhome/core/ui/card";
import { CompanionCat } from "@wonderhome/core/ui/companion-cat";

import { nameCompanionAction } from "../(auth)/goal-actions";

export type CompanionCardLabels = {
  /** `{name}` is the cat's own name. */
  says: string;
  noName: string;
  nameMe: string;
  nameLede: string;
  nameField: string;
  namePlaceholder: string;
  save: string;
  saving: string;
  rename: string;
  another: string;
  show: string;
};

/**
 * The child's cat (story 08-018). It says one thing at a time, most useful
 * first — what is new, what is left, a streak to keep — then a saying and an
 * idea of the day; "Tell me another" moves on. Each line arrives already in
 * the child's words from the server (`companionLines`), and a line about
 * another screen offers "Show me". Before it has a name, the cat asks for one.
 */
export function CompanionCard({
  householdId,
  name,
  lines,
  labels,
}: {
  householdId: string;
  name: string | null;
  lines: { text: string; href?: string }[];
  labels: CompanionCardLabels;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [naming, setNaming] = useState(name === null);
  const [draft, setDraft] = useState(name ?? "");
  const [shown, setShown] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const line = lines[index % Math.max(1, lines.length)];
  const fill = (template: string) => template.replace("{name}", shown ?? labels.noName);

  return (
    <Card className="wh-kid-card overflow-hidden p-4 [--wh-kid-accent:var(--wh-tone-meals)]">
      <div className="flex items-start gap-3">
        <CompanionCat className="size-20 sm:size-24" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-1">
            <p className="min-w-0 flex-1 text-sm font-bold break-words">{shown ? fill(labels.says) : labels.nameMe}</p>
            {shown && !naming ? (
              <button
                type="button"
                onClick={() => setNaming(true)}
                aria-label={fill(labels.rename)}
                title={fill(labels.rename)}
                className="grid size-11 shrink-0 place-items-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]"
              >
                <Pencil aria-hidden className="size-4" />
              </button>
            ) : null}
          </div>

          {naming ? (
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!draft.trim()) return;
                startTransition(async () => {
                  const result = await nameCompanionAction({ householdId, name: draft });
                  if (result.ok) {
                    setShown(result.name);
                    setDraft(result.name);
                    setNaming(false);
                    setError(null);
                    router.refresh();
                  } else setError(result.error);
                });
              }}
            >
              <p className="text-sm text-[var(--wh-foreground-muted)]">{labels.nameLede}</p>
              {error ? <Alert>{error}</Alert> : null}
              <label htmlFor="companion-name" className="block text-sm font-medium">
                {labels.nameField}
              </label>
              <input
                id="companion-name"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={24}
                autoComplete="off"
                placeholder={labels.namePlaceholder}
                className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
              />
              <Button type="submit" disabled={pending || !draft.trim()} className="w-full">
                {pending ? labels.saving : labels.save}
              </Button>
            </form>
          ) : line ? (
            <>
              <p key={index} aria-live="polite" className="wh-cat-bubble relative rounded-[var(--wh-radius)] bg-[var(--wh-surface)] px-3 py-2 text-sm shadow-[var(--wh-shadow-card)]">
                {line.text}
              </p>
              <div className="flex flex-wrap gap-2">
                {line.href ? (
                  <Link
                    href={line.href}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[var(--wh-primary)] px-4 text-sm font-semibold text-[var(--wh-primary-foreground)] hover:bg-[var(--wh-primary-hover)]"
                  >
                    {labels.show} <ArrowRight aria-hidden className="size-4" />
                  </Link>
                ) : null}
                {lines.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setIndex((value) => value + 1)}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[var(--wh-border)] bg-[var(--wh-surface)] px-4 text-sm font-semibold text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)]"
                  >
                    <RefreshCw aria-hidden className="size-4" /> {labels.another}
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
