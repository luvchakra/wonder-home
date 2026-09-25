"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { currencyCode, matchConsumable } from "@wonderhome/core/commerce/receipts";
import { ComboboxField } from "@wonderhome/core/ui/combobox-field";
import { Field } from "@wonderhome/core/ui/field";

import { trackedItemsAction } from "../(auth)/home-send-actions";
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

type Line = { key: number; name: string; quantity: string; unit: string; lineTotal: string; match: string };

/**
 * A receipt's confirm fields (story 09-009): the shop, the day, and one row
 * per line. Each line is matched to the tracked item it is — suggested only
 * when that is plain (`matchConsumable`), never guessed — or started as a new
 * tracked item, or left out. Lines can be corrected, added and removed
 * (rule 12) before anything is recorded; nothing here writes.
 */
export function HomeSendReceiptFields({ householdId, prefill, labels }: { householdId: string; prefill: ReceiptPrefill; labels: ReceiptLabels }) {
  const [tracked, setTracked] = useState<{ id: string; name: string }[] | null>(null);
  const [lines, setLines] = useState<Line[]>(() =>
    (prefill?.lines?.length ? prefill.lines : [{ name: "", quantity: null, unit: null, lineTotal: null }]).map((line, index) => ({
      key: index,
      name: line.name,
      quantity: line.quantity == null ? "" : String(line.quantity),
      unit: line.unit ?? "",
      lineTotal: line.lineTotal == null ? "" : String(line.lineTotal),
      match: "",
    })),
  );
  const [nextKey, setNextKey] = useState(lines.length);

  useEffect(() => {
    let live = true;
    trackedItemsAction(householdId)
      .then((items) => {
        if (!live) return;
        setTracked(items);
        // A suggestion only where the line plainly is something tracked; the
        // rest start as new, and the person can change either.
        setLines((current) => current.map((line) => (line.match ? line : { ...line, match: matchConsumable(line.name, items)?.consumableId ?? "new" })));
      })
      .catch(() => live && setTracked([]));
    return () => {
      live = false;
    };
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
        <Field label={labels.boughtOn} name="purchasedOn" type="date" required defaultValue={prefill?.documentDate ?? ""} />
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

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{labels.whatBought}</legend>
        <p className="text-xs text-[var(--wh-foreground-subtle)]">
          {labels.explain}
        </p>
        {tracked === null ? <p className="text-sm text-[var(--wh-foreground-muted)]">{labels.checking}</p> : null}
        {lines.map((line, index) => (
          <ReceiptLineRow
            key={line.key}
            line={line}
            number={index + 1}
            tracked={tracked ?? []}
            labels={labels}
            onChange={(patch) => update(line.key, patch)}
            onRemove={lines.length > 1 ? () => setLines((current) => current.filter((entry) => entry.key !== line.key)) : undefined}
          />
        ))}
        <button
          type="button"
          onClick={() => {
            setLines((current) => [...current, { key: nextKey, name: "", quantity: "", unit: "", lineTotal: "", match: "new" }]);
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
  onChange,
  onRemove,
  labels,
}: {
  line: Line;
  number: number;
  tracked: { id: string; name: string }[];
  labels: ReceiptLabels;
  onChange: (patch: Partial<Line>) => void;
  onRemove?: () => void;
}) {
  const id = useId();
  const unitOptions = Array.from(new Set([line.unit, ...UNITS].filter(Boolean)));
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
    </div>
  );
}
