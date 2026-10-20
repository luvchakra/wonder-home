"use client";

import { Minus, Plus, ShoppingCart, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  compatible,
  displayAmount,
  normalizeUnit,
  parseQuantity,
  roundQuantity,
  toBase,
  UNIT_CHOICES,
  unitInfo,
} from "@wonderhome/core/commerce/units";
import { stepAlong, type Ladder } from "@wonderhome/core/commerce/buying-sizes";
import { Button } from "@wonderhome/core/ui/button";
import { Sheet } from "@wonderhome/core/ui/sheet";

import { adjustListAction, changeUnitAction } from "../../(auth)/grocery-actions";
import type { GroceryWords } from "../../_lib/grocery-words";
import { fill, newKey, sayAmount, shownUnit, unitsFor } from "./amounts";

/** Long enough for a few quick taps to become one write; short enough to feel saved. */
const SETTLE_MS = 450;

export type StepperItem = {
  id: string;
  name: string;
  unit: string;
  step: number | null;
  /** The amounts + and − step through, in the base unit (`householdLadder`): never a dozen eggs at a time. */
  ladder: Ladder;
  /** Where the cart button starts, on the ladder: the usual buy. */
  start: number;
};

/**
 * `− 500 g +` — how much of an item to buy (design §3.1).
 *
 * It only ever changes the list, never what is at home. Taps settle into one
 * write of the difference ("add 1500 g"), with its own idempotency key, so a
 * retried request never counts twice and two people tapping at once both
 * count. The middle opens a sheet to type any amount in a unit that
 * converts. Every change is announced, and a failure says so and puts the
 * last saved amount back.
 *
 * "Remove" under the amount takes it off the list in one tap (the owner,
 * 2026-10-20): To buy goes to nothing, so the item leaves the To buy view and
 * stays under All, with the cart button to put it back.
 */
export function ToBuyStepper({
  householdId,
  item,
  initial,
  words,
  size = "md",
  onChange,
}: {
  householdId: string;
  item: StepperItem;
  /** In base units; null when the item is not on the list. */
  initial: { quantity: number; unit: string } | null;
  words: Pick<
    GroceryWords,
    "language" | "unitWords" | "unitNames" | "stepper" | "amountSheet"
  >;
  size?: "md" | "lg";
  /** Told the saved amount after each write — the list's own counts follow it. */
  onChange?: (quantity: number) => void;
}) {
  const base = unitInfo(item.unit).base;
  const [quantity, setQuantity] = useState(initial?.quantity ?? 0);
  const saved = useRef(initial?.quantity ?? 0);
  const pendingDelta = useRef(0);
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

  const amountText = sayAmount(words, { quantity, unit: base }, item.unit);
  const announce = (value: number) =>
    setAnnouncement(
      value > 0
        ? fill(words.stepper.now, {
            name: item.name,
            amount: sayAmount(
              words,
              { quantity: value, unit: base },
              item.unit,
            ),
          })
        : fill(words.stepper.none, { name: item.name }),
    );

  const settle = (value: number) => {
    saved.current = value;
    setQuantity(value);
    announce(value);
    onChange?.(value);
  };

  const flush = async () => {
    timer.current = null;
    const delta = roundQuantity(pendingDelta.current);
    pendingDelta.current = 0;
    if (delta === 0) return;
    const result = await adjustListAction({
      householdId,
      itemId: item.id,
      kind: delta > 0 ? "add" : "subtract",
      quantity: Math.abs(delta),
      unit: base,
      key: newKey("stepper"),
    });
    if (!result.ok) {
      setError(fill(words.stepper.failed, { reason: result.error }));
      setQuantity(saved.current);
      announce(saved.current);
      return;
    }
    setError(null);
    settle(result.after);
  };

  // One rung of the item's ladder: 1 kg → 1.25 kg, 12 eggs → 13, atta 2 kg → 5 kg.
  const nudge = (direction: 1 | -1) => {
    const next =
      quantity <= 0 && direction === 1
        ? item.start
        : Math.max(0, roundQuantity(stepAlong(item.ladder, quantity, direction)));
    if (next === quantity) return;
    pendingDelta.current += next - quantity;
    setQuantity(next);
    announce(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SETTLE_MS);
  };

  const buttonSize = size === "lg" ? "size-11" : "size-9";
  const router = useRouter();
  const [removing, setRemoving] = useState(false);

  const remove = async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    pendingDelta.current = 0;
    setRemoving(true);
    const result = await adjustListAction({ householdId, itemId: item.id, kind: "remove", key: newKey("remove") });
    setRemoving(false);
    if (!result.ok) {
      setError(fill(words.stepper.failed, { reason: result.error }));
      setQuantity(saved.current);
      announce(saved.current);
      return;
    }
    setError(null);
    settle(result.after);
    // The To buy count and the list's own view follow the page.
    router.refresh();
  };

  return (
    <div className="flex flex-col items-start">
      {quantity <= 0 ? (
        // Not on the list: one cart button, not an empty "− 0 kg +". A tap
        // puts one step on the list and the stepper takes its place.
        <button
          type="button"
          aria-label={fill(words.stepper.addToList, { name: item.name })}
          title={fill(words.stepper.addToList, { name: item.name })}
          onClick={() => nudge(1)}
          className={`inline-flex ${size === "lg" ? "h-11 px-4" : "h-9 px-3"} items-center gap-1 rounded-full border border-[var(--wh-primary)] bg-[var(--wh-primary-soft)] text-[var(--wh-primary)] transition-colors hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]`}
        >
          <Plus className="size-4" aria-hidden />
          <ShoppingCart className="size-5" aria-hidden />
        </button>
      ) : (
        <div
          role="group"
          aria-label={fill(words.stepper.amount, { name: item.name })}
          className="flex items-center gap-1"
        >
          <button
            type="button"
            aria-label={fill(words.stepper.less, { name: item.name })}
            disabled={quantity <= 0}
            onClick={() => nudge(-1)}
            className={`grid ${buttonSize} place-items-center rounded-full border border-[var(--wh-border)] bg-[var(--wh-surface)] text-[var(--wh-foreground-muted)] transition-colors hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)] disabled:opacity-40`}
          >
            <Minus className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label={fill(words.stepper.amount, { name: item.name })}
            className="min-h-9 min-w-[4rem] rounded-[var(--wh-radius-sm)] px-1 text-center text-sm font-semibold whitespace-nowrap tabular-nums hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]"
          >
            {amountText}
          </button>
          <button
            type="button"
            aria-label={fill(words.stepper.more, { name: item.name })}
            onClick={() => nudge(1)}
            className={`grid ${buttonSize} place-items-center rounded-full border border-[var(--wh-border)] bg-[var(--wh-surface)] text-[var(--wh-primary)] transition-colors hover:bg-[var(--wh-primary-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]`}
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
      )}
      {quantity > 0 ? (
        <button
          type="button"
          disabled={removing}
          aria-label={fill(words.stepper.removeLabel, { name: item.name })}
          onClick={() => void remove()}
          className="mt-1 inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-xs font-semibold text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)] disabled:opacity-60"
        >
          <X className="size-3.5" aria-hidden /> {words.stepper.remove}
        </button>
      ) : null}
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
      {error ? (
        <p
          role="alert"
          className="mt-1 max-w-[16rem] text-xs text-[var(--wh-risk)]"
        >
          {error}
        </p>
      ) : null}
      <AmountSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        item={item}
        current={{ quantity, unit: base }}
        words={words}
        unitChange={{ householdId }}
        onSave={async (kind, amount) => {
          if (timer.current) {
            clearTimeout(timer.current);
            timer.current = null;
            pendingDelta.current = 0;
          }
          const result = await adjustListAction({
            householdId,
            itemId: item.id,
            kind,
            quantity: amount?.quantity,
            unit: amount?.unit,
            key: newKey("amount"),
          });
          if (!result.ok) return result.error;
          setError(null);
          settle(result.after);
          return null;
        }}
      />
    </div>
  );
}

/** Any amount, typed, in a unit that converts — or off the list altogether. */
export function AmountSheet({
  open,
  onOpenChange,
  item,
  current,
  words,
  title,
  onSave,
  allowRemove = true,
  unitChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: StepperItem;
  current: { quantity: number; unit: string };
  words: Pick<
    GroceryWords,
    "language" | "unitWords" | "unitNames" | "amountSheet"
  >;
  title?: string;
  /** Offers "Counted in" (25-012): how the item is counted everywhere, changed from here. */
  unitChange?: { householdId: string };
  onSave: (
    kind: "set" | "remove",
    amount?: { quantity: number; unit: string },
  ) => Promise<string | null>;
  allowRemove?: boolean;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title ?? fill(words.amountSheet.title, { name: item.name })}
    >
      {/* Mounted afresh each time the sheet opens, so it starts from the amount shown then. */}
      {open ? (
        <AmountForm
          item={item}
          current={current}
          words={words}
          onSave={onSave}
          allowRemove={allowRemove}
          onDone={() => onOpenChange(false)}
        />
      ) : null}
      {open && unitChange ? (
        <CountedIn
          householdId={unitChange.householdId}
          item={item}
          words={words}
          onDone={() => onOpenChange(false)}
        />
      ) : null}
    </Sheet>
  );
}

function AmountForm({
  item,
  current,
  words,
  onSave,
  allowRemove,
  onDone,
}: {
  item: StepperItem;
  current: { quantity: number; unit: string };
  words: Pick<
    GroceryWords,
    "language" | "unitWords" | "unitNames" | "amountSheet"
  >;
  onSave: (
    kind: "set" | "remove",
    amount?: { quantity: number; unit: string },
  ) => Promise<string | null>;
  allowRemove: boolean;
  onDone: () => void;
}) {
  const shown =
    current.quantity === 0
      ? { quantity: 0, unit: unitInfo(item.unit).key }
      : displayAmount(current);
  const [text, setText] = useState(
    shown.quantity ? String(shown.quantity) : "",
  );
  const [unit, setUnit] = useState(shownUnit(current, item.unit));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (kind: "set" | "remove") => {
    let amount: { quantity: number; unit: string } | undefined;
    if (kind === "set") {
      const value = parseQuantity(text);
      if (value === null) {
        setError(words.amountSheet.invalid);
        return;
      }
      amount = toBase(value, unit);
    }
    setBusy(true);
    const failure = await onSave(kind, amount);
    setBusy(false);
    if (failure) setError(failure);
    else onDone();
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void save("set");
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">
            {words.amountSheet.amount}
          </span>
          <input
            inputMode="decimal"
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="block h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base tabular-nums focus-visible:border-[var(--wh-primary)] focus-visible:outline-none"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{words.amountSheet.unit}</span>
          <select
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            className="block h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base focus-visible:border-[var(--wh-primary)] focus-visible:outline-none"
          >
            {unitsFor(item.unit).map((choice) => (
              <option key={choice} value={choice}>
                {words.unitNames[choice] ?? choice}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-[var(--wh-risk)]">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy} className="w-full">
        {words.amountSheet.save}
      </Button>
      {allowRemove && current.quantity > 0 ? (
        <Button
          type="button"
          variant="quiet"
          disabled={busy}
          className="w-full"
          onClick={() => void save("remove")}
        >
          {words.amountSheet.remove}
        </Button>
      ) : null}
    </form>
  );
}

/**
 * How the item is counted everywhere — the list, what is at home and
 * HomeTalk (25-012). A unit that converts (g to kg) changes the item only.
 * One that does not (pieces to grams) is said plainly before it is saved:
 * what is at home needs counting again, and the list starts again at the
 * usual amount. A unit nobody listed can be typed (rule 20).
 */
function CountedIn({
  householdId,
  item,
  words,
  onDone,
}: {
  householdId: string;
  item: StepperItem;
  words: Pick<GroceryWords, "unitNames" | "amountSheet">;
  onDone: () => void;
}) {
  const router = useRouter();
  const current = unitInfo(item.unit).key;
  const choices = [...new Set<string>([...UNIT_CHOICES, current])];
  const [picked, setPicked] = useState(current);
  const [own, setOwn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const OTHER = "__other__";
  const chosen = picked === OTHER ? normalizeUnit(own) : picked;
  const unitName = (unit: string) => words.unitNames[unit] ?? unit;
  const changed = chosen !== null && chosen !== current;
  const converts = chosen !== null && compatible(chosen, item.unit);

  const save = async () => {
    if (!chosen) return;
    setBusy(true);
    const result = await changeUnitAction({ householdId, itemId: item.id, unit: chosen, key: newKey("unit") });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onDone();
    router.refresh();
  };

  return (
    <div className="mt-5 space-y-2 border-t border-[var(--wh-border)] pt-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">{words.amountSheet.countedIn}</span>
        <select
          value={picked}
          onChange={(event) => {
            setPicked(event.target.value);
            setError(null);
          }}
          className="block h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base focus-visible:border-[var(--wh-primary)] focus-visible:outline-none"
        >
          {choices.map((choice) => (
            <option key={choice} value={choice}>
              {unitName(choice)}
            </option>
          ))}
          <option value={OTHER}>{words.amountSheet.otherUnit}</option>
        </select>
      </label>
      {picked === OTHER ? (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{words.amountSheet.otherUnitLabel}</span>
          <input
            value={own}
            maxLength={20}
            onChange={(event) => setOwn(event.target.value)}
            placeholder={words.amountSheet.otherUnitPlaceholder}
            className="block h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base focus-visible:border-[var(--wh-primary)] focus-visible:outline-none"
          />
        </label>
      ) : null}
      <p className="text-xs text-[var(--wh-foreground-muted)]">
        {changed && !converts
          ? fill(words.amountSheet.recount, { name: item.name, unit: unitName(chosen) })
          : fill(words.amountSheet.countedInHint, { name: item.name })}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-[var(--wh-risk)]">
          {error}
        </p>
      ) : null}
      {changed ? (
        <Button type="button" variant="secondary" disabled={busy} className="w-full" onClick={() => void save()}>
          {fill(words.amountSheet.changeUnit, { unit: unitName(chosen) })}
        </Button>
      ) : null}
    </div>
  );
}
