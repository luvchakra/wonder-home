"use client";

import { ArrowRight, Pencil, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Card } from "@wonderhome/core/ui/card";
import { CompanionCat } from "@wonderhome/core/ui/companion-cat";
import { CAT_COATS, type CatCoat } from "@wonderhome/core/school/companion";

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
  /** The heading over the colours. */
  colour: string;
  /** Each coat's own word: colour alone never says which one it is. */
  coats: Record<CatCoat, string>;
};

/**
 * The child's cat (story 08-018). It says one thing at a time, most useful
 * first — what is new, what is left, a streak to keep — dealt in turn with a
 * fact for their age, a saying and an idea; "Tell me another" moves on, and
 * each time the page or a tab opens the cat starts one line further along
 * (a per-device counter, a convenience only), so it has something new to say
 * and the reminders come back between the fun. Each line arrives already in
 * the child's words from the server (`companionLines`), and a line about
 * another screen offers "Show me". Before it has a name, the cat asks for one,
 * and the child picks its colour there too — each colour a small cat with its
 * word, the big cat trying it on as they pick.
 */
const TURN_KEY = "wh.cat.turn";

export function CompanionCard({
  householdId,
  name,
  coat: savedCoat,
  lines,
  labels,
}: {
  householdId: string;
  name: string | null;
  coat: CatCoat;
  lines: { text: string; href?: string }[];
  labels: CompanionCardLabels;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const [naming, setNaming] = useState(name === null);
  const [draft, setDraft] = useState(name ?? "");
  const [shown, setShown] = useState(name);
  const [coat, setCoat] = useState<CatCoat>(savedCoat);
  const [keptCoat, setKeptCoat] = useState<CatCoat>(savedCoat);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const line = lines[index % Math.max(1, lines.length)];

  // A new line on every visit: this device remembers how many times the cat has spoken.
  useEffect(() => {
    let turn = 0;
    try {
      turn = Number(window.localStorage.getItem(TURN_KEY)) || 0;
      window.localStorage.setItem(TURN_KEY, String(turn + 1));
    } catch {
      turn = Math.floor(Math.random() * 1000);
    }
    // Reading the browser's own storage has to wait for the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIndex(turn);
    setReady(true);
  }, []);
  const fill = (template: string) =>
    template.replace("{name}", shown ?? labels.noName);

  return (
    <Card className="wh-kid-card overflow-hidden p-4 [--wh-kid-accent:var(--wh-tone-meals)]">
      <div className="flex items-start gap-3">
        <CompanionCat
          coat={naming ? coat : keptCoat}
          className="size-20 sm:size-24"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-1">
            <p className="min-w-0 flex-1 text-sm font-bold break-words">
              {shown ? fill(labels.says) : labels.nameMe}
            </p>
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

          {!naming && line ? (
            <>
              <p
                key={index}
                aria-live="polite"
                className={`${ready ? "" : "invisible "}wh-cat-bubble relative rounded-[var(--wh-radius)] bg-[var(--wh-surface)] px-3 py-2 text-sm shadow-[var(--wh-shadow-card)]`}
              >
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
                    <RefreshCw aria-hidden className="size-4" />{" "}
                    {labels.another}
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
      {naming ? (
        <form
          className="mt-3 space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.trim()) return;
            startTransition(async () => {
              const result = await nameCompanionAction({
                householdId,
                name: draft,
                coat,
              });
              if (result.ok) {
                setShown(result.name);
                setDraft(result.name);
                setCoat(result.coat);
                setKeptCoat(result.coat);
                setNaming(false);
                setError(null);
                router.refresh();
              } else setError(result.error);
            });
          }}
        >
          <p className="text-sm text-[var(--wh-foreground-muted)]">
            {labels.nameLede}
          </p>
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
          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 text-sm font-medium">
              {labels.colour}
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {CAT_COATS.map((option) => (
                <label
                  key={option}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-2 py-1 text-sm has-[:checked]:border-[var(--wh-primary)] has-[:checked]:bg-[var(--wh-primary-soft)] has-[:checked]:font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--wh-primary)]"
                >
                  <input
                    type="radio"
                    name="companion-coat"
                    value={option}
                    checked={coat === option}
                    onChange={() => setCoat(option)}
                    className="sr-only"
                  />
                  <CompanionCat coat={option} className="size-8 shrink-0" />
                  <span className="min-w-0 break-words">
                    {labels.coats[option]}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <Button
            type="submit"
            disabled={pending || !draft.trim()}
            className="w-full"
          >
            {pending ? labels.saving : labels.save}
          </Button>
        </form>
      ) : null}
    </Card>
  );
}
