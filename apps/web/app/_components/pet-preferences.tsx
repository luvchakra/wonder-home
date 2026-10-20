"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { ComboboxField } from "@wonderhome/core/ui/combobox-field";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import { removePetPreferenceAction, savePetPreferenceAction } from "../(auth)/home-actions";

export type PetPreferenceWords = {
  title: string;
  empty: string;
  add: string;
  sheetAdd: string;
  sheetEdit: string;
  kind: string;
  subject: string;
  subjectHint: string;
  note: string;
  save: string;
  saving: string;
  edit: string;
  remove: string;
  addNew: string;
  chooseExisting: string;
  /** Each known kind in the reader's language; a kind the household named shows as written. */
  kinds: Record<string, string>;
};

type Entry = { id: string; kind: string; subject: string; note: string | null };

const ICON_BUTTON =
  "grid size-11 shrink-0 place-items-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]";

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");

/**
 * What a pet likes (the owner, 2026-10-20): each like, dislike, favourite,
 * fear or allergy on its own row, grouped by kind, with change and remove as
 * icons so the words keep the room (rule 11). The kind is picked, with its
 * own Add new for one the list does not have (rule 20).
 */
export function PetPreferences({
  householdId,
  petId,
  petName,
  entries,
  editable,
  words,
}: {
  householdId: string;
  petId: string;
  petName: string;
  entries: Entry[];
  editable: boolean;
  words: PetPreferenceWords;
}) {
  const kindWords = (kind: string) => words.kinds[kind] ?? kind.replace(/_/g, " ");
  const groups = new Map<string, Entry[]>();
  for (const entry of entries) groups.set(entry.kind, [...(groups.get(entry.kind) ?? []), entry]);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{words.title}</h4>
        {editable ? <PreferenceSheet householdId={householdId} petId={petId} petName={petName} words={words} /> : null}
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-[var(--wh-foreground-muted)]">{fill(words.empty, { name: petName })}</p>
      ) : (
        <dl className="space-y-2">
          {[...groups.entries()].map(([kind, items]) => (
            <div key={kind}>
              <dt className="text-xs font-semibold text-[var(--wh-foreground-muted)] first-letter:uppercase">{kindWords(kind)}</dt>
              {items.map((entry) => (
                <dd key={entry.id} className="flex items-start gap-1">
                  <span className="min-w-0 flex-1 py-2 text-sm break-words">
                    {entry.subject}
                    {entry.note ? <span className="text-[var(--wh-foreground-subtle)]"> · {entry.note}</span> : null}
                  </span>
                  {editable ? (
                    <>
                      <PreferenceSheet householdId={householdId} petId={petId} petName={petName} words={words} entry={entry} />
                      <RemoveButton householdId={householdId} entry={entry} label={fill(words.remove, { name: entry.subject })} />
                    </>
                  ) : null}
                </dd>
              ))}
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function PreferenceSheet({ householdId, petId, petName, words, entry }: { householdId: string; petId: string; petName: string; words: PetPreferenceWords; entry?: Entry }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(async (previous, data) => {
    const result = await savePetPreferenceAction(previous, data);
    if (!result.error) {
      setOpen(false);
      router.refresh();
    }
    return result;
  }, {});
  return (
    <>
      {entry ? (
        <button type="button" className={ICON_BUTTON} aria-label={fill(words.edit, { name: entry.subject })} title={fill(words.edit, { name: entry.subject })} onClick={() => setOpen(true)}>
          <Pencil aria-hidden className="size-4" />
        </button>
      ) : (
        <Pill type="button" tone="quiet" onClick={() => setOpen(true)}>
          <Plus aria-hidden className="size-3.5" /> {words.add}
        </Pill>
      )}
      <Sheet open={open} onOpenChange={setOpen} title={fill(entry ? words.sheetEdit : words.sheetAdd, { name: petName })}>
        {open ? (
          <form action={formAction} className="space-y-4">
            {state.error ? <Alert>{state.error}</Alert> : null}
            <input type="hidden" name="householdId" value={householdId} />
            <input type="hidden" name="petId" value={petId} />
            {entry ? <input type="hidden" name="id" value={entry.id} /> : null}
            <ComboboxField
              label={words.kind}
              name="kind"
              required
              options={Object.keys(words.kinds)}
              optionLabels={words.kinds}
              defaultValue={entry?.kind ?? "like"}
              addNewLabel={words.addNew}
              chooseExistingLabel={words.chooseExisting}
            />
            <Field label={words.subject} name="subject" required defaultValue={entry?.subject ?? ""} autoComplete="off" hint={fill(words.subjectHint, { name: petName })} />
            <Field label={words.note} name="note" defaultValue={entry?.note ?? ""} autoComplete="off" />
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? words.saving : words.save}
            </Button>
          </form>
        ) : null}
      </Sheet>
    </>
  );
}

function RemoveButton({ householdId, entry, label }: { householdId: string; entry: Entry; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className={ICON_BUTTON}
        aria-label={label}
        title={error ?? label}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await removePetPreferenceAction({ householdId, id: entry.id });
            if (result.error) setError(result.error);
            else router.refresh();
          })
        }
      >
        <Trash2 aria-hidden className="size-4" />
      </button>
      {error ? (
        <span role="alert" className="sr-only">
          {error}
        </span>
      ) : null}
    </>
  );
}
