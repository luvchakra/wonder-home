"use client";

import { ArrowRight, ChevronLeft, ChevronRight, Pencil, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type PointerEvent as ReactPointerEvent } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Card } from "@wonderhome/core/ui/card";
import { CompanionCat } from "@wonderhome/core/ui/companion-cat";
import { CAT_COATS, type CatCoat } from "@wonderhome/core/school/companion";

import { heardSayingAction, nameCompanionAction } from "../(auth)/goal-actions";

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
  /** The arrows either side of "Tell me another", named for a screen reader. */
  previous: string;
  next: string;
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

/**
 * "Show me" lands on what the cat was talking about (the owner, 2026-10-20:
 * "nothing happens when I click on Show me"). The link may name the tab the
 * child is already on, or one still rendering, so the section is looked for
 * until it is there (at most two seconds) and brought into view.
 */
function scrollWhenShown(href: string) {
  const id = href.split("#")[1];
  if (!id) return;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const started = Date.now();
  const look = () => {
    const target = document.getElementById(id);
    if (target) target.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    else if (Date.now() - started < 2000) window.setTimeout(look, 100);
  };
  window.setTimeout(look, 50);
}

export function CompanionCard({
  householdId,
  name,
  coat: savedCoat,
  lines,
  labels,
  visit,
}: {
  householdId: string;
  /** Which tab is open: opening another one moves the cat on to its next line, in the same card. */
  visit?: string;
  name: string | null;
  coat: CatCoat;
  /** A line with `sayingId` is from the sayings list: once shown it is recorded and never shown to this child again. */
  lines: { text: string; href?: string; sayingId?: string }[];
  labels: CompanionCardLabels;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  // Where the child has been this visit, so the left arrow goes back the way they
  // came and the right arrow forward again before it finds a new line (the owner,
  // 2026-10-21: "so that child can traverse back and forth on the quotes").
  const [trail, setTrail] = useState<{ visited: number[]; at: number }>({ visited: [0], at: 0 });
  const [ready, setReady] = useState(false);
  const [naming, setNaming] = useState(name === null);
  const [draft, setDraft] = useState(name ?? "");
  const [shown, setShown] = useState(name);
  const [coat, setCoat] = useState<CatCoat>(savedCoat);
  const [keptCoat, setKeptCoat] = useState<CatCoat>(savedCoat);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Try to touch the cat and it darts away (the owner, 2026-10-21: "if you try
  // to touch the cat, it should quickly move away!"), then strolls back.
  const [dodge, setDodge] = useState<{ x: number; y: number } | null>(null);
  const catSpot = useRef<HTMLSpanElement>(null);
  const comeBack = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(comeBack.current), []);
  const lastFlee = useRef(0);
  const flee = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // One touch can arrive as more than one pointer event; it is one fright.
    if (event.timeStamp - lastFlee.current < 150) return;
    lastFlee.current = event.timeStamp;
    const spot = catSpot.current;
    const seen = spot?.firstElementChild?.getBoundingClientRect();
    // It runs anywhere inside its own card, never off it.
    const arena = spot?.closest(".wh-kid-card")?.getBoundingClientRect();
    if (!spot || !seen || !arena) return;
    // Where it sits at rest: what is on screen less the dodge it is part-way through.
    const moving = new DOMMatrixReadOnly(getComputedStyle(spot).transform === "none" ? undefined : getComputedStyle(spot).transform);
    const top = seen.top - moving.m42;
    const left = seen.left - moving.m41;
    const inset = 6;
    const minY = arena.top + inset - top;
    const maxY = arena.bottom - inset - (top + seen.height);
    const minX = Math.max(-48, arena.left + inset - left);
    const maxX = Math.min(48, arena.right - inset - (left + seen.width));
    // Away from the finger: to the far side of the card from where it came, never past its edge.
    const fromAbove = event.clientY < seen.top + seen.height / 2;
    const fromLeft = event.clientX < seen.left + seen.width / 2;
    const y = fromAbove ? (maxY - moving.m42 > 12 ? maxY : minY) : moving.m42 - minY > 12 ? minY : maxY;
    const x = fromLeft ? Math.max(0, maxX) : Math.min(0, minX);
    setDodge({ x, y: Math.min(maxY, Math.max(minY, y)) });
    window.clearTimeout(comeBack.current);
    comeBack.current = window.setTimeout(() => setDodge(null), 1500);
  };
  // A saying is shown once per child, ever: within a visit, "Tell me another"
  // skips any already shown, and each one shown is recorded on the server.
  const [shownSayings, setShownSayings] = useState<ReadonlySet<string>>(() => new Set());
  const line = lines[index % Math.max(1, lines.length)];
  const skipShown = (from: number) => {
    for (let step = 1; step <= lines.length; step += 1) {
      const next = lines[(from + step) % lines.length];
      if (next && (!next.sayingId || !shownSayings.has(next.sayingId))) return from + step;
    }
    return from + 1;
  };
  const sayingId = ready ? line?.sayingId : undefined;
  useEffect(() => {
    if (!sayingId || shownSayings.has(sayingId)) return;
    // Remembering what was shown has to follow the showing.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShownSayings((seen) => new Set([...seen, sayingId]));
    void heardSayingAction({ householdId, sayingId });
  }, [sayingId, shownSayings, householdId]);

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
    setTrail({ visited: [turn], at: 0 });
    setReady(true);
  }, [visit]);
  const goBack = () => {
    if (trail.at === 0) return;
    const at = trail.at - 1;
    setTrail({ ...trail, at });
    setIndex(trail.visited[at]!);
  };
  // The right arrow retraces a step taken back; "Tell me another" always finds a
  // new line (one job each, rule 14), dropping any steps ahead of where they are.
  const goForward = () => {
    if (trail.at >= trail.visited.length - 1) return;
    const at = trail.at + 1;
    setTrail({ ...trail, at });
    setIndex(trail.visited[at]!);
  };
  const another = () => {
    const next = skipShown(index);
    setTrail({ visited: [...trail.visited.slice(0, trail.at + 1), next], at: trail.at + 1 });
    setIndex(next);
  };
  const arrow =
    "grid size-10 shrink-0 place-items-center rounded-full border border-[var(--wh-border)] bg-[var(--wh-surface)] text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)] disabled:opacity-40";
  const fill = (template: string) =>
    template.replace("{name}", shown ?? labels.noName);

  return (
    <Card className="wh-kid-card overflow-hidden p-4 [--wh-kid-accent:var(--wh-tone-meals)]">
      <div className="flex items-stretch gap-3">
        {/* The cat strolls up and down the empty column beside its words (the
            owner, 2026-10-21: "make the cat move in the empty area"); it sits
            still at the top when the device asks for reduced motion. */}
        <div className="relative min-h-16 w-16 shrink-0 [--wh-cat-size:4rem] sm:min-h-24 sm:w-24 sm:[--wh-cat-size:6rem]">
          <span
            ref={catSpot}
            aria-hidden
            onPointerDown={flee}
            onPointerEnter={(event) => {
              if (event.pointerType === "mouse") flee(event);
            }}
            className="absolute inset-0 z-10 block touch-manipulation motion-reduce:transition-none"
            style={{
              transform: dodge ? `translate(${dodge.x}px, ${dodge.y}px) rotate(${dodge.x >= 0 ? 8 : -8}deg)` : undefined,
              transition: `transform ${dodge ? 140 : 700}ms cubic-bezier(0.2, 0.8, 0.3, 1)`,
            }}
          >
            <CompanionCat
              coat={naming ? coat : keptCoat}
              className={`wh-cat-wander absolute start-0 top-0 size-16 sm:size-24 ${dodge ? "[animation-play-state:paused]" : ""}`}
            />
          </span>
        </div>
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
            </>
          ) : null}
        </div>
      </div>
      {!naming && line ? (
        // Under the cat and its words, across the card: room for both arrows on a phone.
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          {line.href ? (
            <Link
              href={line.href}
              onClick={() => scrollWhenShown(line.href!)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[var(--wh-primary)] px-4 text-sm font-semibold text-[var(--wh-primary-foreground)] hover:bg-[var(--wh-primary-hover)]"
            >
              {labels.show} <ArrowRight aria-hidden className="size-4" />
            </Link>
          ) : null}
          {lines.length > 1 ? (
            <div className="flex items-center gap-1">
              <button type="button" onClick={goBack} disabled={trail.at === 0} aria-label={labels.previous} title={labels.previous} className={arrow}>
                <ChevronLeft aria-hidden className="size-5" />
              </button>
              <button
                type="button"
                onClick={another}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-sm font-semibold whitespace-nowrap text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)]"
              >
                <RefreshCw aria-hidden className="size-4" />{" "}
                {labels.another}
              </button>
              <button type="button" onClick={goForward} disabled={trail.at >= trail.visited.length - 1} aria-label={labels.next} title={labels.next} className={arrow}>
                <ChevronRight aria-hidden className="size-5" />
              </button>
            </div>
          ) : null}
      </div>
      ) : null}
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
