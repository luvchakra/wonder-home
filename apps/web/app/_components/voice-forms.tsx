"use client";

import { ChevronDown, Play, Volume2, X } from "lucide-react";
import {
  useActionState,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Card } from "@wonderhome/core/ui/card";
import { PasswordField } from "@wonderhome/core/ui/password-field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Switch } from "@wonderhome/core/ui/switch";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { Select } from "@wonderhome/core/ui/select";
import { Slider } from "@wonderhome/core/ui/slider";
import {
  LISTENING_DEVICES,
  RECOGNITION_MODELS,
  VOICE_GENDERS,
  VOICE_TIERS,
  type ListeningDevice,
  type LiveEngine,
  type RecognitionModel,
  type VoiceGender,
  type VoiceSettings,
  type VoiceTier,
} from "@wonderhome/core/voice/settings";

import type { ActionState } from "../(auth)/actions";
import { SavedKeyRow } from "./ai-key-form";

type VoiceOption = {
  name: string;
  language: string;
  gender: string;
  tier: string;
};

/** The voice screen's words in the viewer's language, built on the server (story 22-004). */
export type VoiceFormLabels = {
  saving: string;
  previewError: string;
  who: string;
  /** "Set on {date}." — `{date}` is filled in here. */
  setOn: string;
  service: string;
  serviceHint: string;
  serviceHintNone: string;
  optionBrowser: string;
  optionGoogle: string;
  live: string;
  liveEngine: string;
  engines: Record<LiveEngine, { name: string; detail: string }>;
  geminiHears: string;
  /** "Gemini Live is not available: {reason}" — `{reason}` is the server's own. */
  geminiUnavailable: string;
  notAvailable: string;
  sounds: string;
  soundsGoogle: string;
  soundsBrowser: string;
  language: string;
  /** The languages offered, each named in the viewer's language. */
  languages: { code: string; label: string }[];
  tier: string;
  tierHint: string;
  tiers: Record<VoiceTier, { name: string; detail: string }>;
  gender: string;
  genderHint: string;
  genders: Record<VoiceGender, string>;
  specific: string;
  specificHintGoogle: string;
  specificHintBrowser: string;
  chooseForMe: string;
  rate: string;
  slower: string;
  faster: string;
  pitch: string;
  /** "{value} semitones" — `{value}` is filled in here. */
  semitones: string;
  deeper: string;
  higher: string;
  pitchHint: string;
  volume: string;
  quieter: string;
  louder: string;
  volumeHint: string;
  device: string;
  deviceHint: string;
  devices: Record<ListeningDevice, string>;
  speakReplies: string;
  speakRepliesHint: string;
  playing: string;
  hear: string;
  listens: string;
  listensBody: string;
  spokenLanguage: string;
  spokenLanguageHint: string;
  sameAsAbove: string;
  alternatives: string;
  alternativesHint: string;
  models: Record<RecognitionModel, { name: string; detail: string }>;
  phrases: string;
  phrasesHint: string;
  punctuation: string;
  profanity: string;
  profanityHint: string;
  enhanced: string;
  enhancedHint: string;
  applyNext: string;
  /** The page's three plain sections and its Advanced fold (2026-10-21). */
  simple: {
    talking: string;
    talkingLede: string;
    hearing: string;
    hearingLede: string;
    understanding: string;
    understandingLede: string;
    understandingBrowser: string;
    advanced: string;
    advancedLede: string;
    upToThree: string;
    addLanguage: string;
    /** "Remove {language}" — `{language}` is filled in here. */
    removeLanguage: string;
  };
  save: string;
  ownKey: {
    title: string;
    bring: string;
    bringBody: string;
    switch: string;
    apiKey: string;
    hint: string;
    replace: string;
    use: string;
    remove: string;
    saved: string;
    newKey: string;
    newKeyPlaceholder: string;
  };
};

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

/**
 * Everything about how WonderHome sounds and listens, on one screen.
 *
 * The voice list is fetched for whichever language is selected, so the
 * names offered are the ones Google will actually accept rather than a
 * hard-coded list that drifts as voices are added and retired. "Hear it"
 * plays what the form currently says — not what was last saved — so a
 * household can audition a change before committing to it.
 */
export function VoiceSettingsForm({
  householdId,
  settings,
  save,
  saveKey,
  removeKey,
  speechAvailable,
  ownKey,
  ownKeySetOn,
  sourceTitle,
  sourceDetail,
  geminiLive,
  labels,
}: {
  householdId: string;
  settings: VoiceSettings;
  save: (state: ActionState, formData: FormData) => Promise<ActionState>;
  saveKey: (state: ActionState, formData: FormData) => Promise<ActionState>;
  removeKey: (state: ActionState, formData: FormData) => Promise<ActionState>;
  /** A key exists somewhere — the household's own, or the deployment's. */
  speechAvailable: boolean;
  /** This household has set a key of its own, which takes precedence. */
  ownKey: boolean;
  ownKeySetOn: string | null;
  sourceTitle: string;
  sourceDetail: string;
  /** Whether Gemini Live may run for this household, and why not when it may not — the server's own check. */
  geminiLive: { available: boolean; reason: string | null; fix?: { href: string; label: string } | null };
  labels: VoiceFormLabels;
}) {
  const [state, action, saving] = useActionState(save, {});
  const formId = useId();
  const [provider, setProvider] = useState(settings.provider);
  const [language, setLanguage] = useState(settings.language);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const usingGoogle = speechAvailable && provider === "google";

  useEffect(() => {
    if (!usingGoogle) return;
    let cancelled = false;

    fetch(
      `/api/v1/households/${householdId}/voice?language=${encodeURIComponent(language)}`,
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!cancelled && payload?.voices)
          setVoices(payload.voices as VoiceOption[]);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [householdId, language, usingGoogle]);

  const preview = useCallback(async () => {
    const form = formRef.current;
    if (!form || previewing) return;

    setPreviewing(true);
    setPreviewError(null);
    const data = new FormData(form);
    const number = (name: string) => Number(data.get(name));

    try {
      const response = await fetch(`/api/v1/households/${householdId}/voice`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          speak: "Dinner is at seven, and Anaya's project is due on Friday.",
          preview: {
            language: String(data.get("language") ?? settings.language),
            voiceName: String(data.get("voiceName") ?? "") || null,
            gender: String(data.get("gender") ?? settings.gender),
            tier: String(data.get("tier") ?? settings.tier),
            speakingRate: number("speakingRate"),
            pitch: number("pitch"),
            volumeGainDb: number("volumeGainDb"),
            listeningDevice: String(
              data.get("listeningDevice") ?? settings.listeningDevice,
            ),
          },
        }),
      });

      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          payload?.error?.message ?? labels.previewError,
        );

      audioRef.current?.pause();
      const audio = new Audio(
        `data:${payload.mimeType};base64,${payload.audio}`,
      );
      audioRef.current = audio;
      await audio.play();
    } catch (caught) {
      setPreviewError(
        caught instanceof Error
          ? caught.message
          : labels.previewError,
      );
    } finally {
      setPreviewing(false);
    }
  }, [householdId, previewing, settings, labels.previewError]);

  return (
    <div className="space-y-6">
      {/* Three plain questions in the order people ask them — who talks, how
          replies are heard, how it understands you — and the technical knobs
          folded under Advanced (the owner, 2026-10-21: "made simple to
          understand by end user"). Every field and the one save are as before
          (rule 23); the Advanced fields belong to the same form by its id. */}
      <form id={formId} ref={formRef} action={action} className="space-y-6">
        <input type="hidden" name="householdId" value={householdId} />

        {state.error ? <Alert>{state.error}</Alert> : null}
        {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
        {previewError ? <Alert>{previewError}</Alert> : null}

        <section className="space-y-3">
          <SectionHeader title={labels.simple.talking} />
          <p className="-mt-2 text-sm text-[var(--wh-foreground-muted)]">{labels.simple.talkingLede}</p>
          <Select
            label={labels.liveEngine}
            name="liveEngine"
            defaultValue={settings.liveEngine}
            hint={
              geminiLive.available
                ? `${labels.engines.gemini_live.detail} ${labels.geminiHears}`
                : `${labels.engines.wonderhome.detail}${geminiLive.reason ? ` ${labels.geminiUnavailable.replace("{reason}", geminiLive.reason)}` : ""}`
            }
          >
            <option value="wonderhome">{labels.engines.wonderhome.name}</option>
            <option value="gemini_live" disabled={!geminiLive.available}>
              {labels.engines.gemini_live.name}
              {geminiLive.available ? "" : ` ${labels.notAvailable}`}
            </option>
          </Select>
          {!geminiLive.available && geminiLive.fix ? (
            <a href={geminiLive.fix.href} className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--wh-primary)] underline-offset-2 hover:underline">
              {geminiLive.fix.label}
            </a>
          ) : null}
        </section>

        <section className="space-y-3">
          <SectionHeader title={labels.simple.hearing} />
          <p className="-mt-2 text-sm text-[var(--wh-foreground-muted)]">{labels.simple.hearingLede}</p>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              name="speakReplies"
              defaultChecked={settings.speakReplies}
              className="size-5 rounded border-[var(--wh-border-strong)] accent-[var(--wh-primary)]"
            />
            <span>
              {labels.speakReplies}
              <span className="block text-xs text-[var(--wh-foreground-subtle)]">
                {labels.speakRepliesHint}
              </span>
            </span>
          </label>
          <Select
            label={labels.service}
            name="provider"
            defaultValue={settings.provider}
            disabled={!speechAvailable}
            onChange={(event) =>
              setProvider(event.target.value as VoiceSettings["provider"])
            }
            hint={
              speechAvailable ? labels.serviceHint : labels.serviceHintNone
            }
          >
            <option value="browser">{labels.optionBrowser}</option>
            {speechAvailable ? (
              <option value="google">{labels.optionGoogle}</option>
            ) : null}
          </Select>
          {/* Google's own voice controls only show when Google is the one
              speaking (rule 10). Hidden rather than removed, so saving the
              form never resets what was chosen for later. */}
          <div className={usingGoogle ? "space-y-4" : "hidden"}>

          <Select
            label={labels.language}
            name="language"
            defaultValue={settings.language}
            onChange={(event) => setLanguage(event.target.value)}
          >
            {labels.languages.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </Select>

          <Select
            label={labels.tier}
            name="tier"
            defaultValue={settings.tier}
            hint={labels.tierHint}
          >
            {VOICE_TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {labels.tiers[tier].name} — {labels.tiers[tier].detail}
              </option>
            ))}
          </Select>

          <Select
            label={labels.gender}
            name="gender"
            defaultValue={settings.gender}
            hint={labels.genderHint}
          >
            {VOICE_GENDERS.map((gender) => (
              <option key={gender} value={gender}>
                {labels.genders[gender]}
              </option>
            ))}
          </Select>

          <Select
            label={labels.specific}
            name="voiceName"
            defaultValue={settings.voiceName ?? ""}
            hint={
              usingGoogle ? labels.specificHintGoogle : labels.specificHintBrowser
            }
          >
            <option value="">{labels.chooseForMe}</option>
            {voices.map((voice) => (
              <option key={voice.name} value={voice.name}>
                {voice.name} ({voice.gender})
              </option>
            ))}
          </Select>

          <Slider
            label={labels.rate}
            name="speakingRate"
            value={settings.speakingRate}
            min={0.25}
            max={4}
            step={0.05}
            format={(value) => `${value.toFixed(2)}×`}
            lowLabel={labels.slower}
            highLabel={labels.faster}
          />

          <Slider
            label={labels.pitch}
            name="pitch"
            value={settings.pitch}
            min={-20}
            max={20}
            step={0.5}
            format={(value) => labels.semitones.replace("{value}", `${value > 0 ? "+" : ""}${value}`)}
            lowLabel={labels.deeper}
            highLabel={labels.higher}
            hint={labels.pitchHint}
          />

          <Slider
            label={labels.volume}
            name="volumeGainDb"
            value={settings.volumeGainDb}
            min={-16}
            max={16}
            step={1}
            format={(value) => `${value > 0 ? "+" : ""}${value} dB`}
            lowLabel={labels.quieter}
            highLabel={labels.louder}
            hint={labels.volumeHint}
          />

          <Select
            label={labels.device}
            name="listeningDevice"
            defaultValue={settings.listeningDevice}
            hint={labels.deviceHint}
          >
            {LISTENING_DEVICES.map((device) => (
              <option key={device} value={device}>
                {labels.devices[device]}
              </option>
            ))}
          </Select>

          </div>
          {usingGoogle ? (
            <Pill
              type="button"
              tone="quiet"
              onClick={() => void preview()}
              disabled={previewing}
            >
              {previewing ? (
                <Volume2 aria-hidden className="size-4" />
              ) : (
                <Play aria-hidden className="size-4" />
              )}
              {previewing ? labels.playing : labels.hear}
            </Pill>
          ) : null}
        </section>

        <section className="space-y-3">
          <SectionHeader title={labels.simple.understanding} />
          <p className="-mt-2 text-sm text-[var(--wh-foreground-muted)]">{usingGoogle ? labels.simple.understandingLede : labels.simple.understandingBrowser}</p>
          <Select
            label={labels.spokenLanguage}
            name="recognitionLanguage"
            defaultValue={settings.recognitionLanguage ?? ""}
            hint={labels.spokenLanguageHint}
          >
            <option value="">{labels.sameAsAbove}</option>
            {labels.languages.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </Select>
          <LanguageChips
            label={labels.alternatives}
            hint={labels.simple.upToThree}
            addLabel={labels.simple.addLanguage}
            removeLabel={labels.simple.removeLanguage}
            languages={labels.languages}
            initial={settings.alternativeLanguages}
          />
          <div className="space-y-1.5">
            <label htmlFor="phraseHints" className="block text-sm font-medium">
              {labels.phrases}
            </label>
            <textarea
              id="phraseHints"
              name="phraseHints"
              rows={3}
              defaultValue={settings.phraseHints.join("\n")}
              placeholder={"Bhindi masala\nDr Menon\nKumon"}
              className="block w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--wh-primary)]"
            />
            <p className="text-xs text-[var(--wh-foreground-subtle)]">
              {labels.phrasesHint}
            </p>
          </div>
        </section>
      </form>

      <details className="group rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] shadow-[var(--wh-shadow-card)]">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{labels.simple.advanced}</span>
            <span className="block text-xs text-[var(--wh-foreground-muted)]">{labels.simple.advancedLede}</span>
          </span>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-[var(--wh-foreground-subtle)] transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-4 border-t border-[var(--wh-border)] px-4 py-4">
          <Select
            label={labels.listens}
            name="recognitionModel"
            form={formId}
            defaultValue={settings.recognitionModel}
          >
            {RECOGNITION_MODELS.map((model) => (
              <option key={model} value={model}>
                {labels.models[model].name} — {labels.models[model].detail}
              </option>
            ))}
          </Select>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              name="automaticPunctuation"
              form={formId}
              defaultChecked={settings.automaticPunctuation}
              className="size-5 rounded border-[var(--wh-border-strong)] accent-[var(--wh-primary)]"
            />
            <span>{labels.punctuation}</span>
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              name="profanityFilter"
              form={formId}
              defaultChecked={settings.profanityFilter}
              className="size-5 rounded border-[var(--wh-border-strong)] accent-[var(--wh-primary)]"
            />
            <span>
              {labels.profanity}
              <span className="block text-xs text-[var(--wh-foreground-subtle)]">
                {labels.profanityHint}
              </span>
            </span>
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              name="enhancedRecognition"
              form={formId}
              defaultChecked={settings.enhancedRecognition}
              className="size-5 rounded border-[var(--wh-border-strong)] accent-[var(--wh-primary)]"
            />
            <span>
              {labels.enhanced}
              <span className="block text-xs text-[var(--wh-foreground-subtle)]">
                {labels.enhancedHint}
              </span>
            </span>
          </label>
          <Card className="space-y-1 bg-[var(--wh-surface-muted)]/60 p-3">
            <p className="text-sm font-semibold">{sourceTitle}</p>
            <p className="text-xs text-[var(--wh-foreground-muted)]">
              {sourceDetail}
            </p>
            {ownKey && ownKeySetOn ? (
              <p className="text-xs text-[var(--wh-foreground-subtle)]">
                {labels.setOn.replace("{date}", ownKeySetOn)}
              </p>
            ) : null}
          </Card>
          <OwnKeyForm
            householdId={householdId}
            save={saveKey}
            remove={removeKey}
            configured={ownKey}
            labels={labels}
          />
        </div>
      </details>

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 text-sm text-[var(--wh-foreground-muted)]">
          {labels.applyNext}
        </p>
        <Button type="submit" form={formId} disabled={saving}>
          {saving ? labels.saving : labels.save}
        </Button>
      </Card>
    </div>
  );
}

/**
 * Other languages a person may switch to mid-sentence, picked as up to three
 * chips rather than ticked from a wall of checkboxes. Each chip is a hidden
 * `alternativeLanguages` field, so the form and the save are unchanged.
 */
function LanguageChips({
  label,
  hint,
  addLabel,
  removeLabel,
  languages,
  initial,
}: {
  label: string;
  hint: string;
  addLabel: string;
  /** "Remove {language}" — `{language}` is filled in here. */
  removeLabel: string;
  languages: readonly { code: string; label: string }[];
  initial: readonly string[];
}) {
  const [picked, setPicked] = useState<string[]>(() => initial.slice(0, 3));
  const nameOf = (code: string) => languages.find((option) => option.code === code)?.label ?? code;
  const left = languages.filter((option) => !picked.includes(option.code));
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <p className="text-xs text-[var(--wh-foreground-subtle)]">{hint}</p>
      {picked.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {picked.map((code) => (
            <li key={code}>
              <input type="hidden" name="alternativeLanguages" value={code} />
              <span className="inline-flex min-h-9 items-center gap-1 rounded-[var(--wh-radius-pill)] bg-[var(--wh-primary-soft)] py-1 ps-3 pe-1 text-sm font-medium text-[var(--wh-primary)]">
                {nameOf(code)}
                <button
                  type="button"
                  aria-label={removeLabel.replace("{language}", nameOf(code))}
                  onClick={() => setPicked((current) => current.filter((entry) => entry !== code))}
                  className="grid size-7 place-items-center rounded-full hover:bg-[var(--wh-surface)]"
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {picked.length < 3 ? (
        <select
          aria-label={addLabel}
          value=""
          onChange={(event) => {
            const code = event.target.value;
            if (code) setPicked((current) => (current.includes(code) || current.length >= 3 ? current : [...current, code]));
          }}
          className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
        >
          <option value="">{addLabel}</option>
          {left.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}
    </fieldset>
  );
}

/**
 * Bringing your own Google Cloud project.
 *
 * Off by default, and most households will never touch it: WonderHome's own
 * key is included with the plan and needs no account. It is here for the
 * households who want their own billing, their own quotas and their own
 * agreement with Google — and theirs wins the moment it is set.
 *
 * The field is a password field and is never pre-filled, because the key
 * cannot be read back out of the database at all, so there would be
 * nothing honest to put in it.
 */
function OwnKeyForm({
  householdId,
  save,
  remove,
  configured,
  labels,
}: {
  householdId: string;
  save: (state: ActionState, formData: FormData) => Promise<ActionState>;
  remove: (state: ActionState, formData: FormData) => Promise<ActionState>;
  configured: boolean;
  labels: VoiceFormLabels;
}) {
  const words = labels.ownKey;
  const [open, setOpen] = useState(configured);
  const [saveState, saveAction] = useActionState(save, {});
  const [removeState, removeAction] = useActionState(remove, {});
  const state = saveState.error || saveState.notice ? saveState : removeState;

  return (
    <section className="space-y-3">
      <SectionHeader title={words.title} />

      <Card className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{words.bring}</p>
            <p className="text-xs text-[var(--wh-foreground-subtle)]">{words.bringBody}</p>
          </div>
          <Switch
            checked={open}
            onCheckedChange={setOpen}
            label={words.switch}
            disabled={configured}
          />
        </div>

        {state.error ? <Alert>{state.error}</Alert> : null}
        {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}

        {open ? (
          <>
            <form action={saveAction} className="space-y-3">
              <input type="hidden" name="householdId" value={householdId} />
              {configured ? <SavedKeyRow label={words.apiKey} saved={words.saved} /> : null}
              <PasswordField
                label={configured ? words.newKey : words.apiKey}
                name="apiKey"
                required
                minLength={20}
                autoComplete="off"
                placeholder={configured ? words.newKeyPlaceholder : "AIza…"}
                hint={words.hint}
              />
              <Submit label={configured ? words.replace : words.use} pendingLabel={labels.saving} />
            </form>

            {configured ? (
              <form action={removeAction}>
                <input type="hidden" name="householdId" value={householdId} />
                <Button type="submit" variant="secondary">
                  {words.remove}
                </Button>
              </form>
            ) : null}
          </>
        ) : null}
      </Card>
    </section>
  );
}
