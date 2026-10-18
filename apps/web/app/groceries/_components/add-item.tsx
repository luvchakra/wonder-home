"use client";

import { Minus, Plus, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { startAmount, stepAlong } from "@wonderhome/core/commerce/buying-sizes";
import type { CatalogEntry } from "@wonderhome/core/commerce/catalog";
import { stepInBase, toBase, UNIT_CHOICES } from "@wonderhome/core/commerce/units";
import { Alert } from "@wonderhome/core/ui/alert";
import { Button, ButtonLink } from "@wonderhome/core/ui/button";
import { ComboboxField } from "@wonderhome/core/ui/combobox-field";
import { Field } from "@wonderhome/core/ui/field";
import { groceryIcon } from "@wonderhome/core/ui/grocery-row";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Badge, Pill } from "@wonderhome/core/ui/pill";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../../(auth)/actions";
import {
  addFromCatalogAction,
  addGroceryItemAction,
  adjustListAction,
  restoreGroceryAction,
  searchCatalogAction,
  type AddItemState,
} from "../../(auth)/grocery-actions";
import type { GroceryWords } from "../../_lib/grocery-words";
import { fill, newKey, sayAmount } from "./amounts";

export type AddCandidate = {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  unit: string;
  step: number | null;
  onList: boolean;
  /** The shared catalog entry it was picked from, so the catalog doesn't offer it again. */
  catalogId: string | null;
};
export type RetiredCandidate = { id: string; name: string; category: string };

/**
 * Add item (design §3.3): search what the household already has first —
 * on the list, tracked, or tracked once and stopped — and only then a new
 * item, which the server still refuses as a near-duplicate unless the
 * person says it really is different.
 *
 * Below the household's own, the shared catalog (HomeFood 25-006) answers as
 * a quick-commerce search does: a picture, the name and the brand — the
 * everyday choices only, never a wall of variants (25-010). No amount is
 * shown until one is picked: then − and + walk the item's natural ladder
 * (1 kg, 1.25 kg, 1.5 kg; atta's 1, 2, 5, 10 kg packs; eggs one at a time)
 * from the usual buy, and Add puts that amount on the list, linked to the
 * catalog entry so its picture and nutrition come with it.
 */
export function AddItemButton({
  householdId,
  items,
  retired,
  categories,
  words,
}: {
  householdId: string;
  items: AddCandidate[];
  retired: RetiredCandidate[];
  /** The household's own categories first, then the suggestions in the reader's language. */
  categories: string[];
  words: GroceryWords;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  // Ready to type at once with a keyboard; on a phone the keyboard waits for a tap rather than rising with the sheet.
  useEffect(() => {
    if (!open || window.matchMedia?.("(pointer: coarse)").matches) return;
    // A frame later, so the sheet's own first focus has already happened.
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);
  const [creating, setCreating] = useState(false);
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<{ query: string; entries: CatalogEntry[]; failed: boolean } | null>(null);
  const [catalogAdded, setCatalogAdded] = useState<Record<string, boolean>>({});
  // The catalog entry being sized, and how much of it (in its ladder's unit).
  const [picked, setPicked] = useState<{ id: string; quantity: number } | null>(null);

  const needle = query.trim().toLowerCase();

  // The catalog answers as the person types, a moment after they pause.
  useEffect(() => {
    if (needle.length < 2) return;
    let live = true;
    const timer = setTimeout(() => {
      searchCatalogAction(householdId, needle)
        .then((result) => live && setCatalog({ query: needle, entries: result.ok ? result.entries : [], failed: !result.ok }))
        .catch(() => live && setCatalog({ query: needle, entries: [], failed: true }));
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [householdId, needle]);
  // What the household already tracks is shown above as its own; the catalog
  // never offers the same entry a second time.
  const tracked = new Set(items.map((item) => item.catalogId).filter(Boolean));
  const shownCatalog =
    needle.length >= 2 && catalog?.query === needle
      ? { ...catalog, entries: catalog.entries.filter((entry) => !tracked.has(entry.id)) }
      : null;
  const searching = needle.length >= 2 && catalog?.query !== needle;
  const matches = needle
    ? items
        .filter((item) =>
          [item.name, ...item.aliases].some((text) =>
            text.toLowerCase().includes(needle),
          ),
        )
        .slice(0, 8)
    : [];
  const stopped = needle
    ? retired
        .filter((item) => item.name.toLowerCase().includes(needle))
        .slice(0, 4)
    : [];

  const reset = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery("");
      setCatalog(null);
      setPicked(null);
      setCreating(false);
      setError(null);
      router.refresh();
    }
  };

  const addToList = async (item: AddCandidate) => {
    const step = stepInBase(item.unit, item.step);
    const result = await adjustListAction({
      householdId,
      itemId: item.id,
      kind: "add",
      quantity: step.quantity,
      unit: step.unit,
      key: newKey("add"),
    });
    if (!result.ok) setError(result.error);
    else setAdded((current) => ({ ...current, [item.id]: true }));
  };

  const pick = (entry: CatalogEntry) => {
    const pack = entry.pack ? toBase(entry.pack.quantity, entry.pack.unit) : null;
    const usual = pack && pack.unit === entry.ladder.unit ? pack.quantity : null;
    setPicked(picked?.id === entry.id ? null : { id: entry.id, quantity: startAmount(entry.ladder, usual) });
  };

  const addFromCatalog = async (entry: CatalogEntry, quantity: number) => {
    setError(null);
    const result = await addFromCatalogAction({
      householdId,
      catalogId: entry.id,
      amount: { quantity, unit: entry.ladder.unit },
      key: newKey("catalog"),
    });
    if (!result.ok) setError(result.error);
    else {
      setCatalogAdded((current) => ({ ...current, [entry.id]: true }));
      setPicked(null);
    }
  };

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} className="gap-2">
        <Plus aria-hidden className="size-4" /> {words.add.open}
      </Button>
      <Sheet
        open={open}
        onOpenChange={reset}
        title={words.add.title}
        description={words.add.description}
      >
        {creating ? (
          <NewItemForm
            householdId={householdId}
            initialName={query.trim()}
            categories={categories}
            words={words}
            onDone={() => reset(false)}
          />
        ) : (
          <div className="space-y-3">
            <label className="block">
              <span className="sr-only">{words.add.search}</span>
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={words.add.search}
                className="block h-11 w-full rounded-[var(--wh-radius-pill)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-4 text-base focus-visible:border-[var(--wh-primary)] focus-visible:outline-none"
              />
            </label>
            {error ? <Alert>{error}</Alert> : null}
            {matches.length > 0 || stopped.length > 0 ? (
              <ul className="divide-y divide-[var(--wh-border)]">
                {matches.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 py-2.5">
                    <IconTile
                      icon={groceryIcon(item.name, item.category)}
                      tone="care"
                      size="sm"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium break-words">
                        {item.name}
                      </span>
                      <span className="block text-xs text-[var(--wh-foreground-muted)] first-letter:uppercase">
                        {item.category}
                      </span>
                    </span>
                    {item.onList || added[item.id] ? (
                      <Badge tone="handled">{words.add.onList}</Badge>
                    ) : (
                      <Pill
                        type="button"
                        tone="soft"
                        onClick={() => void addToList(item)}
                        aria-label={fill(words.add.addToList, {
                          name: item.name,
                        })}
                      >
                        <Plus aria-hidden className="size-3.5" />
                      </Pill>
                    )}
                  </li>
                ))}
                {stopped.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 py-2.5">
                    <IconTile
                      icon={groceryIcon(item.name, item.category)}
                      tone="neutral"
                      size="sm"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium break-words">
                        {item.name}
                      </span>
                      <span className="block text-xs text-[var(--wh-foreground-muted)]">
                        {words.add.notTracked}
                      </span>
                    </span>
                    <TrackAgain
                      householdId={householdId}
                      itemId={item.id}
                      label={words.add.trackAgain}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
            {searching ? <p className="text-sm text-[var(--wh-foreground-muted)]" role="status">{words.add.catalogSearching}</p> : null}
            {shownCatalog?.failed ? <p className="text-sm text-[var(--wh-foreground-muted)]">{words.add.catalogFailed}</p> : null}
            {shownCatalog && shownCatalog.entries.length > 0 ? (
              <section className="space-y-1" aria-label={words.add.catalog}>
                <h3 className="text-xs font-semibold tracking-wide text-[var(--wh-foreground-muted)] uppercase">{words.add.catalog}</h3>
                <ul className="divide-y divide-[var(--wh-border)]">
                  {shownCatalog.entries.map((entry) => {
                    const open = picked?.id === entry.id;
                    return (
                      <li key={entry.id} className="py-1">
                        <button
                          type="button"
                          onClick={() => !catalogAdded[entry.id] && pick(entry)}
                          aria-expanded={open}
                          aria-label={fill(words.add.catalogAdd, { name: entry.name })}
                          className="flex w-full items-center gap-3 rounded-[var(--wh-radius-sm)] py-1.5 text-left hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]"
                        >
                          {entry.imageUrl ? (
                            // The catalog's own copy of the picture, from WonderHome's storage.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={entry.imageUrl} alt="" loading="lazy" className="size-14 shrink-0 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface)] object-cover ring-1 ring-[var(--wh-border)]" />
                          ) : (
                            <IconTile icon={groceryIcon(entry.name, entry.category)} tone="care" size="sm" />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium break-words">{entry.name}</span>
                            {entry.brand ? <span className="block text-xs break-words text-[var(--wh-foreground-muted)]">{entry.brand}</span> : null}
                          </span>
                          {catalogAdded[entry.id] ? (
                            <Badge tone="handled">{words.add.onList}</Badge>
                          ) : (
                            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--wh-primary-soft)] text-[var(--wh-primary)]">
                              <Plus className="size-4" />
                            </span>
                          )}
                        </button>
                        {open && picked ? (
                          <div className="mt-1 mb-2 flex flex-wrap items-center justify-between gap-3 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] p-2.5">
                            <div role="group" aria-label={fill(words.stepper.amount, { name: entry.name })} className="flex items-center gap-1">
                              <button
                                type="button"
                                aria-label={fill(words.stepper.less, { name: entry.name })}
                                disabled={stepAlong(entry.ladder, picked.quantity, -1) <= 0}
                                onClick={() => setPicked({ id: entry.id, quantity: stepAlong(entry.ladder, picked.quantity, -1) })}
                                className="grid size-11 place-items-center rounded-full border border-[var(--wh-border)] bg-[var(--wh-surface)] text-[var(--wh-foreground-muted)] disabled:opacity-40"
                              >
                                <Minus aria-hidden className="size-4" />
                              </button>
                              <span aria-live="polite" className="min-w-[5rem] text-center text-base font-semibold whitespace-nowrap tabular-nums">
                                {sayAmount(words, { quantity: picked.quantity, unit: entry.ladder.unit }, entry.unit)}
                              </span>
                              <button
                                type="button"
                                aria-label={fill(words.stepper.more, { name: entry.name })}
                                onClick={() => setPicked({ id: entry.id, quantity: stepAlong(entry.ladder, picked.quantity, 1) })}
                                className="grid size-11 place-items-center rounded-full border border-[var(--wh-border)] bg-[var(--wh-surface)] text-[var(--wh-primary)]"
                              >
                                <Plus aria-hidden className="size-4" />
                              </button>
                            </div>
                            <Button type="button" onClick={() => void addFromCatalog(entry, picked.quantity)}>
                              {words.add.catalogConfirm}
                            </Button>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                {shownCatalog.entries.some((entry) => entry.source === "open_food_facts") ? (
                  <p className="text-xs text-[var(--wh-foreground-subtle)]">{words.add.catalogCredit}</p>
                ) : null}
                {shownCatalog.entries.some((entry) => entry.imageCredit) ? (
                  <p className="text-xs text-[var(--wh-foreground-subtle)]">{words.add.picturesCredit}</p>
                ) : null}
              </section>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => setCreating(true)}
            >
              {needle
                ? fill(words.add.notHere, { name: query.trim() })
                : words.add.newItem}
            </Button>
          </div>
        )}
      </Sheet>
    </>
  );
}

function TrackAgain({
  householdId,
  itemId,
  label,
}: {
  householdId: string;
  itemId: string;
  label: string;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    restoreGroceryAction,
    {},
  );
  if (state.notice) return <Badge tone="handled">{state.notice}</Badge>;
  return (
    <form action={action} className="flex flex-col items-end">
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="itemId" value={itemId} />
      <Pill type="submit" tone="soft" className="gap-1.5">
        <RotateCcw aria-hidden className="size-3.5" /> {label}
      </Pill>
      {state.error ? (
        <span className="mt-1 text-xs text-[var(--wh-risk)]">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

function NewItemForm({
  householdId,
  initialName,
  categories,
  words,
  onDone,
}: {
  householdId: string;
  initialName: string;
  categories: string[];
  words: GroceryWords;
  onDone: () => void;
}) {
  const [state, action] = useActionState<AddItemState, FormData>(
    addGroceryItemAction,
    {},
  );
  const [confirmNew, setConfirmNew] = useState(false);

  useEffect(() => {
    if (state.addedId) onDone();
  }, [state.addedId, onDone]);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="confirmNew" value={confirmNew ? "1" : ""} />
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.duplicate ? (
        <Alert tone="info">
          <span className="block">
            {fill(words.add.duplicate, { name: state.duplicate.name })}
          </span>
          <span className="mt-2 flex flex-wrap gap-2">
            <ButtonLink
              href={`/groceries/${state.duplicate.id}`}
              variant="secondary"
            >
              {fill(words.add.useExisting, { name: state.duplicate.name })}
            </ButtonLink>
            <Button
              type="submit"
              variant="quiet"
              onClick={() => setConfirmNew(true)}
            >
              {words.add.addAnyway}
            </Button>
          </span>
        </Alert>
      ) : null}
      <Field
        label={words.add.name}
        name="name"
        required
        defaultValue={initialName}
        maxLength={120}
      />
      <ComboboxField
        label={words.add.category}
        name="category"
        required
        options={categories}
        placeholder={words.add.categoryPlaceholder}
        newValuePlaceholder={words.add.categoryNew}
        addNewLabel={words.add.pickerAddNew}
        chooseExistingLabel={words.add.pickerChooseExisting}
      />
      <ComboboxField
        label={words.add.unit}
        name="unit"
        required
        options={[...UNIT_CHOICES]}
        optionLabels={words.unitNames}
        defaultValue="pcs"
        addNewLabel={words.add.pickerAddNew}
        chooseExistingLabel={words.add.pickerChooseExisting}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label={words.add.toBuy} name="toBuy" inputMode="decimal" />
        <Field label={words.add.inStock} name="inStock" inputMode="decimal" />
      </div>
      <p className="text-xs text-[var(--wh-foreground-muted)]">
        {words.add.inStockHint}
      </p>
      <Submit label={words.add.submit} pending={words.add.adding} />
    </form>
  );
}

function Submit({ label, pending }: { label: string; pending: string }) {
  const status = useFormStatus();
  return (
    <Button type="submit" disabled={status.pending} className="w-full">
      {status.pending ? pending : label}
    </Button>
  );
}
