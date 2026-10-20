"use client";

import { Minus, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { roundQuantity, unitInfo } from "@wonderhome/core/commerce/units";
import { stepAlong } from "@wonderhome/core/commerce/buying-sizes";

import { changeStockAction } from "../../(auth)/grocery-actions";
import type { GroceryWords } from "../../_lib/grocery-words";
import { fill, newKey, sayAmount } from "./amounts";
import { AmountSheet, type StepperItem } from "./to-buy-stepper";

/** Long enough for a few quick taps to become one write; short enough to feel saved. */
const SETTLE_MS = 450;

/**
 * `− 1 kg +` for what is at home, right on the list (the owner, 2026-10-20).
 *
 * The same shape as the to-buy stepper beside it, stepping along the same
 * ladder. Taps settle into one "set" of what is at home now — a person
 * saying how much there is, recorded as `stated`, the same write as
 * "Update stock" on the item's page. The middle opens a sheet to type any
 * amount. Nothing counted yet shows a dash, and + starts at the usual buy.
 * Every change is announced; a failure says so and puts the last saved
 * amount back, and a change somebody else made meanwhile shows theirs.
 */
export function StockStepper({
  householdId,
  item,
  initial,
  words,
}: {
  householdId: string;
  item: StepperItem;
  /** In base units; null when nobody has counted it yet. */
  initial: number | null;
  words: Pick<GroceryWords, "language" | "unitWords" | "unitNames" | "stepper" | "stockStepper" | "amountSheet">;
}) {
  const router = useRouter();
  const base = unitInfo(item.unit).base;
  const [quantity, setQuantity] = useState<number | null>(initial);
  const saved = useRef<number | null>(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const stockWords = words.stockStepper;
  const announce = (value: number) =>
    setAnnouncement(
      value > 0
        ? fill(stockWords.now, { name: item.name, amount: sayAmount(words, { quantity: value, unit: base }, item.unit) })
        : fill(stockWords.none, { name: item.name }),
    );

  const save = async (value: number): Promise<string | null> => {
    const result = await changeStockAction({ householdId, itemId: item.id, kind: "set", quantity: value, unit: base, key: newKey("stock") });
    if (!result.ok) {
      setQuantity(saved.current);
      if (saved.current !== null) announce(saved.current);
      setError(fill(words.stepper.failed, { reason: result.error }));
      return result.error;
    }
    setError(result.conflict ? words.stepper.conflict : null);
    saved.current = result.after;
    setQuantity(result.after);
    announce(result.after);
    // The status bar and the counts above follow what is at home.
    router.refresh();
    return null;
  };

  const nudge = (direction: 1 | -1) => {
    const current = quantity ?? 0;
    const next =
      quantity === null || (current <= 0 && direction === 1)
        ? direction === 1
          ? item.start
          : 0
        : Math.max(0, roundQuantity(stepAlong(item.ladder, current, direction)));
    if (next === quantity) return;
    setQuantity(next);
    announce(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void save(next);
    }, SETTLE_MS);
  };

  const button =
    "grid size-9 place-items-center rounded-full border border-[var(--wh-border)] bg-[var(--wh-surface)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)] disabled:opacity-40";

  return (
    <div className="flex flex-col items-start">
      <div role="group" aria-label={fill(stockWords.amount, { name: item.name })} className="flex items-center gap-1">
        <button
          type="button"
          aria-label={fill(stockWords.less, { name: item.name })}
          disabled={!quantity}
          onClick={() => nudge(-1)}
          className={`${button} text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)]`}
        >
          <Minus className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label={fill(stockWords.amount, { name: item.name })}
          className="min-h-9 min-w-[4rem] rounded-[var(--wh-radius-sm)] px-1 text-center text-sm font-semibold whitespace-nowrap tabular-nums hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]"
        >
          {quantity === null ? "—" : sayAmount(words, { quantity, unit: base }, item.unit)}
        </button>
        <button
          type="button"
          aria-label={fill(stockWords.more, { name: item.name })}
          onClick={() => nudge(1)}
          className={`${button} text-[var(--wh-primary)] hover:bg-[var(--wh-primary-soft)]`}
        >
          <Plus className="size-4" aria-hidden />
        </button>
      </div>
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
      {error ? (
        <p role="alert" className="mt-1 max-w-[16rem] text-xs text-[var(--wh-risk)]">
          {error}
        </p>
      ) : null}
      <AmountSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        item={item}
        current={{ quantity: quantity ?? 0, unit: base }}
        words={words}
        title={fill(stockWords.title, { name: item.name })}
        allowRemove={false}
        onSave={async (_kind, amount) => {
          if (timer.current) {
            clearTimeout(timer.current);
            timer.current = null;
          }
          return amount ? save(amount.quantity) : null;
        }}
      />
    </div>
  );
}
