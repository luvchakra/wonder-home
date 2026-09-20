"use client";

import { Play, Volume2 } from "lucide-react";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { cn } from "@wonderhome/core/lib/cn";
import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Card } from "@wonderhome/core/ui/card";
import { Pill } from "@wonderhome/core/ui/pill";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { Select } from "@wonderhome/core/ui/select";
import { Slider } from "@wonderhome/core/ui/slider";
import {
  DEVICE_LABELS,
  LISTENING_DEVICES,
  RECOGNITION_MODELS,
  RECOGNITION_MODEL_LABELS,
  TIER_LABELS,
  VOICE_GENDERS,
  VOICE_LANGUAGES,
  VOICE_TIERS,
  type VoiceSettings,
} from "@wonderhome/core/voice/settings";

import type { ActionState } from "../(auth)/actions";

type VoiceOption = { name: string; language: string; gender: string; tier: string };

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
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
  speechAvailable,
}: {
  householdId: string;
  settings: VoiceSettings;
  save: (state: ActionState, formData: FormData) => Promise<ActionState>;
  /** The deployment has a speech service configured. */
  speechAvailable: boolean;
}) {
  const [state, action] = useActionState(save, {});
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

    fetch(`/api/v1/households/${householdId}/voice?language=${encodeURIComponent(language)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!cancelled && payload?.voices) setVoices(payload.voices as VoiceOption[]);
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
            listeningDevice: String(data.get("listeningDevice") ?? settings.listeningDevice),
          },
        }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "That voice could not be played.");

      audioRef.current?.pause();
      const audio = new Audio(`data:${payload.mimeType};base64,${payload.audio}`);
      audioRef.current = audio;
      await audio.play();
    } catch (caught) {
      setPreviewError(caught instanceof Error ? caught.message : "That voice could not be played.");
    } finally {
      setPreviewing(false);
    }
  }, [householdId, previewing, settings]);

  return (
    <form ref={formRef} action={action} className="space-y-6">
      <input type="hidden" name="householdId" value={householdId} />

      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
      {previewError ? <Alert>{previewError}</Alert> : null}

      <section className="space-y-4">
        <SectionHeader title="Who does the speaking" />
        <p className="-mt-2 text-sm text-[var(--wh-foreground-muted)]">
          {speechAvailable
            ? "Google Cloud Speech is set up on this deployment and included in your plan — no key or billing of your own."
            : "No speech service is set up on this deployment yet, so WonderHome uses whatever voice your browser provides."}
        </p>

        <Select
          label="Speech service"
          name="provider"
          defaultValue={settings.provider}
          disabled={!speechAvailable}
          onChange={(event) => setProvider(event.target.value as VoiceSettings["provider"])}
          hint={
            speechAvailable
              ? "Google understands far more of what is said, and sounds the same on every device. Your browser's own voice sends nothing out of it."
              : "Ask whoever runs this WonderHome to configure a speech service."
          }
        >
          <option value="browser">My browser (free, varies by device)</option>
          {speechAvailable ? <option value="google">Google Cloud Speech (recommended)</option> : null}
        </Select>
      </section>

      <section className={cn("space-y-4", !usingGoogle && "opacity-60")}>
        <SectionHeader title="How it sounds" />
        <p className="-mt-2 text-sm text-[var(--wh-foreground-muted)]">
          {usingGoogle
            ? "The voice that reads replies aloud."
            : "These apply once a speech service is doing the speaking. Your browser picks its own voice."}
        </p>

        <Select
          label="Language and accent"
          name="language"
          defaultValue={settings.language}
          onChange={(event) => setLanguage(event.target.value)}
        >
          {VOICE_LANGUAGES.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </Select>

        <Select
          label="Voice family"
          name="tier"
          defaultValue={settings.tier}
          hint="Later families sound more human and cost more. Each has its own free monthly allowance from Google."
        >
          {VOICE_TIERS.map((tier) => (
            <option key={tier} value={tier}>
              {TIER_LABELS[tier].name} — {TIER_LABELS[tier].detail}
            </option>
          ))}
        </Select>

        <Select label="Voice" name="gender" defaultValue={settings.gender} hint="Used when no specific voice is chosen below.">
          {VOICE_GENDERS.map((gender) => (
            <option key={gender} value={gender}>
              {gender === "any" ? "Either" : gender === "male" ? "Male" : "Female"}
            </option>
          ))}
        </Select>

        <Select
          label="A specific voice"
          name="voiceName"
          defaultValue={settings.voiceName ?? ""}
          hint={
            usingGoogle
              ? "Google's own names. Leaving this on “Choose for me” follows the family and voice above."
              : "Choose Google above to see the voices your household can pick from."
          }
        >
          <option value="">Choose for me</option>
          {voices.map((voice) => (
            <option key={voice.name} value={voice.name}>
              {voice.name} ({voice.gender})
            </option>
          ))}
        </Select>

        <Slider
          label="How fast it talks"
          name="speakingRate"
          value={settings.speakingRate}
          min={0.25}
          max={4}
          step={0.05}
          format={(value) => `${value.toFixed(2)}×`}
          lowLabel="Slower"
          highLabel="Faster"
        />

        <Slider
          label="Pitch"
          name="pitch"
          value={settings.pitch}
          min={-20}
          max={20}
          step={0.5}
          format={(value) => `${value > 0 ? "+" : ""}${value} semitones`}
          lowLabel="Deeper"
          highLabel="Higher"
          hint="Google's newest voices set their own pitch and ignore this."
        />

        <Slider
          label="Volume"
          name="volumeGainDb"
          value={settings.volumeGainDb}
          min={-16}
          max={16}
          step={1}
          format={(value) => `${value > 0 ? "+" : ""}${value} dB`}
          lowLabel="Quieter"
          highLabel="Louder"
          hint="Above about +10 it starts to distort."
        />

        <Select
          label="Where you usually listen"
          name="listeningDevice"
          defaultValue={settings.listeningDevice}
          hint="Google masters the audio differently for each of these."
        >
          {LISTENING_DEVICES.map((device) => (
            <option key={device} value={device}>
              {DEVICE_LABELS[device]}
            </option>
          ))}
        </Select>

        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            name="speakReplies"
            defaultChecked={settings.speakReplies}
            className="size-5 rounded border-[var(--wh-border-strong)] accent-[var(--wh-primary)]"
          />
          <span>
            Read replies aloud
            <span className="block text-xs text-[var(--wh-foreground-subtle)]">
              Turn this off to keep live conversation listening, but answer in text only.
            </span>
          </span>
        </label>

        {usingGoogle ? (
          <Pill type="button" tone="quiet" onClick={() => void preview()} disabled={previewing}>
            {previewing ? <Volume2 aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
            {previewing ? "Playing…" : "Hear it"}
          </Pill>
        ) : null}
      </section>

      <section className={cn("space-y-4", !usingGoogle && "opacity-60")}>
        <SectionHeader title="How it listens" />
        <p className="-mt-2 text-sm text-[var(--wh-foreground-muted)]">What WonderHome does with what you say.</p>

        <Select
          label="Language you speak"
          name="recognitionLanguage"
          defaultValue={settings.recognitionLanguage ?? ""}
          hint="Leave this following the speaking language unless you answer in a different one."
        >
          <option value="">The same as above</option>
          {VOICE_LANGUAGES.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </Select>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Other languages you might switch to</legend>
          <p className="text-xs text-[var(--wh-foreground-subtle)]">
            Up to three. Useful when a sentence starts in one language and finishes in another.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {VOICE_LANGUAGES.slice(0, 14).map((option) => (
              <label key={option.code} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="alternativeLanguages"
                  value={option.code}
                  defaultChecked={settings.alternativeLanguages.includes(option.code)}
                  className="size-5 shrink-0 rounded border-[var(--wh-border-strong)] accent-[var(--wh-primary)]"
                />
                <span className="min-w-0">{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <Select label="How it listens" name="recognitionModel" defaultValue={settings.recognitionModel}>
          {RECOGNITION_MODELS.map((model) => (
            <option key={model} value={model}>
              {RECOGNITION_MODEL_LABELS[model].name} — {RECOGNITION_MODEL_LABELS[model].detail}
            </option>
          ))}
        </Select>

        <div className="space-y-1.5">
          <label htmlFor="phraseHints" className="block text-sm font-medium">
            Words to expect
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
            One per line. Names, dishes, a school, the dog. Everyone in your household is already included — these
            are the extras. This is the single biggest thing that stops WonderHome mishearing.
          </p>
        </div>

        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            name="automaticPunctuation"
            defaultChecked={settings.automaticPunctuation}
            className="size-5 rounded border-[var(--wh-border-strong)] accent-[var(--wh-primary)]"
          />
          <span>Add punctuation to what it hears</span>
        </label>

        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            name="profanityFilter"
            defaultChecked={settings.profanityFilter}
            className="size-5 rounded border-[var(--wh-border-strong)] accent-[var(--wh-primary)]"
          />
          <span>
            Mask swearing
            <span className="block text-xs text-[var(--wh-foreground-subtle)]">
              Worth turning on where children use the assistant.
            </span>
          </span>
        </label>

        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            name="enhancedRecognition"
            defaultChecked={settings.enhancedRecognition}
            className="size-5 rounded border-[var(--wh-border-strong)] accent-[var(--wh-primary)]"
          />
          <span>
            Use Google&apos;s enhanced models
            <span className="block text-xs text-[var(--wh-foreground-subtle)]">
              More accurate, and priced higher than the basic ones.
            </span>
          </span>
        </label>
      </section>

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 text-sm text-[var(--wh-foreground-muted)]">
          Changes apply to the next thing WonderHome says.
        </p>
        <Submit label="Save voice settings" />
      </Card>
    </form>
  );
}
