"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Sheet } from "@wonderhome/core/ui/sheet";

import { saveBillSplitAction } from "../(auth)/bill-split-actions";

export type SplitLabels = { button: string; title: string; description: string; percent: string; total: string; save: string; remove: string; failed: string };

/**
 * "Split between adults" (11-026): tick who shares the bill, each with a
 * percentage (equal to start with); saved only when it makes 100%.
 */
export function BillSplitControl({ householdId, obligationId, billName, adults, current, labels }: { householdId: string; obligationId: string; billName: string; adults: { id: string; name: string }[]; current: { memberId: string; basisPoints: number }[]; labels: SplitLabels }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const initial = new Map(current.map((share) => [share.memberId, share.basisPoints / 100]));
  const [picked, setPicked] = useState<Map<string, number>>(initial);
  const total = [...picked.values()].reduce((sum, value) => sum + value, 0);

  function toggle(memberId: string) {
    const next = new Map(picked);
    if (next.has(memberId)) next.delete(memberId);
    else next.set(memberId, 0);
    // Even shares whenever who shares it changes; each can then be changed.
    const even = next.size > 0 ? Math.floor(10000 / next.size) / 100 : 0;
    let index = 0;
    for (const id of next.keys()) next.set(id, index++ === 0 ? Math.round((100 - even * (next.size - 1)) * 100) / 100 : even);
    setPicked(next);
  }

  function save(shares: { memberId: string; basisPoints: number }[]) {
    setError(null);
    start(async () => {
      const result = await saveBillSplitAction({ householdId, obligationId, shares });
      if (result.error) return setError(result.error);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {labels.button}
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title={labels.title.replace("{name}", billName)} description={labels.description}>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            save([...picked.entries()].map(([memberId, percent]) => ({ memberId, basisPoints: Math.round(percent * 100) })));
          }}
        >
          {error ? <Alert>{error}</Alert> : null}
          <ul className="space-y-2">
            {adults.map((adult) => (
              <li key={adult.id} className="flex flex-wrap items-center gap-3">
                <label className="flex min-h-11 flex-1 items-center gap-2 text-sm break-words">
                  <input type="checkbox" checked={picked.has(adult.id)} onChange={() => toggle(adult.id)} />
                  {adult.name}
                </label>
                {picked.has(adult.id) ? (
                  <input
                    type="number"
                    min={0.01}
                    max={100}
                    step={0.01}
                    inputMode="decimal"
                    aria-label={`${adult.name} ${labels.percent}`}
                    value={picked.get(adult.id)}
                    onChange={(event) => setPicked(new Map(picked).set(adult.id, Number(event.target.value)))}
                    className="min-h-11 w-24 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-2 text-sm"
                  />
                ) : null}
              </li>
            ))}
          </ul>
          <p className={`text-sm ${Math.abs(total - 100) < 0.005 ? "text-[var(--wh-foreground-muted)]" : "text-[var(--wh-attention)]"}`}>{labels.total.replace("{percent}", total.toFixed(2))}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending || picked.size < 2 || Math.abs(total - 100) >= 0.005}>
              {labels.save}
            </Button>
            {current.length > 0 ? (
              <Button type="button" variant="secondary" disabled={pending} onClick={() => save([])}>
                {labels.remove}
              </Button>
            ) : null}
          </div>
        </form>
      </Sheet>
    </>
  );
}
