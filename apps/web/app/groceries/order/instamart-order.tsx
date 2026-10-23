"use client";

import { Minus, Plus, ShoppingBasket } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { displayAmount } from "@wonderhome/core/commerce/units";
import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Select } from "@wonderhome/core/ui/select";

import { matchListAction, placeOrderAction, reviewCartAction, type CartView, type MatchedLine, type Problem } from "./actions";

/**
 * The Instamart order flow on one screen (story 25-032), in the order a
 * person decides: where it goes, what each list line becomes, what Swiggy's
 * cart and bill say, and only then the one button that orders. Every pick is
 * the person's; the suggestion is a starting point they can change or leave
 * out. Words arrive as props in the viewer's language.
 */

export type InstamartWords = {
  deliverTo: string;
  match: string;
  matching: string;
  matchLede: string;
  wanted: string;
  notFound: string;
  product: string;
  packs: string;
  fewer: string;
  more: string;
  leaveOut: string;
  review: string;
  reviewing: string;
  cartTitle: string;
  deliveredTo: string;
  payWith: string;
  payments: Record<"COD" | "SwiggyPay", string>;
  noPayment: string;
  place: string;
  placing: string;
  placeNote: string;
  placedDefault: string;
  placedPartial: string;
  changed: string;
  unknown: string;
  refused: string;
  problems: Record<Problem, string>;
  badge: string;
};

type Pick = { spinId: string; packs: number; include: boolean };

export function InstamartOrder({
  householdId,
  addresses,
  defaultAddressId,
  language,
  words,
}: {
  householdId: string;
  addresses: { id: string; label: string | null; line: string }[];
  defaultAddressId: string | null;
  language: string;
  words: InstamartWords;
}) {
  const [addressId, setAddressId] = useState(defaultAddressId ?? addresses[0]?.id ?? "");
  const [lines, setLines] = useState<MatchedLine[] | null>(null);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [cart, setCart] = useState<CartView | null>(null);
  const [payment, setPayment] = useState<"COD" | "SwiggyPay" | null>(null);
  const [message, setMessage] = useState<{ tone: "info" | "attention"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"match" | "review" | "place" | null>(null);

  const rupees = useMemo(() => new Intl.NumberFormat(language, { style: "currency", currency: "INR", maximumFractionDigits: 2 }), [language]);
  const fill = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");

  const run = (step: "match" | "review" | "place", work: () => Promise<void>) => {
    setBusy(step);
    setMessage(null);
    start(async () => {
      try {
        await work();
      } finally {
        setBusy(null);
      }
    });
  };

  const match = () =>
    run("match", async () => {
      const result = await matchListAction({ householdId, addressId });
      if ("problem" in result) return setMessage({ tone: "attention", text: words.problems[result.problem] });
      setLines(result.lines);
      setCart(null);
      setPicks(Object.fromEntries(result.lines.map((line) => [line.entryId, { spinId: line.pick?.spinId ?? line.options[0]?.spinId ?? "", packs: line.pick?.packs ?? 1, include: Boolean(line.pick) }])));
    });

  const chosen = () =>
    (lines ?? []).flatMap((line) => {
      const pick = picks[line.entryId];
      const option = line.options.find((candidate) => candidate.spinId === pick?.spinId);
      return pick?.include && option ? [{ entryId: line.entryId, spinId: option.spinId, skuId: option.skuId, packs: pick.packs }] : [];
    });

  const review = () =>
    run("review", async () => {
      const result = await reviewCartAction({ householdId, addressId, picks: chosen() });
      if ("problem" in result) return setMessage({ tone: "attention", text: words.problems[result.problem] });
      if ("refused" in result) return setMessage({ tone: "attention", text: fill(words.refused, { message: result.refused }) });
      setCart(result.cart);
      setPayment(result.cart.payments[0] ?? null);
    });

  const place = () =>
    run("place", async () => {
      if (!cart || !payment) return;
      const result = await placeOrderAction({ householdId, addressId, payment, reviewed: cart.fingerprint, picks: chosen() });
      if ("placed" in result) {
        setCart(null);
        setLines(null);
        // Swiggy asks for its own success message to be shown as it is.
        return setMessage({ tone: "info", text: result.placed.partial ? `${result.placed.message ?? words.placedDefault} ${words.placedPartial}` : (result.placed.message ?? words.placedDefault) });
      }
      if ("changed" in result) {
        setCart(null);
        return setMessage({ tone: "info", text: words.changed });
      }
      if ("unknown" in result) return setMessage({ tone: "attention", text: words.unknown });
      if ("refused" in result) return setMessage({ tone: "attention", text: fill(words.refused, { message: result.refused }) });
      setMessage({ tone: "attention", text: words.problems[result.problem] });
    });

  const setPick = (entryId: string, change: Partial<Pick>) => {
    setPicks((current) => ({ ...current, [entryId]: { ...current[entryId]!, ...change } }));
    setCart(null);
  };

  return (
    <div className="space-y-4">
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}

      <Card className="space-y-3">
        <Select label={words.deliverTo} name="addressId" value={addressId} onChange={(event) => { setAddressId(event.target.value); setCart(null); setLines(null); }}>
          {addresses.map((address) => (
            <option key={address.id} value={address.id}>
              {[address.label, address.line].filter(Boolean).join(" — ")}
            </option>
          ))}
        </Select>
        {/* The picker can cut a long address short; the whole of it is said here (rule 15). */}
        {addresses.find((address) => address.id === addressId)?.line ? <p className="text-sm break-words text-[var(--wh-foreground-muted)]">{addresses.find((address) => address.id === addressId)!.line}</p> : null}
        <Button type="button" onClick={match} disabled={pending || !addressId} className="w-full sm:w-auto">
          {busy === "match" ? words.matching : words.match}
        </Button>
      </Card>

      {lines ? (
        <section className="space-y-3" aria-live="polite">
          <p className="px-1 text-sm text-[var(--wh-foreground-muted)]">{words.matchLede}</p>
          <ul className="space-y-3">
            {lines.map((line) => {
              const pick = picks[line.entryId];
              const option = line.options.find((candidate) => candidate.spinId === pick?.spinId) ?? null;
              const max = option?.maxQuantity && option.maxQuantity > 0 ? Math.min(20, option.maxQuantity) : 10;
              return (
                <li key={line.entryId}>
                  <Card className={pick?.include ? "space-y-3" : "space-y-3 opacity-70"}>
                    <div className="flex items-start gap-3">
                      {option?.imageUrl ? (
                        // Swiggy's own product picture, as its search returned it.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={option.imageUrl} alt="" width={44} height={44} className="size-11 shrink-0 rounded-[var(--wh-radius-sm)] bg-white object-contain" />
                      ) : (
                        <IconTile icon={ShoppingBasket} tone="home" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold break-words">{line.name}</p>
                        <p className="text-sm text-[var(--wh-foreground-muted)]">{fill(words.wanted, { amount: sayAmount(line.quantity, line.unit, language) })}</p>
                      </div>
                      {line.options.length > 0 ? (
                        <label className="flex min-h-11 shrink-0 items-center gap-2 text-sm">
                          <input type="checkbox" className="size-5 accent-[var(--wh-primary)]" checked={!pick?.include} onChange={(event) => setPick(line.entryId, { include: !event.target.checked })} />
                          {words.leaveOut}
                        </label>
                      ) : null}
                    </div>
                    {line.options.length === 0 ? (
                      <p className="text-sm text-[var(--wh-foreground-muted)]">{words.notFound}</p>
                    ) : pick?.include ? (
                      <div className="space-y-3">
                      {/* The chosen product in full, wrapping: a picker may cut a long name short (rules 11, 15). */}
                      {option ? (
                        <p className="text-sm break-words">
                          <span className="font-medium">{option.name}</span>
                          <span className="text-[var(--wh-foreground-muted)]"> · {option.pack} · {rupees.format(option.price)}</span>
                        </p>
                      ) : null}
                      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                        <Select label={words.product} name={`product-${line.entryId}`} value={pick.spinId} onChange={(event) => setPick(line.entryId, { spinId: event.target.value, packs: 1 })}>
                          {line.options.map((candidate) => (
                            <option key={candidate.spinId} value={candidate.spinId}>
                              {[candidate.brand && !candidate.name.includes(candidate.brand) ? candidate.brand : null, candidate.name, candidate.pack, rupees.format(candidate.price)].filter(Boolean).join(" · ")}
                            </option>
                          ))}
                        </Select>
                        <div className="space-y-1.5">
                          <span className="block text-sm font-medium">{words.packs}</span>
                          <div className="flex items-center gap-2">
                            <button type="button" aria-label={fill(words.fewer, { name: line.name })} disabled={pick.packs <= 1} onClick={() => setPick(line.entryId, { packs: pick.packs - 1 })} className="grid size-11 place-items-center rounded-full border border-[var(--wh-border)] bg-[var(--wh-surface)] disabled:opacity-40">
                              <Minus aria-hidden className="size-4" />
                            </button>
                            <span className="min-w-8 text-center font-semibold tabular-nums" aria-live="polite">{pick.packs}</span>
                            <button type="button" aria-label={fill(words.more, { name: line.name })} disabled={pick.packs >= max} onClick={() => setPick(line.entryId, { packs: pick.packs + 1 })} className="grid size-11 place-items-center rounded-full border border-[var(--wh-border)] bg-[var(--wh-surface)] disabled:opacity-40">
                              <Plus aria-hidden className="size-4" />
                            </button>
                            {option ? <span className="text-sm text-[var(--wh-foreground-muted)] tabular-nums">{rupees.format(option.price * pick.packs)}</span> : null}
                          </div>
                        </div>
                      </div>
                      </div>
                    ) : null}
                  </Card>
                </li>
              );
            })}
          </ul>
          <Button type="button" onClick={review} disabled={pending || chosen().length === 0} className="w-full sm:w-auto">
            {busy === "review" ? words.reviewing : words.review}
          </Button>
        </section>
      ) : null}

      {cart ? (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">{words.cartTitle}</h2>
            <PoweredByInstamart label={words.badge} />
          </div>
          <ul className="divide-y divide-[var(--wh-border)]">
            {cart.items.map((item) => (
              <li key={item.spinId} className="flex items-start justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 break-words">
                  {item.name}
                  {item.variant ? <span className="text-[var(--wh-foreground-muted)]"> · {item.variant}</span> : null}
                  <span className="text-[var(--wh-foreground-muted)]"> × {item.quantity}</span>
                </span>
                <span className="shrink-0 font-medium tabular-nums">{rupees.format(item.price)}</span>
              </li>
            ))}
          </ul>
          <dl className="space-y-1 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] px-3 py-2 text-sm">
            {cart.bill.map((line) => (
              <div key={line.label} className="flex justify-between gap-3">
                <dt className="text-[var(--wh-foreground-muted)]">{line.label}</dt>
                <dd className="tabular-nums">{line.value}</dd>
              </div>
            ))}
            {cart.toPay ? (
              <div className="flex justify-between gap-3 border-t border-[var(--wh-border)] pt-1 font-semibold">
                <dt>{cart.toPay.label}</dt>
                <dd className="tabular-nums">{cart.toPay.value}</dd>
              </div>
            ) : null}
          </dl>
          {cart.warnings.map((warning) => (
            <Alert key={warning} tone="info">
              {warning}
            </Alert>
          ))}
          {cart.deliverTo ? <p className="text-sm">{fill(words.deliveredTo, { address: cart.deliverTo })}</p> : null}
          {cart.payments.length > 0 ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{words.payWith}</legend>
              <div className="flex flex-wrap gap-2">
                {cart.payments.map((method) => (
                  <label key={method} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--wh-radius-pill)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-4 text-sm has-[:checked]:border-[var(--wh-primary)] has-[:checked]:bg-[var(--wh-primary-soft)]">
                    <input type="radio" name="payment" value={method} checked={payment === method} onChange={() => setPayment(method)} className="accent-[var(--wh-primary)]" />
                    {words.payments[method]}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <Alert tone="info">{words.noPayment}</Alert>
          )}
          <p className="text-xs text-[var(--wh-foreground-subtle)]">{words.placeNote}</p>
          <Button type="button" onClick={place} disabled={pending || !payment || cart.items.length === 0 || cart.warnings.length > 0 || cart.unserviceable.length > 0} className="w-full sm:w-auto">
            {busy === "place" ? words.placing : words.place}
          </Button>
        </Card>
      ) : null}
    </div>
  );
}

/** 1000 g as "1 kg", 2000 ml as "2 l": the list's own amount in the unit a person says. */
function sayAmount(quantity: number, unit: string, language: string): string {
  const shown = displayAmount({ quantity, unit });
  return `${new Intl.NumberFormat(language, { maximumFractionDigits: 3 }).format(shown.quantity)} ${shown.unit}`;
}

/** Swiggy's required attribution: the square Instamart logo before the exact words, kept together. */
export function PoweredByInstamart({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--wh-foreground)]">
      {/* Decorative: the words beside it say it once. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/instamart.png" alt="" width={24} height={24} className="size-6 rounded-[5px]" />
      {label}
    </span>
  );
}
