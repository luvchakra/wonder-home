"use client";

import { Pencil, Plus, Trash2, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition, type FormEvent } from "react";

import { ActionRow } from "@wonderhome/core/ui/action-row";
import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { CollapsibleSection } from "@wonderhome/core/ui/collapsible-section";
import { ComboboxField } from "@wonderhome/core/ui/combobox-field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Select } from "@wonderhome/core/ui/select";
import { Sheet } from "@wonderhome/core/ui/sheet";

import { removeRelationshipAction, saveRelationshipAction, type RelationshipState } from "../(auth)/relationship-actions";

/** Every word the Relationships card needs, in the reader's language (built on the server). */
export type RelationshipWords = {
  title: string;
  lede: string;
  empty: string;
  adminOnly: string;
  add: string;
  sheetAdd: string;
  sheetEdit: string;
  sheetLede: string;
  who: string;
  relation: string;
  whom: string;
  is: string;
  of: string;
  save: string;
  saving: string;
  /** "Change {sentence}" and "Remove {sentence}": each icon's own label (rule 11). */
  edit: string;
  remove: string;
  addNew: string;
  chooseExisting: string;
  newRelation: string;
  suggestedTitle: string;
  suggestedLede: string;
  addSuggested: string;
  /** The app's kinds, in the order offered, with the words to show. */
  kinds: string[];
  kindLabels: Record<string, string>;
  /** Why a row was refused, by problem code, with {who} and {whom}. */
  problems: Record<string, string>;
};

export type RelationshipRowView = { id: string; memberId: string; relation: string; relatedMemberId: string; sentence: string; reverse: string | null };
export type RelationshipSuggestionView = { memberId: string; relation: string; relatedMemberId: string; sentence: string };

const ICON_BUTTON =
  "grid size-11 place-items-center rounded-full border border-[var(--wh-border)] text-[var(--wh-foreground-muted)] transition-colors hover:bg-[var(--wh-surface-muted)] hover:text-[var(--wh-foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)] disabled:opacity-50";

const fill = (template: string, values: Record<string, string | undefined>) => template.replace(/\{(\w+)\}/g, (_all, key: string) => values[key] ?? "");

function problemText(state: RelationshipState, words: RelationshipWords): string | null {
  if (!state.error) return null;
  const template = state.problem ? words.problems[state.problem.code] : undefined;
  return template ? fill(template, { who: state.problem?.who, whom: state.problem?.whom }) : state.error;
}

/**
 * How the family is related (the owner, 2026-10-19): rows reading "Kunal is
 * father of Asmi", each with the other way round beneath it. An Admin adds,
 * changes and removes rows, and adds a suggestion in one tap; everyone else
 * reads them.
 */
export function RelationshipsCard({
  householdId,
  admin,
  people,
  rows,
  suggestions,
  words,
}: {
  householdId: string;
  admin: boolean;
  people: { id: string; name: string }[];
  rows: RelationshipRowView[];
  suggestions: RelationshipSuggestionView[];
  words: RelationshipWords;
}) {
  const canRelate = people.length >= 2;
  return (
    // Folded closed like the other collapsible cards (the owner, 2026-10-29): the header carries the title and lede.
    <CollapsibleSection id="relationships" icon={UsersRound} tone="people" title={words.title} intro={admin ? words.lede : words.adminOnly}>
      {admin && canRelate ? <div className="flex justify-end"><RelationshipSheet householdId={householdId} people={people} words={words} /></div> : null}
      {rows.length === 0 ? (
        <p className="py-2 text-sm text-[var(--wh-foreground-muted)]">{words.empty}</p>
      ) : (
        <ul className="divide-y divide-[var(--wh-border)]">
          {rows.map((row) => (
            <ActionRow
              key={row.id}
              icon={UsersRound}
              tone="people"
              title={row.sentence}
              meta={row.reverse ?? undefined}
              action={
                admin ? (
                  <div className="flex items-center gap-2">
                    <RelationshipSheet householdId={householdId} people={people} words={words} row={row} />
                    <RemoveRelationship householdId={householdId} id={row.id} label={fill(words.remove, { sentence: row.sentence })} />
                  </div>
                ) : undefined
              }
            />
          ))}
        </ul>
      )}
      {admin && suggestions.length > 0 ? (
        <div className="mt-3 space-y-1 border-t border-[var(--wh-border)] pt-3">
          <p className="text-sm font-semibold">{words.suggestedTitle}</p>
          <p className="text-xs text-[var(--wh-foreground-subtle)]">{words.suggestedLede}</p>
          <ul className="divide-y divide-[var(--wh-border)]">
            {suggestions.map((suggestion) => (
              <ActionRow
                key={`${suggestion.memberId}-${suggestion.relatedMemberId}`}
                icon={UsersRound}
                tone="people"
                title={suggestion.sentence}
                action={<AddSuggestion householdId={householdId} suggestion={suggestion} words={words} />}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </CollapsibleSection>
  );
}

/** Add a row, or change one: a person, "is", how, "of", a person — all picked. */
function RelationshipSheet({ householdId, people, words, row }: { householdId: string; people: { id: string; name: string }[]; words: RelationshipWords; row?: RelationshipRowView }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [state, formAction] = useActionState<RelationshipState, FormData>(async (previous, data) => {
    const result = await saveRelationshipAction(previous, data);
    if (!result.error) setOpen(false);
    return result;
  }, {});
  // Submitted by hand, so a refused row keeps what was picked.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  };
  const error = problemText(state, words);
  const [first, second] = people;
  return (
    <>
      {row ? (
        <button type="button" onClick={() => setOpen(true)} aria-label={fill(words.edit, { sentence: row.sentence })} title={fill(words.edit, { sentence: row.sentence })} className={ICON_BUTTON}>
          <Pencil aria-hidden className="size-4" />
        </button>
      ) : (
        <Pill type="button" tone="primary" onClick={() => setOpen(true)} className="shrink-0">
          <Plus aria-hidden className="size-4" /> {words.add}
        </Pill>
      )}
      <Sheet open={open} onOpenChange={setOpen} title={row ? words.sheetEdit : words.sheetAdd} description={words.sheetLede}>
        <form onSubmit={submit} className="space-y-3">
          {error ? <Alert>{error}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="id" value={row?.id ?? ""} />
          <Select label={words.who} name="memberId" required defaultValue={row?.memberId ?? first?.id}>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
          <p aria-hidden className="text-center text-sm font-semibold text-[var(--wh-foreground-muted)]">{words.is}</p>
          <ComboboxField
            label={words.relation}
            name="relation"
            required
            options={row && !words.kinds.includes(row.relation) ? [...words.kinds, row.relation] : words.kinds}
            optionLabels={words.kindLabels}
            defaultValue={row?.relation ?? words.kinds[0]}
            addNewLabel={words.addNew}
            chooseExistingLabel={words.chooseExisting}
            newValuePlaceholder={words.newRelation}
          />
          <p aria-hidden className="text-center text-sm font-semibold text-[var(--wh-foreground-muted)]">{words.of}</p>
          <Select label={words.whom} name="relatedMemberId" required defaultValue={row?.relatedMemberId ?? second?.id}>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? words.saving : words.save}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

/** One tap: the suggestion written exactly as shown. */
function AddSuggestion({ householdId, suggestion, words }: { householdId: string; suggestion: RelationshipSuggestionView; words: RelationshipWords }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Pill
        type="button"
        tone="soft"
        disabled={pending}
        aria-label={`${words.addSuggested}: ${suggestion.sentence}`}
        title={error ?? undefined}
        onClick={() =>
          startTransition(async () => {
            const data = new FormData();
            data.set("householdId", householdId);
            data.set("memberId", suggestion.memberId);
            data.set("relation", suggestion.relation);
            data.set("relatedMemberId", suggestion.relatedMemberId);
            const result = await saveRelationshipAction({}, data);
            if (result.error) setError(problemText(result, words));
            else router.refresh();
          })
        }
      >
        <Plus aria-hidden className="size-4" /> {words.addSuggested}
      </Pill>
      {error ? <span role="alert" className="sr-only">{error}</span> : null}
    </>
  );
}

function RemoveRelationship({ householdId, id, label }: { householdId: string; id: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        aria-label={label}
        title={error ?? label}
        className={ICON_BUTTON}
        onClick={() =>
          startTransition(async () => {
            const result = await removeRelationshipAction({ householdId, id });
            if (result.error) setError(result.error);
            else router.refresh();
          })
        }
      >
        <Trash2 aria-hidden className="size-4" />
      </button>
      {error ? <span role="alert" className="sr-only">{error}</span> : null}
    </>
  );
}
