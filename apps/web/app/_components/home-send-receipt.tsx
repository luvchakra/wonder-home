"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";

import type { GroceryItem } from "@wonderhome/core/commerce/inventory";
import { receiptStockLine } from "@wonderhome/core/commerce/receipt-stock";
import { currencyCode, matchConsumable } from "@wonderhome/core/commerce/receipts";
import { formatAmount, type Amount } from "@wonderhome/core/commerce/units";
import { Alert } from "@wonderhome/core/ui/alert";
import { ComboboxField } from "@wonderhome/core/ui/combobox-field";
import { Field } from "@wonderhome/core/ui/field";

import { receiptContextAction } from "../(auth)/home-send-actions";
import { fillIn, type HomeSendReviewLabels } from "../_lib/homesend-labels";

type ReceiptLabels = HomeSendReviewLabels["receipt"];

const UNITS = ["piece", "kg", "g", "litre", "ml", "pack", "bottle", "box", "dozen"];
const CURRENCIES = ["INR", "USD", "GBP", "EUR", "AED", "SGD"];

const INPUT =
  "block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base";

export type ReceiptPrefill = {
  merchant?: string | null;
  documentDate?: string | null;
  amount?: number | null;
  currency?: string | null;
  lines?: { name: string; quantity: number | null; unit: string | null; lineTotal: number | null }[];
} | null;

/** `stock`/`clear` are null until the person changes them: the line's own default applies. */
type Line = { key: number; name: string; quantity: string; unit: string; lineTotal: string; match: string; stock: boolean | null; clear: boolean | null };

/**
 * A receipt's confirm fields (story 09-009): the shop, the day, and one row
 * per line. Each line is matched to the tracked item it is — suggested only
 * when that is plain (`matchConsumable`), never guessed — or started as a new
 * tracked item, or left out. Lines can be corrected, added and removed
 * (rule 12) before anything is recorded; nothing here writes.
 *
 * Each kept line also says what it does at home and on the list (25-003b):
 * stock before → after, and the list entry it takes off, both on by default
 * where they apply and both worked out by `receiptStockLine`, the same rule
 * the server runs again. A receipt that looks already recorded says so, and
 * is only recorded again when the person ticks it.
 */
export function HomeSendReceiptFields({ householdId, prefill, labels }: { householdId: string; prefill: ReceiptPrefill; labels: ReceiptLabels }) {
  const [tracked, setTracked] = useState<GroceryItem[] | null>(null);
  const [duplicateOf, setDuplicateOf] = useState<{ recordedOn: string } | null>(null);
  const [purchasedOn, setPurchasedOn] = useState(prefill?.documentDate ?? "");
  const [lines, setLines] = useState<Line[]>(() =>
    (prefill?.lines?.length ? prefill.lines : [{ name: "", quantity: null, unit: null, lineTotal: null }]).map((line, index) => ({
      key: index,
      name: line.name,
      quantity: line.quantity == null ? "" : String(line.quantity),
      unit: line.unit ?? "",
      lineTotal: line.lineTotal == null ? "" : String(line.lineTotal),
      match: "",
      stock: null,
      clear: null,
    })),
  );
  const [nextKey, setNextKey] = useState(lines.length);

  useEffect(() => {
    let live = true;
    receiptContextAction(householdId, { merchant: prefill?.merchant ?? null, purchasedOn: prefill?.documentDate ?? null, total: prefill?.amount ?? null })
      .then(({ items, duplicateOf }) => {
        if (!live) return;
        setTracked(items);
        setDuplicateOf(duplicateOf);
        // A suggestion only where the line plainly is something tracked; the
        // rest start as new, and the person can change either.
        setLines((current) => current.map((line) => (line.match ? line : { ...line, match: matchConsumable(line.name, items)?.consumableId ?? "new" })));
      })
      .catch(() => live && setTracked([]));
    return () => {
      live = false;
    };
    // The reading is fixed for this review: it is what is checked against.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId]);

  // "Rs", "₹" or "inr" as printed becomes the code a purchase keeps.
  const currency = currencyCode(prefill?.currency) ?? prefill?.currency?.trim().toUpperCase() ?? null;
  const update = (key: number, patch: Partial<Line>) => setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  const total = prefill?.amount != null ? `${prefill.amount.toFixed(2)}${currency ? ` ${currency}` : ""}` : null;

  return (
    <>
      <Field label={labels.shop} name="merchant" defaultValue={prefill?.merchant ?? ""} autoComplete="off" />
      {/* A date and a currency need more than half a phone's width (rule 19): stacked until there is room. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={labels.boughtOn} name="purchasedOn" type="date" required value={purchasedOn} onChange={(event) => setPurchasedOn(event.target.value)} />
        <ComboboxField
          label={labels.currency}
          name="currency"
          options={Array.from(new Set([currency, ...CURRENCIES].filter((value): value is string => Boolean(value))))}
          defaultValue={currency ?? "INR"}
          newValuePlaceholder={labels.currencyPlaceholder}
          addNewLabel={labels.addNew}
          chooseExistingLabel={labels.chooseExisting}
        />
      </div>
      {total ? <p className="text-sm text-[var(--wh-foreground-muted)]">{fillIn(labels.total, { total })}</p> : null}
      {/* Required, so the browser stops an unticked submit here: a server refusal
          would come back after the form has already reset its fields. */}
      {duplicateOf ? (
        <Alert tone="attention">
          <span className="block">{fillIn(labels.duplicate, { date: duplicateOf.recordedOn })}</span>
          <label className="mt-2 flex min-h-11 items-center gap-2 font-medium">
            <input type="checkbox" name="confirmDuplicate" value="1" required className="size-5 accent-[var(--wh-primary)]" />
            {labels.duplicateConfirm}
          </label>
        </Alert>
      ) : null}

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{labels.whatBought}</legend>
        <p className="text-xs text-[var(--wh-foreground-subtle)]">
          {labels.explain} {labels.stockNote}
        </p>
        {tracked === null ? <p className="text-sm text-[var(--wh-foreground-muted)]">{labels.checking}</p> : null}
        {lines.map((line, index) => (
          <ReceiptLineRow
            key={line.key}
            line={line}
            number={index + 1}
            tracked={tracked ?? []}
            purchasedOn={purchasedOn}
            labels={labels}
            onChange={(patch) => update(line.key, patch)}
            onRemove={lines.length > 1 ? () => setLines((current) => current.filter((entry) => entry.key !== line.key)) : undefined}
          />
        ))}
        <button
          type="button"
          onClick={() => {
            setLines((current) => [...current, { key: nextKey, name: "", quantity: "", unit: "", lineTotal: "", match: "new", stock: null, clear: null }]);
            setNextKey((key) => key + 1);
          }}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[var(--wh-primary)]"
        >
          <Plus aria-hidden className="size-4" /> {labels.addLine}
        </button>
      </fieldset>
      {/* The item's stored title, not words on the screen: it stays as the record keeps it. */}
      <input type="hidden" name="title" value={prefill?.merchant ? `Receipt from ${prefill.merchant}` : "Receipt"} />
    </>
  );
}

function ReceiptLineRow({
  line,
  number,
  tracked,
  purchasedOn,
  onChange,
  onRemove,
  labels,
}: {
  line: Line;
  number: number;
  tracked: GroceryItem[];
  purchasedOn: string;
  labels: ReceiptLabels;
  onChange: (patch: Partial<Line>) => void;
  onRemove?: () => void;
}) {
  const id = useId();
  const unitOptions = Array.from(new Set([line.unit, ...UNITS].filter(Boolean)));
  const item = line.match && line.match !== "new" && line.match !== "skip" ? (tracked.find((entry) => entry.id === line.match) ?? null) : null;
  const plan = receiptStockLine({ quantity: Number(line.quantity) || null, unit: line.unit || null }, item, purchasedOn);
  const stock = plan.addable && (line.stock ?? plan.addByDefault);
  const clear = plan.clearable && (line.clear ?? true);
  const plural = new Intl.PluralRules(labels.language);
  const say = (amount: Amount) =>
    formatAmount(amount, labels.language, (unit, quantity) => labels.unitWords[unit]?.[plural.select(quantity)] ?? labels.unitWords[unit]?.other ?? unit);
  return (
    <div className="space-y-2 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface-muted)] p-3">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <label htmlFor={`${id}-name`} className="block text-sm font-medium">{fillIn(labels.line, { number })}</label>
          <input id={`${id}-name`} name="lineName" required value={line.name} onChange={(event) => onChange({ name: event.target.value })} autoComplete="off" className={INPUT} />
        </div>
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={line.name ? fillIn(labels.remove, { name: line.name }) : fillIn(labels.removeLine, { number })}
            className="grid size-11 shrink-0 place-items-center rounded-[var(--wh-radius-sm)] text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface)]"
          >
            <Trash2 aria-hidden className="size-4" />
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <label htmlFor={`${id}-qty`} className="block text-sm font-medium">{labels.howMany}</label>
          <input id={`${id}-qty`} name="lineQuantity" type="number" min={0.01} step="0.01" placeholder="1" value={line.quantity} onChange={(event) => onChange({ quantity: event.target.value })} className={INPUT} />
        </div>
        <ComboboxField
          label={labels.countedIn}
          name="lineUnit"
          options={unitOptions}
          defaultValue={line.unit || undefined}
          emptyLabel={labels.noUnit}
          newValuePlaceholder={labels.unitPlaceholder}
          addNewLabel={labels.addNew}
          chooseExistingLabel={labels.chooseExisting}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${id}-total`} className="block text-sm font-medium">{labels.lineTotal}</label>
        <input id={`${id}-total`} name="lineTotal" type="number" min={0} step="0.01" value={line.lineTotal} onChange={(event) => onChange({ lineTotal: event.target.value })} className={INPUT} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${id}-match`} className="block text-sm font-medium">{labels.thisIs}</label>
        <select id={`${id}-match`} name="lineMatch" value={line.match || "new"} onChange={(event) => onChange({ match: event.target.value })} className={INPUT}>
          {tracked.map((item) => (
            <option key={item.id} value={item.id}>{fillIn(labels.tracked, { name: item.name })}</option>
          ))}
          <option value="new">{labels.new}</option>
          <option value="skip">{labels.skip}</option>
        </select>
        {/* The whole name, wrapping, whatever a native select has room for (rule 11). */}
        <p className="text-xs break-words text-[var(--wh-foreground-subtle)]">
          {line.match === "skip"
            ? labels.skipped
            : line.match && line.match !== "new"
              ? fillIn(labels.addsTo, { name: tracked.find((item) => item.id === line.match)?.name ?? labels.thisItem })
              : fillIn(labels.startsTracking, { name: line.name.trim() || labels.thisItem })}
        </p>
      </div>
      {/* What the line does at home and on the list; "1"/"0" so every line sends one value. */}
      <input type="hidden" name="lineStock" value={line.match !== "skip" && stock ? "1" : "0"} />
      <input type="hidden" name="lineClear" value={line.match !== "skip" && clear ? "1" : "0"} />
      {line.match === "skip" ? null : (
        <div className="space-y-2 border-t border-[var(--wh-border)] pt-2">
          {plan.addable ? (
            <label className="flex min-h-11 items-start gap-2 text-sm">
              <input type="checkbox" checked={stock} onChange={(event) => onChange({ stock: event.target.checked })} className="mt-0.5 size-5 shrink-0 accent-[var(--wh-primary)]" />
              <span className="min-w-0">
                <span className="block font-medium">{labels.stockAdd}</span>
                <span className="block text-xs text-[var(--wh-foreground-muted)]">
                  {fillIn(labels.stockChange, { before: plan.before ? say(plan.before) : labels.stockNone, after: say(stock && plan.after ? plan.after : (plan.before ?? { quantity: 0, unit: plan.bought?.unit ?? "pcs" })) })}
                </span>
                {plan.countedAfter ? <span className="block text-xs text-[var(--wh-attention)]">{fillIn(labels.stockCountedAfter, { date: plan.countedAfter })}</span> : null}
              </span>
            </label>
          ) : (
            <p className="text-xs text-[var(--wh-foreground-subtle)]">{fillIn(labels.stockCantConvert, { unit: line.unit || labels.noUnit })}</p>
          )}
          {plan.clearable && plan.onList ? (
            <label className="flex min-h-11 items-start gap-2 text-sm">
              <input type="checkbox" checked={clear} onChange={(event) => onChange({ clear: event.target.checked })} className="mt-0.5 size-5 shrink-0 accent-[var(--wh-primary)]" />
              <span className="min-w-0">
                <span className="block font-medium">{labels.listClear}</span>
                <span className="block text-xs text-[var(--wh-foreground-muted)]">
                  {fillIn(labels.listChange, {
                    before: say(plan.onList),
                    after: clear ? (plan.listAfter && plan.listAfter.quantity > 0 ? say(plan.listAfter) : labels.listNothing) : say(plan.onList),
                  })}
                </span>
              </span>
            </label>
          ) : null}
        </div>
      )}
    </div>
  );
}
