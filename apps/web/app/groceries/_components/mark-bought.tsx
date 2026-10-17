"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  displayAmount,
  parseQuantity,
  toBase,
} from "@wonderhome/core/commerce/units";
import { Button } from "@wonderhome/core/ui/button";
import { Sheet } from "@wonderhome/core/ui/sheet";

import { markBoughtAction } from "../../(auth)/grocery-actions";
import type { GroceryWords } from "../../_lib/grocery-words";
import { fill, newKey, pluralOf, unitsFor } from "./amounts";

export type BoughtLine = {
  entryId: string;
  itemId: string;
  name: string;
  /** The item's preferred unit. */
  unit: string;
  /** What is on the list, in base units. */
  quantity: number;
  baseUnit: string;
};

type Draft = { include: boolean; text: string; unit: string };

/**
 * "Mark as bought" (design §3.4): each line on the list, prefilled with
 * what was to be bought, for the person to change to what they actually
 * bought. Confirming records a purchase, adds that much to what is at home,
 * and closes the entry — or leaves it open with the rest when only part was
 * bought. One key per confirm, so a double tap records once.
 */
export function MarkBoughtButton({
  householdId,
  lines,
  words,
  today,
}: {
  householdId: string;
  lines: BoughtLine[];
  words: GroceryWords;
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [day, setDay] = useState(today);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);

  const start = () => {
    setDrafts(
      Object.fromEntries(
        lines.map((line) => {
          const shown = displayAmount({
            quantity: line.quantity,
            unit: line.baseUnit,
          });
          return [
            line.entryId,
            { include: true, text: String(shown.quantity), unit: shown.unit },
          ];
        }),
      ),
    );
    setDay(today);
    setMessage(null);
    setOpen(true);
  };

  const chosen = lines.filter((line) => drafts[line.entryId]?.include);

  const confirm = async () => {
    if (chosen.length === 0) {
      setMessage({ tone: "error", text: words.bought.nothingChosen });
      return;
    }
    const payload = [];
    for (const line of chosen) {
      const draft = drafts[line.entryId]!;
      const value = parseQuantity(draft.text);
      if (!value) {
        setMessage({
          tone: "error",
          text: fill(words.bought.amountOf, { name: line.name }),
        });
        return;
      }
      const amount = toBase(value, draft.unit);
      payload.push({
        entryId: line.entryId,
        itemId: line.itemId,
        quantity: amount.quantity,
        unit: amount.unit,
      });
    }
    setBusy(true);
    const result = await markBoughtAction({
      householdId,
      purchasedOn: day,
      key: newKey("bought"),
      lines: payload,
    });
    setBusy(false);
    if (!result.ok) {
      setMessage({
        tone: "error",
        text:
          result.recorded > 0
            ? fill(
                pluralOf(
                  words.language,
                  words.bought.plurals.failedAfter,
                  result.recorded,
                ),
                { reason: result.error },
              )
            : result.error,
      });
      router.refresh();
      return;
    }
    const done = pluralOf(
      words.language,
      words.bought.plurals.done,
      result.recorded,
    );
    const partial =
      result.stillToBuy > 0
        ? ` ${pluralOf(words.language, words.bought.plurals.partial, result.stillToBuy)}`
        : "";
    setMessage({ tone: "ok", text: `${done}${partial}` });
    setOpen(false);
    router.refresh();
  };

  return (
    <div className="space-y-2">
      <Button type="button" onClick={start} className="w-full gap-2">
        <Check aria-hidden className="size-4" /> {words.bought.open}
      </Button>
      {message && !open ? (
        <p
          role="status"
          className={`text-sm ${message.tone === "ok" ? "text-[var(--wh-handled)]" : "text-[var(--wh-risk)]"}`}
        >
          {message.text}
        </p>
      ) : null}
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={words.bought.title}
        description={words.bought.description}
      >
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void confirm();
          }}
        >
          <ul className="divide-y divide-[var(--wh-border)]">
            {lines.map((line) => {
              const draft = drafts[line.entryId];
              if (!draft) return null;
              const update = (patch: Partial<Draft>) =>
                setDrafts((current) => ({
                  ...current,
                  [line.entryId]: { ...draft, ...patch },
                }));
              return (
                <li
                  key={line.entryId}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5"
                >
                  <label className="flex min-w-0 flex-1 basis-40 items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={draft.include}
                      onChange={(event) =>
                        update({ include: event.target.checked })
                      }
                      aria-label={fill(words.bought.include, {
                        name: line.name,
                      })}
                      className="size-5 shrink-0 accent-[var(--wh-primary)]"
                    />
                    <span className="text-[0.9375rem] font-medium break-words">
                      {line.name}
                    </span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      inputMode="decimal"
                      value={draft.text}
                      disabled={!draft.include}
                      onChange={(event) => update({ text: event.target.value })}
                      aria-label={fill(words.bought.amountOf, {
                        name: line.name,
                      })}
                      className="h-10 w-20 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-2.5 text-right text-base tabular-nums disabled:opacity-50"
                    />
                    <select
                      value={draft.unit}
                      disabled={!draft.include}
                      onChange={(event) => update({ unit: event.target.value })}
                      aria-label={words.amountSheet.unit}
                      className="h-10 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-2 text-sm disabled:opacity-50"
                    >
                      {unitsFor(line.unit).map((choice) => (
                        <option key={choice} value={choice}>
                          {words.unitNames[choice] ?? choice}
                        </option>
                      ))}
                    </select>
                  </div>
                </li>
              );
            })}
          </ul>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{words.bought.on}</span>
            <input
              type="date"
              value={day}
              max={today}
              onChange={(event) => setDay(event.target.value)}
              className="block h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
            />
          </label>
          {message?.tone === "error" ? (
            <p role="alert" className="text-sm text-[var(--wh-risk)]">
              {message.text}
            </p>
          ) : null}
          <Button type="submit" disabled={busy} className="w-full">
            {busy
              ? words.bought.recording
              : pluralOf(
                  words.language,
                  words.bought.plurals.confirm,
                  chosen.length,
                )}
          </Button>
        </form>
      </Sheet>
    </div>
  );
}
