"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatPlanPrice } from "@wonderhome/core/billing/plan-shared";
import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Badge } from "@wonderhome/core/ui/pill";

export type PriceLinkRow = { priceId: string; planName: string; interval: "month" | "year"; currency: string; amount: number; razorpay: string | null };

const fieldClass = "w-full min-w-0 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-2 py-1 text-sm";

/**
 * Each of our prices and the Razorpay plan that bills it. "Create in Razorpay"
 * makes the plan there from our price; "Link an existing plan" checks a pasted
 * id bills exactly our price before linking it. A linked row can be made
 * again (after moving from test keys to live ones, whose plans are separate):
 * the new plan replaces the old link. Platform owner only.
 */
export function PriceLinks({ rows, canEdit, razorpayLive }: { rows: PriceLinkRow[]; canEdit: boolean; razorpayLive: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-[var(--wh-foreground-muted)]">No plan has a price yet. Set prices on a plan above first.</p>;
  return (
    <div className="space-y-3">
      {!razorpayLive ? (
        <Alert tone="info">Razorpay isn&apos;t switched on yet. Add its keys under Configuration, set Payment providers to Razorpay, then create the plans here.</Alert>
      ) : null}
      <ul className="space-y-2">
        {rows.map((row) => (
          <PriceLinkItem key={row.priceId} row={row} canEdit={canEdit && razorpayLive} />
        ))}
      </ul>
    </div>
  );
}

function PriceLinkItem({ row, canEdit }: { row: PriceLinkRow; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [ref, setRef] = useState("");
  const [error, setError] = useState<string | null>(null);

  const send = async (body: { provider: "razorpay"; ref?: string }) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/platform-admin/prices/${row.priceId}/link`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "Couldn't link the price.");
      setPasting(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't link the price.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="space-y-2 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold break-words">
          {row.planName} · {formatPlanPrice(row.amount, row.currency)} {row.interval === "year" ? "a year" : "a month"}
        </p>
        {row.razorpay ? <Badge tone="handled">Linked to Razorpay</Badge> : <Badge tone="attention">Not linked</Badge>}
      </div>
      {row.razorpay ? <p className="text-xs break-all text-[var(--wh-foreground-muted)]">Razorpay plan {row.razorpay}</p> : null}
      {error ? <Alert>{error}</Alert> : null}
      {canEdit ? (
        pasting ? (
          <div className="flex flex-wrap items-center gap-2">
            <input aria-label="Razorpay plan id" className={`${fieldClass} sm:!w-64`} placeholder="plan_…" value={ref} onChange={(event) => setRef(event.target.value)} />
            <Button type="button" disabled={busy || !/^plan_[A-Za-z0-9]{6,40}$/.test(ref.trim())} onClick={() => void send({ provider: "razorpay", ref: ref.trim() })}>
              {busy ? "Checking…" : "Check and link"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setPasting(false)}>Cancel</Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={row.razorpay ? "secondary" : undefined} disabled={busy} onClick={() => void send({ provider: "razorpay" })}>{busy ? "Creating…" : row.razorpay ? "Create again in Razorpay" : "Create in Razorpay"}</Button>
            <Button type="button" variant="secondary" onClick={() => setPasting(true)}>Link an existing plan</Button>
          </div>
        )
      ) : null}
    </li>
  );
}
