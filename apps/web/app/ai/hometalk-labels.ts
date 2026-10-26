import type { Translate, TranslationKey } from "@wonderhome/core/i18n/translate";
import type { MessageTimeStyle } from "@wonderhome/core/conversation/message-time";
import type { ActionPreviewLabels } from "@wonderhome/core/ui/action-preview";
import type { TalkComposerLabels } from "@wonderhome/core/ui/talk-composer";

import type { ConversationSearchLabels } from "./conversation-search";
import type { PlaceCardLabels } from "./place-cards";

/**
 * The HomeTalk screen's own words in the viewer's language (story 22-004).
 * Read on the server, where the catalog is, and handed to the client
 * assistant. What a person says and what WonderHome replies are not here:
 * replies are translated through `reply-language.ts`, and a person's own
 * words are never changed.
 */
export type AssistantLabels = {
  greeting: string;
  helpQuestion: string;
  intro: string;
  suggestionsHeading: string;
  /** Shown in the viewer's language; each sends its English sentence, which the rules read on every path. */
  suggestions: Record<SuggestionKey, string>;
  confirm: string;
  /** A child's or helper's Confirm: the request goes to a grown-up. */
  askAdult: string;
  /** `{name}` is the adult it waits on. */
  waitingFor: string;
  change: string;
  cancel: string;
  alreadyOnRecord: string;
  /** The answers to pick under a question (rule 20): the group's name for a screen reader, and the multi set's Send. */
  choices: { legend: string; send: string };
  /** The "i" beside a finished reply's time that opens its action preview. */
  previewDetails: string;
  stop: string;
  restOnScreen: string;
  /** "{count} more", the browser fills the count. */
  andMore: string;
  stopLabel: string;
  stopped: string;
  tooLong: string;
  editAria: string;
  edit: string;
  tryAgain: string;
  jumpLatest: string;
  editing: string;
  cancelEditing: string;
  footer: string;
  error: { answer: string; document: string; summary: string; decision: string };
  time: MessageTimeStyle;
  composer: TalkComposerLabels;
  preview: ActionPreviewLabels;
  /** HomePlaces cards; `{name}` is filled per place on the client. */
  places: PlaceCardLabels;
  /** Ask me about family: the quiet way in and the line under a waiting question. `left` keeps `{count}`. */
  amaf: { start: string; mode: string; leftOne: string; left: string; skip: string; stop: string };
};

/** The most results one search returns (`searchMessages` caps its limit at 50). */
const SEARCH_MAX = 50;

export function conversationSearchLabels(t: Translate, time: Pick<MessageTimeStyle, "locale" | "hour12"> = {}): ConversationSearchLabels {
  return {
    label: t("hometalk.search.label"),
    placeholder: t("hometalk.search.placeholder"),
    clear: t("hometalk.search.clear"),
    searching: t("hometalk.search.searching"),
    failed: t("hometalk.search.failed"),
    none: t("hometalk.search.none", { query: "{query}" }),
    // Rendered per count here, so each language picks its own plural form.
    counts: Array.from({ length: SEARCH_MAX + 1 }, (_, count) => t("hometalk.search.count", { count })),
    you: t("hometalk.search.you"),
    time: { ...time, today: t("hometalk.ui.today"), yesterday: t("hometalk.ui.yesterday") },
  };
}

export const SUGGESTION_KEYS = ["outing", "coriander", "project", "schedule", "bill", "schoolRun"] as const;
export type SuggestionKey = (typeof SUGGESTION_KEYS)[number];

const COMPOSER_KEYS: (keyof TalkComposerLabels)[] = [
  "messageLabel", "placeholder", "placeholderShort", "attach", "stopTranscribing", "stopListening", "endLive", "speak", "send", "startLive",
  "engineTrigger", "enginePicker", "transcribing", "listening", "paused", "thinking", "speaking", "whoListening",
  "resumeConversation", "pauseConversation", "resume", "pause", "tapToResume", "tapToPause", "stepListening", "stepTranscribing", "stepReady", "openHomeTalk",
  "floatLive", "unfloat", "floatFailed", "you", "getReady", "getReadyHint", "speakNow",
];

const PREVIEW_STATES = ["prepared", "needs_approval", "approved", "rejected", "executed", "unchanged", "refused"] as const;

/** `{name}` is left in the greeting for the client to fill with the viewer's first name. */
export function assistantLabels(t: Translate, time: Pick<MessageTimeStyle, "locale" | "hour12"> = {}): AssistantLabels {
  const key = (name: string) => name as TranslationKey;
  return {
    amaf: {
      start: t(key("amaf.ui.start")),
      mode: t(key("amaf.ui.mode")),
      leftOne: t(key("amaf.ui.left"), { count: 1 }),
      left: t(key("amaf.ui.left"), { count: 7 }).replace("7", "{count}"),
      skip: t(key("amaf.ui.skip")),
      stop: t(key("amaf.ui.stop")),
    },
    greeting: t("hometalk.ui.greeting", { name: "{name}" }),
    helpQuestion: t("hometalk.ui.helpQuestion"),
    intro: t("hometalk.ui.intro"),
    suggestionsHeading: t("hometalk.ui.suggestionsHeading"),
    suggestions: Object.fromEntries(SUGGESTION_KEYS.map((name) => [name, t(key(`hometalk.ui.suggestion.${name}`))])) as Record<SuggestionKey, string>,
    confirm: t("hometalk.ui.confirm"),
    askAdult: t("hometalk.ui.askAdult"),
    waitingFor: t("hometalk.ui.waitingFor", { name: "{name}" }),
    change: t("hometalk.ui.change"),
    cancel: t("hometalk.ui.cancel"),
    alreadyOnRecord: t("hometalk.ui.alreadyOnRecord"),
    choices: { legend: t("hometalk.choice.groupLabel"), send: t("hometalk.choice.send") },
    previewDetails: t("hometalk.preview.details"),
    stop: t("hometalk.ui.stop"),
    restOnScreen: t("hometalk.ui.restOnScreen"),
    andMore: t("hometalk.ui.andMore", { count: "{count}" }),
    stopLabel: t("hometalk.ui.stopLabel"),
    stopped: t("hometalk.ui.stopped"),
    tooLong: t("hometalk.ui.tooLong"),
    editAria: t("hometalk.ui.editAria"),
    edit: t("hometalk.ui.edit"),
    tryAgain: t("hometalk.ui.tryAgain"),
    jumpLatest: t("hometalk.ui.jumpLatest"),
    editing: t("hometalk.ui.editing"),
    cancelEditing: t("hometalk.ui.cancelEditing"),
    footer: t("hometalk.ui.footer"),
    error: {
      answer: t("hometalk.ui.error.answer"),
      document: t("hometalk.ui.error.document"),
      summary: t("hometalk.ui.error.summary"),
      decision: t("hometalk.ui.error.decision"),
    },
    time: { ...time, today: t("hometalk.ui.today"), yesterday: t("hometalk.ui.yesterday") },
    // `{engine}`/`{who}` stay placeholders for the composer to fill.
    composer: Object.fromEntries(COMPOSER_KEYS.map((name) => [name, t(key(`hometalk.composer.${name}`), { engine: "{engine}", who: "{who}" })])) as TalkComposerLabels,
    places: {
      heading: t("hometalk.places.heading"),
      open: t("hometalk.places.open", { name: "{name}" }),
      save: t("hometalk.places.save", { name: "{name}" }),
      saved: t("hometalk.places.saved"),
      unsave: t("hometalk.places.unsave", { name: "{name}" }),
      notForUs: t("hometalk.places.notForUs", { name: "{name}" }),
      hidden: t("hometalk.places.hidden", { name: "{name}" }),
      undo: t("hometalk.places.undo"),
      failed: t("hometalk.places.failed"),
    },
    preview: {
      title: t("hometalk.preview.title"),
      state: Object.fromEntries(PREVIEW_STATES.map((state) => [state, t(key(`hometalk.preview.state.${state}`))])) as ActionPreviewLabels["state"],
      understood: t("hometalk.preview.understood"),
      plan: t("hometalk.preview.plan"),
      did: t("hometalk.preview.did"),
      found: t("hometalk.preview.found"),
      willDo: t("hometalk.preview.willDo"),
      impact: t("hometalk.preview.impact"),
      reversible: t("hometalk.preview.reversible"),
      irreversible: t("hometalk.preview.irreversible"),
    },
  };
}
