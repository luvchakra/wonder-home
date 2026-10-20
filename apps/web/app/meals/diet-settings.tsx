"use client";

import { Salad } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { DIETS, type Diet } from "@wonderhome/core/meals/diet";
import { Alert } from "@wonderhome/core/ui/alert";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";

import { setDietAction } from "../(auth)/meal-actions";

export type DietSettingsLabels = {
  title: string;
  lede: string;
  family: string;
  notSet: string;
  diets: Record<Diet, string>;
  /** `{name}`. */
  dietOf: string;
  saved: string;
};

/**
 * Meals → Preferences → Diet (the owner, 2026-10-20): one diet for the whole
 * family, and one for anybody who eats differently, each picked from the
 * list (rule 20). "Not set" takes it away (rule 12). Anyone may set the
 * family's and their own; an Admin sets anybody's — the same rule every food
 * preference keeps. Planning a meal shows what fits.
 */
export function DietSettings({
  householdId,
  family,
  people,
  labels,
}: {
  householdId: string;
  family: Diet | null;
  /** Each member, whether this reader may change their diet, and the diet on record. */
  people: { memberId: string; name: string; diet: Diet | null; canEdit: boolean }[];
  labels: DietSettingsLabels;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "info" | "risk"; text: string } | null>(null);

  const save = (memberId: string | null, value: string) => {
    startTransition(async () => {
      const result = await setDietAction({ householdId, memberId, diet: value ? (value as Diet) : null });
      setMessage(result.ok ? { tone: "info", text: labels.saved } : { tone: "risk", text: result.error });
      if (result.ok) router.refresh();
    });
  };

  const rows: { key: string; memberId: string | null; name: string; diet: Diet | null; canEdit: boolean }[] = [
    { key: "family", memberId: null, name: labels.family, diet: family, canEdit: true },
    ...people.map((person) => ({ key: person.memberId, ...person })),
  ];

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start gap-3">
        <IconTile icon={Salad} tone="meals" />
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{labels.title}</h2>
          <p className="text-sm text-[var(--wh-foreground-muted)]">{labels.lede}</p>
        </div>
      </div>
      {message ? <Alert tone={message.tone === "info" ? "info" : undefined}>{message.text}</Alert> : null}
      <ul className="divide-y divide-[var(--wh-border)]">
        {rows.map((row) => (
          <li key={row.key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-2.5">
            {row.canEdit ? (
              <label htmlFor={`diet-${row.key}`} className="min-w-0 flex-1 text-sm font-medium break-words">
                {row.name}
              </label>
            ) : (
              <span className="min-w-0 flex-1 text-sm font-medium break-words">{row.name}</span>
            )}
            {row.canEdit ? (
              <select
                id={`diet-${row.key}`}
                aria-label={labels.dietOf.replace("{name}", row.name)}
                value={row.diet ?? ""}
                disabled={pending}
                onChange={(event) => save(row.memberId, event.target.value)}
                className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base sm:w-56"
              >
                <option value="">{labels.notSet}</option>
                {DIETS.map((diet) => (
                  <option key={diet} value={diet}>
                    {labels.diets[diet]}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm text-[var(--wh-foreground-muted)]">
                {row.diet ? labels.diets[row.diet] : labels.notSet}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
