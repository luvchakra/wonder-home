"use client";

import { Plus, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import type { CatalogEntry } from "@wonderhome/core/commerce/catalog";
import { formatAmount, stepInBase, UNIT_CHOICES } from "@wonderhome/core/commerce/units";
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
import { fill, newKey } from "./amounts";

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
 * a quick-commerce search does: a picture, the name, the brand and the pack,
 * and one tap to put it on the list — linked to the catalog entry, so its
 * picture and nutrients come with it. The catalog is open data and says so.
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
  const [creating, setCreating] = useState(false);
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<{ query: string; entries: CatalogEntry[]; failed: boolean } | null>(null);
  const [catalogAdded, setCatalogAdded] = useState<Record<string, boolean>>({});

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

  const addFromCatalog = async (entry: CatalogEntry) => {
    setError(null);
    const result = await addFromCatalogAction({ householdId, catalogId: entry.id, key: newKey("catalog") });
    if (!result.ok) setError(result.error);
    else setCatalogAdded((current) => ({ ...current, [entry.id]: true }));
  };
  const plural = new Intl.PluralRules(words.language);
  const pack = (entry: CatalogEntry) =>
    entry.pack
      ? formatAmount(entry.pack, words.language, (unit, quantity) => words.unitWords[unit]?.[plural.select(quantity)] ?? words.unitWords[unit]?.other ?? unit)
      : null;

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
                type="search"
                autoFocus
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
                  {shownCatalog.entries.map((entry) => (
                    <li key={entry.id} className="flex items-center gap-3 py-2.5">
                      {entry.imageUrl ? (
                        // The catalog's own copy of the source's picture, from WonderHome's storage.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={entry.imageUrl} alt="" loading="lazy" className="size-12 shrink-0 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface)] object-contain ring-1 ring-[var(--wh-border)]" />
                      ) : (
                        <IconTile icon={groceryIcon(entry.name, entry.category)} tone="care" size="sm" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium break-words">{entry.name}</span>
                        <span className="block text-xs break-words text-[var(--wh-foreground-muted)]">{[entry.brand ?? entry.subcategory, pack(entry)].filter(Boolean).join(" · ")}</span>
                      </span>
                      {catalogAdded[entry.id] ? (
                        <Badge tone="handled">{words.add.onList}</Badge>
                      ) : (
                        <Pill type="button" tone="soft" onClick={() => void addFromCatalog(entry)} aria-label={fill(words.add.catalogAdd, { name: entry.name })}>
                          <Plus aria-hidden className="size-3.5" />
                        </Pill>
                      )}
                    </li>
                  ))}
                </ul>
                {shownCatalog.entries.some((entry) => entry.source === "open_food_facts") ? (
                  <p className="text-xs text-[var(--wh-foreground-subtle)]">{words.add.catalogCredit}</p>
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
