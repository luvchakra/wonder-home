"use client";

import { Lightbulb, ShieldCheck, X } from "lucide-react";
import { useState, useTransition } from "react";

import type { GuardianTrivia } from "@wonderhome/core/school/trivia-repository";
import { CollapsibleSection } from "@wonderhome/core/ui/collapsible-section";
import { Switch } from "@wonderhome/core/ui/switch";

import { removeTriviaTopicAction, triviaEnabledAction } from "../(auth)/trivia-actions";

export type TriviaGuardianLabels = {
  title: string;
  on: string;
  off: string;
  turnOn: string;
  turnOff: string;
  topics: string;
  noTopics: string;
  /** "Remove {topic}" */
  remove: string;
  recent: string;
  noRecent: string;
  fact: string;
  quiz: string;
  right: string;
  notRight: string;
  /** "… : {reasons}" */
  turnedAway: string;
  privacy: string;
  reasons: Record<string, string>;
  categories: Record<string, string>;
  /** Each shown card's day, already in the household's format, by its timestamp. */
  shownAt: Record<string, string>;
};

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);

/**
 * A child's Trivia, for their guardian or an Admin (story 08-034; one editor,
 * rule 23: here, in the child's row in Family): on or off, the topics the child
 * picked (any can be removed), the last 20 cards they were shown, and how many
 * topics were turned away — by reason only, since the words are never kept.
 */
export function TriviaGuardian({ householdId, childId, trivia, labels }: { householdId: string; childId: string; trivia: GuardianTrivia; labels: TriviaGuardianLabels }) {
  const [enabled, setEnabled] = useState(trivia.enabled);
  const [topics, setTopics] = useState(trivia.topics);
  const [pending, startTransition] = useTransition();
  const turnedAway = Object.entries(trivia.turnedAway)
    .filter(([, count]) => (count ?? 0) > 0)
    .map(([reason, count]) => `${labels.reasons[reason] ?? reason} (${count})`);

  function toggle(next: boolean) {
    setEnabled(next);
    startTransition(async () => {
      const result = await triviaEnabledAction({ householdId, childId, enabled: next });
      if (!result.ok) setEnabled(!next);
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await removeTriviaTopicAction({ householdId, topicId: id });
      if (result.ok) setTopics((current) => current.filter((topic) => topic.id !== id));
    });
  }

  const topicName = (topic: string) => (topic.startsWith("cat:") ? (labels.categories[topic.slice(4)] ?? topic.slice(4)) : topic);

  return (
    <div className="space-y-3 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] p-3 text-sm">
      <div className="flex items-start gap-3">
        <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--wh-foreground-muted)]" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{labels.title}</p>
          <p className="text-xs text-[var(--wh-foreground-muted)]">{enabled ? labels.on : labels.off}</p>
        </div>
        <Switch checked={enabled} onCheckedChange={toggle} disabled={pending} label={enabled ? labels.turnOff : labels.turnOn} />
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-[var(--wh-foreground-muted)]">{labels.topics}</p>
        {topics.length === 0 ? (
          <p className="text-xs text-[var(--wh-foreground-muted)]">{labels.noTopics}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {topics.map((topic) => (
              <li key={topic.id} className="flex items-center gap-1 rounded-full bg-[var(--wh-surface)] py-0.5 pr-0.5 pl-3 text-xs font-medium">
                <span className="break-words">{topic.label}</span>
                <button
                  type="button"
                  onClick={() => remove(topic.id)}
                  disabled={pending}
                  aria-label={fill(labels.remove, { topic: topic.label })}
                  className="inline-flex size-9 items-center justify-center rounded-full hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]"
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {turnedAway.length > 0 ? <p className="text-xs text-[var(--wh-foreground-muted)]">{fill(labels.turnedAway, { reasons: turnedAway.join(", ") })}</p> : null}

      <CollapsibleSection icon={Lightbulb} tone="school" as="h4" title={labels.recent} count={trivia.recent.length || undefined}>
        {trivia.recent.length === 0 ? (
          <p className="text-xs text-[var(--wh-foreground-muted)]">{labels.noRecent}</p>
        ) : (
          <ul className="space-y-2">
            {trivia.recent.map((shown) => (
              <li key={shown.shownAt} className="space-y-0.5 border-b border-[var(--wh-border)] pb-2 last:border-0">
                <p className="text-xs text-[var(--wh-foreground-subtle)]">
                  {[labels.shownAt[shown.shownAt], shown.kind === "fact" ? labels.fact : labels.quiz, topicName(shown.topic), shown.answeredCorrect === null ? null : shown.answeredCorrect ? labels.right : labels.notRight]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="text-sm break-words">
                  {shown.text}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>

      <p className="flex items-start gap-1.5 text-xs text-[var(--wh-foreground-muted)]">
        <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        {labels.privacy}
      </p>
    </div>
  );
}
