"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { featureLines, formatPlanPrice, limitWords, parseAmount, planBadge, yearlySavingWords, type FeatureLine, type PlanEdit, type PlanSnapshot } from "@wonderhome/core/billing/plan-shared";
import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Badge } from "@wonderhome/core/ui/pill";

import { PlanCard } from "../../_components/plan-card";

/**
 * One plan, drawn by the member plan list's own card (`PlanCard`), editable in
 * place. "Preview as member" is the same card with the inputs gone. Save asks
 * the server what would change, shows it in sentences, and saves only on a
 * second click. Only the platform owner gets the edit button; the route
 * refuses everyone else regardless.
 */
export type PlanEditorWords = { early: string; perMonth: string; perYear: string; saveNote: string };

const fieldClass =
  "w-full min-w-0 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-2 py-1 text-sm";

export function PlanEditor({ plan, words, canEdit }: { plan: PlanSnapshot; words: PlanEditorWords; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [name, setName] = useState(plan.name);
  const [description, setDescription] = useState(plan.description ?? "");
  const [monthly, setMonthly] = useState(plan.monthly === null ? "" : String(plan.monthly));
  const [yearly, setYearly] = useState(plan.yearly === null ? "" : String(plan.yearly));
  const [features, setFeatures] = useState(plan.features.map((row) => ({ ...row, limitText: row.limit === null ? "" : String(row.limit) })));
  const [lines, setLines] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string[] | null>(null);

  const monthlyAmount = monthly.trim() === "" ? null : parseAmount(monthly);
  const yearlyAmount = yearly.trim() === "" ? null : parseAmount(yearly);
  const badMonthly = monthly.trim() !== "" && monthlyAmount === null;
  const badYearly = yearly.trim() !== "" && yearlyAmount === null;
  const badLimit = features.some((row) => row.enabled && row.limitText.trim() !== "" && !/^[1-9]\d{0,8}$/.test(row.limitText.trim()));
  const invalid = badMonthly || badYearly || badLimit || name.trim() === "";

  // The same fields the member card reads, from what is typed.
  const shown = editing ? { monthly: monthlyAmount, yearly: yearlyAmount } : { monthly: plan.monthly, yearly: plan.yearly };
  const badge = planBadge({ requiresPayment: plan.requiresPayment, ...shown });
  const priceOf = (amount: number | null, template: string) => (amount === null ? null : template.replace("{price}", formatPlanPrice(amount)));
  const priceText = priceOf(shown.monthly, words.perMonth);
  const yearlyText = priceOf(shown.yearly, words.perYear);
  const percent = shown.monthly && shown.yearly && shown.monthly > 0 ? Math.round((1 - shown.yearly / (shown.monthly * 12)) * 100) : 0;
  const perMonth = shown.yearly === null ? null : words.perMonth.replace("{price}", formatPlanPrice(Math.floor((shown.yearly / 12) * 100) / 100));
  const yearlyNote = perMonth && percent > 0 ? words.saveNote.replace("{perMonth}", perMonth).replace("{percent}", String(percent)) : perMonth;

  const edit: PlanEdit = {
      name: name.trim(),
      description: description.trim() === "" ? null : description.trim(),
      monthly: monthlyAmount,
      yearly: yearlyAmount,
      features: features.map((row) => ({ featureKey: row.featureKey, enabled: row.enabled, limit: row.limitText.trim() === "" ? null : Number(row.limitText) })),
  };
  const memberFeatures: FeatureLine[] = featureLines(
    features.map((row) => ({ featureKey: row.featureKey, enabled: row.enabled, limit: row.limitText.trim() === "" ? null : Number(row.limitText) || null, period: row.period === "forever" && row.limitText.trim() !== "" ? "month" : row.limitText.trim() === "" ? "forever" : row.period })),
  );

  const send = async (confirm: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/platform-admin/plans/${encodeURIComponent(plan.key)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ edit: { ...edit, monthly: monthlyAmount === null ? null : String(monthlyAmount), yearly: yearlyAmount === null ? null : String(yearlyAmount) }, confirm }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "Could not save the plan.");
      const result = (payload.data ?? payload) as { saved: boolean; lines: string[] };
      if (confirm) {
        setSaved(result.lines.length > 0 ? result.lines : ["Nothing changed."]);
        setLines(null);
        setEditing(false);
        router.refresh();
      } else {
        setLines(result.lines.length > 0 ? result.lines : ["Nothing changed."]);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the plan.");
    } finally {
      setBusy(false);
    }
  };

  const asMember = !editing || previewing;
  const savingWords = yearlySavingWords(shown.monthly, shown.yearly);

  return (
    <section className="space-y-3 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] p-3" aria-label={plan.name}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={badge === "free" ? "handled" : "money"}>{badge === "free" ? "Free" : badge === "paid" ? "Paid" : "Priced · free during early access"}</Badge>
        {plan.active ? null : <Badge tone="neutral">Retired</Badge>}
        <span className="text-xs text-[var(--wh-foreground-muted)]">{asMember ? "As members see it" : "Editing"}</span>
        <span className="ml-auto flex flex-wrap gap-2">
          {editing ? (
            <Button type="button" variant="secondary" onClick={() => setPreviewing((on) => !on)}>
              {previewing ? "Back to editing" : "Preview as member"}
            </Button>
          ) : null}
          {canEdit && !editing ? (
            <Button type="button" variant="secondary" onClick={() => { setEditing(true); setSaved(null); }}>
              Edit
            </Button>
          ) : null}
        </span>
      </div>

      <PlanCard
        showOff={!asMember}
        plan={{
          name: editing ? name : plan.name,
          description: editing ? description.trim() || null : plan.description,
          priceText: priceText ?? undefined,
          priceNote: yearlyText ? `${yearlyText}${yearlyNote ? ` · ${yearlyNote}` : ""}` : null,
          earlyAccessLabel: badge === "earlyAccess" ? words.early : null,
          features: asMember ? memberFeatures.filter((line) => line.enabled) : memberFeatures,
        }}
        slots={
          asMember
            ? undefined
            : {
                name: <input aria-label="Plan name" className={fieldClass} value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />,
                description: <textarea aria-label="Plan description" className={`${fieldClass} mt-1`} rows={2} maxLength={300} value={description} onChange={(event) => setDescription(event.target.value)} />,
                price: (
                  <div className="mt-1 grid gap-2 sm:grid-cols-2">
                    <label className="text-xs">
                      Monthly price (₹)
                      <input aria-label="Monthly price in rupees" inputMode="decimal" className={fieldClass} value={monthly} onChange={(event) => setMonthly(event.target.value)} aria-invalid={badMonthly} placeholder="299 or 299.50" />
                    </label>
                    <label className="text-xs">
                      Yearly price (₹)
                      <input aria-label="Yearly price in rupees" inputMode="decimal" className={fieldClass} value={yearly} onChange={(event) => setYearly(event.target.value)} aria-invalid={badYearly} placeholder="2870" />
                    </label>
                    {badMonthly || badYearly ? <p className="text-xs text-[var(--wh-attention)] sm:col-span-2">Use a plain amount such as 349 or 349.50 — at most two decimals.</p> : null}
                    {savingWords ? <p className="text-xs text-[var(--wh-foreground-muted)] sm:col-span-2">{savingWords}</p> : null}
                  </div>
                ),
                feature: (line) => {
                  const index = features.findIndex((row) => row.featureKey === line.featureKey);
                  const row = features[index]!;
                  const update = (patch: Partial<typeof row>) => setFeatures((all) => all.map((candidate, at) => (at === index ? { ...candidate, ...patch } : candidate)));
                  return (
                    <span className="flex w-full flex-wrap items-center gap-2">
                      <label className="flex min-w-0 flex-1 items-center gap-1.5">
                        <input type="checkbox" checked={row.enabled} onChange={(event) => update({ enabled: event.target.checked })} />
                        <span className="min-w-0 break-words">{line.label}</span>
                      </label>
                      {row.enabled ? (
                        <input
                          aria-label={`${line.label} limit a month, empty for unlimited`}
                          inputMode="numeric"
                          className={`${fieldClass} !w-24`}
                          value={row.limitText}
                          placeholder="Unlimited"
                          onChange={(event) => update({ limitText: event.target.value })}
                        />
                      ) : (
                        <span className="text-[var(--wh-foreground-muted)]">{limitWords({ enabled: false, limit: null })}</span>
                      )}
                    </span>
                  );
                },
              }
        }
      />

      {error ? <Alert>{error}</Alert> : null}
      {saved ? (
        <Alert tone="info">
          <span className="block font-semibold">Saved. Members see this within a minute.</span>
          {saved.map((line) => <span key={line} className="mt-1 block">{line}</span>)}
        </Alert>
      ) : null}

      {editing && !lines ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy || invalid} onClick={() => void send(false)}>{busy ? "Checking…" : "Review changes"}</Button>
          <Button type="button" variant="secondary" onClick={() => { setEditing(false); setPreviewing(false); setError(null); }}>Cancel</Button>
        </div>
      ) : null}
      {editing && lines ? (
        <div className="space-y-2 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] p-3">
          <p className="text-sm font-semibold">Saving will change, for members:</p>
          <ul className="space-y-1 text-sm">{lines.map((line) => <li key={line}>{line}</li>)}</ul>
          <p className="text-xs text-[var(--wh-foreground-muted)]">Changing a price here does not change it at the payment provider. A new price cannot be bought until it is mapped there.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy || lines[0] === "Nothing changed."} onClick={() => void send(true)}>{busy ? "Saving…" : "Save changes"}</Button>
            <Button type="button" variant="secondary" onClick={() => setLines(null)}>Keep editing</Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
