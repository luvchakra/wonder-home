"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import type { PrivacyScope } from "@wonderhome/core/health/repository";
import { Select } from "@wonderhome/core/ui/select";

import type { HealthFormLabels } from "../_lib/health-form-labels";

/** The stored values, in the order they are offered; their words come from `labels` (story 22-004). */
const SCOPES: readonly PrivacyScope[] = ["private", "selected_family", "household_operational"];

/**
 * What every health sheet needs to show "People I choose" (the owner,
 * 2026-10-21: picking it "no choice is coming up", and an edit had no way to
 * change who can see a record at all). Read once by the page and handed down
 * through context, so the eight sheets and their row actions don't each
 * thread four more props.
 */
export type HealthSharing = {
  viewerMemberId: string;
  members: { id: string; displayName: string }[];
  /** Each subject's current sharing list, as far as this viewer's session can read it. */
  viewersBySubject: Record<string, string[]>;
  /** The viewer themselves and the children they guard — whose list RLS lets them change. */
  shareableSubjectIds: string[];
};

const SharingContext = createContext<HealthSharing | null>(null);

export function HealthSharingProvider({ value, children }: { value: HealthSharing; children: ReactNode }) {
  return <SharingContext.Provider value={value}>{children}</SharingContext.Provider>;
}

function fill(template: string, name: string): string {
  return template.split("{name}").join(name);
}

/**
 * "Who can see this", and — once "People I choose" is picked — the people.
 *
 * `health_consents` is per person, not per record, so the list is the
 * subject's own sharing list and the line above it says so: ticking someone
 * here lets them see everything of that person's marked "People I choose".
 * Only the subject or their guardian may change it (RLS); anyone else sees
 * that said plainly, never a control that would be refused.
 *
 * The subject is `subjectMemberId` in an edit sheet; in a create sheet it
 * follows the form's own `memberId` picker, whichever way that is built.
 */
export function HealthPrivacyField({
  labels,
  defaultValue,
  subjectMemberId,
}: {
  labels: HealthFormLabels;
  defaultValue: PrivacyScope;
  subjectMemberId?: string;
}) {
  const sharing = useContext(SharingContext);
  const ref = useRef<HTMLDivElement>(null);
  const [scope, setScope] = useState<PrivacyScope>(defaultValue);
  const [pickedSubject, setPickedSubject] = useState<string | null>(null);

  useEffect(() => {
    if (subjectMemberId) return;
    const form = ref.current?.closest("form");
    if (!form) return;
    const read = () => {
      const field = form.elements.namedItem("memberId");
      setPickedSubject(field instanceof HTMLSelectElement || field instanceof HTMLInputElement ? field.value || null : null);
    };
    read();
    const onChange = (event: Event) => {
      if ((event.target as HTMLElement | null)?.getAttribute("name") === "memberId") read();
    };
    form.addEventListener("change", onChange);
    return () => form.removeEventListener("change", onChange);
  }, [subjectMemberId]);

  const subject = subjectMemberId ?? pickedSubject;

  return (
    <div ref={ref} className="space-y-3">
      <Select label={labels.common.whoCanSee} name="privacyScope" value={scope} onChange={(event) => setScope(event.target.value as PrivacyScope)}>
        {SCOPES.map((value) => (
          <option key={value} value={value}>
            {labels.scopes[value]}
          </option>
        ))}
      </Select>
      {scope === "selected_family" && sharing && subject ? <SharingList key={subject} sharing={sharing} subject={subject} labels={labels} /> : null}
    </div>
  );
}

function SharingList({ sharing, subject, labels }: { sharing: HealthSharing; subject: string; labels: HealthFormLabels }) {
  const words = labels.sharing;
  const name = sharing.members.find((member) => member.id === subject)?.displayName ?? "";

  if (!sharing.shareableSubjectIds.includes(subject)) {
    return <p className="text-sm break-words text-[var(--wh-foreground-muted)]">{fill(words.notYours, name)}</p>;
  }

  const current = new Set(sharing.viewersBySubject[subject] ?? []);
  const candidates = sharing.members.filter((member) => member.id !== subject);

  return (
    <fieldset className="space-y-2 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] p-3">
      <input type="hidden" name="shareShown" value="1" />
      <input type="hidden" name="shareSubject" value={subject} />
      <legend className="px-1 text-sm font-medium">{words.legend}</legend>
      <p className="text-xs break-words text-[var(--wh-foreground-subtle)]">
        {subject === sharing.viewerMemberId ? words.explainerSelf : fill(words.explainerOther, name)}
      </p>
      {candidates.length === 0 ? (
        <p className="text-sm text-[var(--wh-foreground-muted)]">{words.noOne}</p>
      ) : (
        <ul className="space-y-1">
          {candidates.map((member) => (
            <li key={member.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--wh-radius-sm)] px-1">
                <input
                  type="checkbox"
                  name="shareWith"
                  value={member.id}
                  defaultChecked={current.has(member.id)}
                  className="size-5 shrink-0 accent-[var(--wh-primary)]"
                />
                <span className="min-w-0 text-sm break-words">{member.displayName}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
