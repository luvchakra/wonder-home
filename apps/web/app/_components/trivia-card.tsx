"use client";

import { Check, Lightbulb, Plus, Puzzle, Square, Volume2, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@wonderhome/core/ui/button";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { pickVoice } from "@wonderhome/core/ui/use-live-voice";

import { addTriviaTopicAction, removeTriviaTopicAction, triviaAnswerAction, triviaLevelAction, triviaNextAction, triviaShownAction } from "../(auth)/trivia-actions";
import type { TriviaView } from "../_lib/trivia-view";

export type TriviaLabels = {
  didYouKnow: string;
  quizTime: string;
  /** "About {topic}" with the placeholder kept. */
  about: string;
  /** "No {topic} trivia yet, so here's one about {category}." with both placeholders kept. */
  uncovered: string;
  another: string;
  nextTopic: string;
  readAloud: string;
  stopReading: string;
  tooHard: string;
  tooEasy: string;
  easier: string;
  harder: string;
  right: string;
  /** "Nice try! It's {answer}." */
  wrong: string;
  /** "{count} right in a row 🔥" */
  streak: string;
  inEnglish: string;
  choices: string;
  categories: Record<string, string>;
};

const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));

/**
 * The child's trivia card on Home (story 08-034): one card each time they open
 * WonderHome, "Did you know?" and "Quiz time!" in turn, from the topics they
 * picked. Tapping an answer says right or "nice try" at once, with the reason;
 * the server records it and counts the streak from answers on record. "Tell me
 * another" stays on the topic, "Next topic" moves on, "Too hard / too easy"
 * moves the next cards' difficulty. "Read it to me" uses the device's own
 * voice, so nothing leaves the device to read it.
 */
export function TriviaCard({ householdId, initial, language, labels }: { householdId: string; initial: TriviaView; language: string; labels: TriviaLabels }) {
  const [view, setView] = useState(initial);
  const [shownId, setShownId] = useState<string | null>(initial.shownId);
  const [chosen, setChosen] = useState<number | null>(null);
  const [streak, setStreak] = useState(initial.streak);
  const [note, setNote] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const [pending, startTransition] = useTransition();
  const recorded = useRef(false);

  useEffect(() => {
    setCanSpeak(typeof window !== "undefined" && "speechSynthesis" in window);
    // The card the page opened with is on record once it is seen, so the next opening brings another.
    if (recorded.current || initial.shownId) return;
    recorded.current = true;
    void triviaShownAction({ householdId, cardKey: initial.cardKey, topic: initial.topic ?? `cat:${initial.category}` }).then((result) => setShownId(result.shownId));
  }, [householdId, initial]);

  useEffect(() => () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const category = labels.categories[view.category] ?? view.category;
  const subtitle = view.topic ? fill(labels.about, { topic: view.topic }) : view.uncovered[0] ? fill(labels.uncovered, { topic: view.uncovered[0], category }) : fill(labels.about, { topic: category });
  const answered = chosen !== null && view.answer !== null;

  function next(mode: "another" | "next_topic") {
    stopReading();
    startTransition(async () => {
      const result = await triviaNextAction({ householdId, mode });
      if (!result.ok) return;
      setView(result.view);
      setShownId(result.view.shownId);
      setChosen(null);
      setNote(null);
    });
  }

  function answer(choice: number) {
    if (chosen !== null) return;
    setChosen(choice);
    if (!shownId) return;
    void triviaAnswerAction({ householdId, shownId, choice }).then((result) => {
      if (result.ok) setStreak(result.streak);
    });
  }

  function level(feedback: "too_hard" | "too_easy") {
    startTransition(async () => {
      const result = await triviaLevelAction({ householdId, feedback });
      if (result.ok) setNote(feedback === "too_hard" ? labels.easier : labels.harder);
    });
  }

  function stopReading() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  function read() {
    if (speaking) return stopReading();
    const words = [view.text, ...(view.kind === "quiz" ? view.options : [])].join(". ");
    const utterance = new SpeechSynthesisUtterance(words);
    const voice = pickVoice(window.speechSynthesis.getVoices(), view.language);
    if (voice) utterance.voice = voice;
    utterance.lang = view.language;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }

  return (
    <Card className="wh-kid-card space-y-4 p-4 [--wh-kid-accent:var(--wh-tone-school)]" aria-busy={pending}>
      <div className="flex items-start gap-3">
        <IconTile icon={view.kind === "fact" ? Lightbulb : Puzzle} tone="school" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold tracking-tight">{view.kind === "fact" ? labels.didYouKnow : labels.quizTime}</h2>
          <p className="text-sm text-[var(--wh-foreground-muted)]">{subtitle}</p>
        </div>
        {streak >= 2 ? <span className="shrink-0 rounded-full bg-[var(--wh-surface-muted)] px-2.5 py-1 text-xs font-semibold">{fill(labels.streak, { count: streak })}</span> : null}
      </div>

      <div className="space-y-2">
        <p lang={view.language} className="text-base leading-relaxed font-medium">
          {view.text}
        </p>
        {view.language !== language.split("-")[0] ? <p className="text-xs text-[var(--wh-foreground-subtle)]">{labels.inEnglish}</p> : null}
      </div>

      {view.kind === "quiz" ? (
        <div role="group" aria-label={labels.choices} className="grid gap-2 sm:grid-cols-2">
          {view.options.map((option, index) => {
            const isRight = answered && index === view.answer;
            const isWrongPick = answered && index === chosen && index !== view.answer;
            return (
              <button
                key={option}
                type="button"
                lang={view.language}
                onClick={() => answer(index)}
                disabled={answered}
                aria-pressed={chosen === index}
                className={`flex min-h-11 items-center gap-2 rounded-[var(--wh-radius-sm)] border px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)] ${
                  isRight
                    ? "border-[var(--wh-handled)] bg-[var(--wh-handled-soft)]"
                    : isWrongPick
                      ? "border-[var(--wh-attention)] bg-[var(--wh-attention-soft)]"
                      : "border-[var(--wh-border)] bg-[var(--wh-surface)] hover:bg-[var(--wh-surface-muted)]"
                } disabled:cursor-default`}
              >
                {isRight ? <Check aria-hidden className="size-4 shrink-0" /> : isWrongPick ? <X aria-hidden className="size-4 shrink-0" /> : null}
                <span className="min-w-0 break-words">{option}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {answered ? (
        <div role="status" className="space-y-1 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] p-3 text-sm">
          <p className="font-semibold">{chosen === view.answer ? labels.right : fill(labels.wrong, { answer: view.options[view.answer!] ?? "" })}</p>
          {view.explain ? (
            <p lang={view.language} className="text-[var(--wh-foreground-muted)]">
              {view.explain}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => next("another")} disabled={pending}>
          {labels.another}
        </Button>
        <Button type="button" variant="quiet" onClick={() => next("next_topic")} disabled={pending}>
          {labels.nextTopic}
        </Button>
        {canSpeak ? (
          <Button type="button" variant="quiet" onClick={read}>
            {speaking ? <Square aria-hidden className="size-4" /> : <Volume2 aria-hidden className="size-4" />}
            {speaking ? labels.stopReading : labels.readAloud}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--wh-border)] pt-3">
        <Button type="button" variant="quiet" className="min-h-11 text-xs" onClick={() => level("too_hard")} disabled={pending || view.level <= 1}>
          {labels.tooHard}
        </Button>
        <Button type="button" variant="quiet" className="min-h-11 text-xs" onClick={() => level("too_easy")} disabled={pending || view.level >= 3}>
          {labels.tooEasy}
        </Button>
        {note ? (
          <p role="status" className="text-xs text-[var(--wh-foreground-muted)]">
            {note}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

export type TriviaTopicsLabels = {
  field: string;
  placeholder: string;
  add: string;
  adding: string;
  suggested: string;
  /** "Remove {topic}" */
  remove: string;
  none: string;
  suggestions: string[];
  errors: Record<"pick_another" | "too_long" | "too_many" | "slow_down" | "off" | "failed", string>;
};

/**
 * The child's own topics: type anything they love, or tap a suggestion (rule
 * 20). Every topic is checked on the server before it is kept; one that isn't
 * suitable gets only "Let's pick another topic", never why.
 */
export function TriviaTopics({ householdId, topics, labels }: { householdId: string; topics: { id: string; label: string }[]; labels: TriviaTopicsLabels }) {
  const [list, setList] = useState(topics);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const taken = new Set(list.map((topic) => topic.label.toLowerCase()));

  function add(topic: string) {
    setError(null);
    startTransition(async () => {
      const result = await addTriviaTopicAction({ householdId, topic });
      if (!result.ok) {
        setError(labels.errors[result.error]);
        return;
      }
      setList((current) => (current.some((own) => own.id === result.topic.id) ? current : [...current, result.topic]));
      setText("");
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await removeTriviaTopicAction({ householdId, topicId: id });
      if (result.ok) setList((current) => current.filter((topic) => topic.id !== id));
    });
  }

  return (
    <div className="space-y-4">
      {list.length === 0 ? (
        <p className="text-sm text-[var(--wh-foreground-muted)]">{labels.none}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {list.map((topic) => (
            <li key={topic.id} className="flex items-center gap-1 rounded-full bg-[var(--wh-tone-school-soft)] py-1 pr-1 pl-3 text-sm font-medium">
              <span className="break-words">{topic.label}</span>
              <button
                type="button"
                onClick={() => remove(topic.id)}
                disabled={pending}
                aria-label={fill(labels.remove, { topic: topic.label })}
                className="inline-flex size-9 items-center justify-center rounded-full hover:bg-[var(--wh-surface)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]"
              >
                <X aria-hidden className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim()) add(text);
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">{labels.field}</span>
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={40}
            placeholder={labels.placeholder}
            className="min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-sm focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]"
          />
        </label>
        <Button type="submit" disabled={pending || !text.trim()}>
          <Plus aria-hidden className="size-4" />
          {pending ? labels.adding : labels.add}
        </Button>
      </form>
      {error ? (
        <p role="alert" className="text-sm font-medium">
          {error}
        </p>
      ) : null}

      <div className="space-y-2">
        <p className="text-xs font-semibold text-[var(--wh-foreground-muted)]">{labels.suggested}</p>
        <div className="flex flex-wrap gap-2">
          {labels.suggestions
            .filter((suggestion) => !taken.has(suggestion.toLowerCase()))
            .map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => add(suggestion)}
                disabled={pending}
                className="min-h-11 rounded-full border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-sm hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]"
              >
                {suggestion}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
