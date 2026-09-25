import type { KeySource } from "@wonderhome/core/ai/model-key";
import type { ContentClass, DataUsePolicy } from "@wonderhome/core/ai/privacy";
import type { Formatter } from "@wonderhome/core/i18n/format";
import type { TranslationKey, Translate } from "@wonderhome/core/i18n/translate";
import type { Permission } from "@wonderhome/core/identity/permissions";
import type { DeliveryChannel } from "@wonderhome/core/notifications/channels";
import { EXPORT_SECTIONS, sectionsFor } from "@wonderhome/core/privacy/export";
import { retentionSchedule } from "@wonderhome/core/privacy/retention";
import type { SpeechKeySource } from "@wonderhome/core/voice/platform-key";
import { LIVE_ENGINE_LABELS, RECOGNITION_MODEL_LABELS, TIER_LABELS, VOICE_LANGUAGES, type VoiceSettings } from "@wonderhome/core/voice/settings";
import type { Capability } from "@wonderhome/core/voicelink/capabilities";
import type { VoiceScope } from "@wonderhome/core/voicelink/scopes";

import type { AiKeyFormLabels } from "../_components/ai-key-form";
import type { DataUseFormLabels } from "../_components/data-use-form";
import type { ChannelPreferenceLabels } from "../_components/notification-preferences-form";
import type { CancelDeletionLabels, ConfirmItIsYouLabels, DeletionFormLabels, ExportFormLabels } from "../_components/privacy-forms";
import type { ReminderSettingsLabels } from "../_components/reminder-settings-form";
import type { VoiceFormLabels } from "../_components/voice-forms";
import type { WhatsAppConnectLabels, WhatsAppDisconnectLabels, WhatsAppLinkedLabels } from "../_components/whatsapp-connect";

/**
 * The Settings sub-pages' words in the viewer's language (story 22-004).
 *
 * Server code only: each builder takes the request's translator and returns
 * plain strings, which is all a client component receives. A sentence that a
 * core module composes in English for other callers is composed again here
 * from the same data and the same rules, so the meaning never drifts — only
 * the language does. Names, product names and provider names are never
 * translated.
 */

/** A key composed from a closed set that the compiler cannot see; falls back to the English it replaces. */
function lookup(t: Translate, key: string, fallback: string): string {
  return t(key as TranslationKey) || fallback;
}

// ---------------------------------------------------------------------------
// AI Assistant

/** Which key answers for the household, in words (mirrors `describeKeySource`). */
export function keySourceWords(t: Translate, source: KeySource): { title: string; detail: string } {
  return { title: t(`settingsPage.ai.source.${source}.title`), detail: t(`settingsPage.ai.source.${source}.detail`) };
}

export function aiKeyFormLabels(t: Translate): AiKeyFormLabels {
  return {
    provider: t("settingsPage.aiKey.provider"),
    apiKey: t("settingsPage.aiKey.apiKey"),
    hint: t("settingsPage.aiKey.hint"),
    replace: t("settingsPage.replaceKey"),
    useOwn: t("settingsPage.aiKey.useOwn"),
    saving: t("common.saving"),
    remove: t("settingsPage.aiKey.remove"),
  };
}

/** What the household has agreed a model provider may be sent (mirrors `describeDataUse`, line for line). */
export function dataUseLines(t: Translate, policy: DataUsePolicy): string[] {
  if (!policy.allowProviderContent) return [t("settingsPage.dataUse.nothing")];
  const beyondGeneral = policy.allowedClasses.filter((entry) => entry !== "general");
  const className = (entry: ContentClass) => t(`settingsPage.dataUse.class.${entry}`);
  return [
    t("settingsPage.dataUse.maxItems", { count: policy.maxItems }),
    beyondGeneral.length === 0
      ? t("settingsPage.dataUse.generalOnly")
      : t("settingsPage.dataUse.alsoAgreed", { classes: beyondGeneral.map(className).join(t("settingsPage.listSeparator")) }),
    policy.allowRetention ? t("settingsPage.dataUse.retentionOn") : t("settingsPage.dataUse.retentionOff"),
    t("settingsPage.dataUse.keys"),
    t("settingsPage.dataUse.names"),
  ];
}

export function dataUseFormLabels(t: Translate): DataUseFormLabels {
  const option = (value: "child" | "health" | "financial" | "location" | "private_message") => ({
    label: t(`settingsPage.dataUseForm.${value}`),
    detail: t(`settingsPage.dataUseForm.${value}.detail`),
  });
  return {
    allow: t("settingsPage.dataUseForm.allow"),
    allowDetail: t("settingsPage.dataUseForm.allowDetail"),
    include: t("settingsPage.dataUseForm.include"),
    includeDetail: t("settingsPage.dataUseForm.includeDetail"),
    classes: {
      child: option("child"),
      health: option("health"),
      financial: option("financial"),
      location: option("location"),
      private_message: option("private_message"),
    },
    retention: t("settingsPage.dataUseForm.retention"),
    retentionDetail: t("settingsPage.dataUseForm.retentionDetail"),
    footer: t("settingsPage.dataUseForm.footer"),
    submit: t("settingsPage.dataUseForm.submit"),
    saving: t("common.saving"),
  };
}

// ---------------------------------------------------------------------------
// Notifications

export function channelPreferenceLabels(t: Translate, channel: DeliveryChannel): ChannelPreferenceLabels {
  return {
    name: t(`settingsPage.notifications.channel.${channel}`),
    description: t(`settingsPage.notifications.channel.${channel}.description`),
    notConnected: t("settingsPage.notifications.notConnected"),
    sendHere: t("settingsPage.notifications.sendHere"),
    whatsappNumber: t("settingsPage.notifications.whatsappNumber"),
    whatsappHint: t("settingsPage.notifications.whatsappHint"),
    quietFrom: t("settingsPage.notifications.quietFrom"),
    quietUntil: t("settingsPage.notifications.quietUntil"),
    off: t("settingsPage.notifications.off"),
    save: t("common.save"),
    saving: t("common.saving"),
  };
}

/** A reminder timing preset, by its key; a preset added later reads in English until it is translated. */
export function reminderPresetLabel(t: Translate, key: string, english: string): string {
  return lookup(t, `settingsPage.notifications.preset.${key}`, english);
}

export function reminderSettingsLabels(t: Translate): ReminderSettingsLabels {
  return {
    saving: t("common.saving"),
    save: t("common.save"),
    quiet: {
      title: t("settingsPage.notifications.quiet.title"),
      body: t("settingsPage.notifications.quiet.body"),
      keep: t("settingsPage.notifications.quiet.keep"),
      from: t("settingsPage.notifications.quiet.from"),
      until: t("settingsPage.notifications.quiet.until"),
      clock: t("settingsPage.notifications.quiet.clock", { timeZone: "{timeZone}" }),
      save: t("settingsPage.notifications.quiet.save"),
    },
    prefs: {
      title: t("settingsPage.notifications.prefs.title"),
      body: t("settingsPage.notifications.prefs.body"),
      on: t("settingsPage.notifications.prefs.on"),
      timing: t("settingsPage.notifications.prefs.timing", { category: "{category}" }),
      save: t("settingsPage.notifications.prefs.save"),
      categories: {
        meals: t("nav.item.meals"),
        school: t("nav.item.school"),
        groceries: t("nav.item.groceries"),
        bills: t("nav.item.bills"),
        pets: t("settingsPage.notifications.category.pets"),
        family: t("nav.family"),
      },
    },
    smart: {
      title: t("settingsPage.notifications.smart.title"),
      body: t("settingsPage.notifications.smart.body"),
      digest: t("settingsPage.notifications.smart.digest"),
      digestBody: t("settingsPage.notifications.smart.digestBody"),
      learn: t("settingsPage.notifications.smart.learn"),
      learnBody: t("settingsPage.notifications.smart.learnBody"),
    },
  };
}

// ---------------------------------------------------------------------------
// Privacy

/** "90 days", "A year", "Until you remove it" (mirrors `describeDays`). */
export function retentionDays(t: Translate, format: Formatter, days: number | null): string {
  if (days === null) return t("settingsPage.privacy.days.forever");
  if (days >= 730) return t("settingsPage.privacy.days.years", { count: Math.round(days / 365) });
  if (days === 365) return t("settingsPage.privacy.days.year");
  // A fraction of a year: the number is written the reader's way, and takes the general plural form.
  if (days > 365) return t("settingsPage.privacy.days.years", { count: format.number(Math.round((days / 365) * 10) / 10, 1) });
  if (days >= 30 && days % 30 === 0) return t("settingsPage.privacy.days.months", { count: days / 30 });
  return t("settingsPage.privacy.days.days", { count: days });
}

/** The retention schedule, in the order the code keeps it, in the reader's words. */
export function retentionRows(t: Translate, format: Formatter) {
  return retentionSchedule().map(({ key, rule }) => ({
    key,
    label: t(`settingsPage.privacy.retention.${key}`),
    because: t(`settingsPage.privacy.retention.${key}.because`),
    days: retentionDays(t, format, rule.days),
    kept: rule.days === null,
  }));
}

/** What an export holds for this person (mirrors `describeExport`, from the same sections). */
export function exportLines(t: Translate, permissions: readonly Permission[], language: string): string[] {
  const name = (section: { key: string; label: string }) => lookup(t, `settingsPage.privacy.export.section.${section.key}`, section.label);
  const separator = t("settingsPage.privacy.export.separator");
  const included = sectionsFor(permissions).map(name);
  const withheld = EXPORT_SECTIONS.filter((section) => section.requires && !permissions.includes(section.requires));
  // Mid-sentence, a section reads in lower case — except in German, where its nouns keep their capitals.
  const inSentence = (text: string) => (language === "de" ? text : text.toLocaleLowerCase(language));
  return [
    t("settingsPage.privacy.export.contains", { sections: included.join(separator) }),
    withheld.length > 0
      ? t("settingsPage.privacy.export.withheld", { sections: withheld.map((section) => inSentence(name(section))).join(separator) })
      : t("settingsPage.privacy.export.nothingWithheld"),
    t("settingsPage.privacy.export.never"),
  ];
}

export function confirmItIsYouLabels(t: Translate, purpose: "export" | "deletion"): ConfirmItIsYouLabels {
  return {
    password: t("settingsPage.privacy.confirm.password"),
    hint: purpose === "export" ? t("settingsPage.privacy.confirm.exportHint") : t("settingsPage.privacy.confirm.deletionHint"),
    submit: t("settingsPage.privacy.confirm.submit"),
    checking: t("settingsPage.checking"),
  };
}

export function exportFormLabels(t: Translate): ExportFormLabels {
  return {
    error: t("settingsPage.privacy.export.error"),
    preparing: t("settingsPage.privacy.export.preparing"),
    download: t("settingsPage.privacy.export.download"),
    confirmFirst: t("settingsPage.privacy.confirm.first"),
  };
}

export function deletionFormLabels(t: Translate): DeletionFormLabels {
  return {
    understand: t("settingsPage.privacy.delete.understand"),
    submit: t("settingsPage.privacy.delete.submit"),
    recording: t("settingsPage.privacy.delete.recording"),
    confirmFirst: t("settingsPage.privacy.confirm.first"),
  };
}

export function cancelDeletionLabels(t: Translate): CancelDeletionLabels {
  return { callOff: t("settingsPage.privacy.delete.callOff"), callingOff: t("settingsPage.privacy.delete.callingOff") };
}

// ---------------------------------------------------------------------------
// Voice

/** Whose speech key answers, in words (mirrors `describeSpeechSource`). */
export function speechSourceWords(t: Translate, source: SpeechKeySource): { title: string; detail: string } {
  return { title: t(`settingsPage.voice.source.${source}.title`), detail: t(`settingsPage.voice.source.${source}.detail`) };
}

/**
 * The voice languages, each named in the reader's language. English keeps the
 * list's own names; any other language takes the platform's name for the tag,
 * with a region only where the English name gives one ("ar-XA" is not a real
 * region, so Arabic is named alone).
 */
export function voiceLanguageOptions(language: string): { code: string; label: string }[] {
  if (language === "en") return VOICE_LANGUAGES.map(({ code, label }) => ({ code, label }));
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([language], { type: "language", languageDisplay: "standard" });
  } catch {
    names = null;
  }
  return VOICE_LANGUAGES.map(({ code, label }) => {
    const tag = label.includes("(") ? code : code.split("-")[0]!;
    let name: string | undefined;
    try {
      name = names?.of(tag);
    } catch {
      name = undefined;
    }
    if (!name || name === tag) return { code, label };
    return { code, label: name.charAt(0).toLocaleUpperCase(language) + name.slice(1) };
  });
}

/** "WaveNet, Hindi, male, 1.25× speed" — the voice at a glance (mirrors `describeVoice`). */
export function voiceSummary(t: Translate, settings: VoiceSettings, language: string): string {
  if (settings.provider === "browser") return t("settingsPage.voice.summary.browser");
  const languages = voiceLanguageOptions(language);
  const parts = [TIER_LABELS[settings.tier].name, languages.find((option) => option.code === settings.language)?.label ?? settings.language];
  if (settings.gender !== "any") parts.push(settings.gender === "male" ? t("settingsPage.voice.summary.male") : t("settingsPage.voice.summary.female"));
  if (settings.speakingRate !== 1) parts.push(t("settingsPage.voice.summary.speed", { rate: settings.speakingRate.toFixed(2) }));
  if (settings.pitch !== 0) parts.push(t("settingsPage.voice.semitones", { value: `${settings.pitch > 0 ? "+" : ""}${settings.pitch}` }));
  return parts.join(t("settingsPage.listSeparator"));
}

export function voiceFormLabels(t: Translate, language: string): VoiceFormLabels {
  const tier = (key: keyof typeof TIER_LABELS) => ({ name: TIER_LABELS[key].name, detail: t(`settingsPage.voice.tier.${key}`) });
  return {
    saving: t("common.saving"),
    previewError: t("settingsPage.voice.previewError"),
    who: t("settingsPage.voice.who"),
    setOn: t("settingsPage.voice.setOn", { date: "{date}" }),
    service: t("settingsPage.voice.service"),
    serviceHint: t("settingsPage.voice.serviceHint"),
    serviceHintNone: t("settingsPage.voice.serviceHintNone"),
    optionBrowser: t("settingsPage.voice.option.browser"),
    optionGoogle: t("settingsPage.voice.option.google"),
    live: t("settingsPage.voice.live"),
    liveEngine: t("settingsPage.voice.liveEngine"),
    // The engines' names are product names and stay as they are.
    engines: {
      wonderhome: { name: LIVE_ENGINE_LABELS.wonderhome.name, detail: t("settingsPage.voice.engine.wonderhome") },
      gemini_live: { name: LIVE_ENGINE_LABELS.gemini_live.name, detail: t("settingsPage.voice.engine.gemini_live") },
    },
    geminiHears: t("settingsPage.voice.geminiHears"),
    geminiUnavailable: t("settingsPage.voice.geminiUnavailable", { reason: "{reason}" }),
    notAvailable: t("settingsPage.voice.notAvailable"),
    sounds: t("settingsPage.voice.sounds"),
    soundsGoogle: t("settingsPage.voice.soundsGoogle"),
    soundsBrowser: t("settingsPage.voice.soundsBrowser"),
    language: t("settingsPage.voice.language"),
    languages: voiceLanguageOptions(language),
    tier: t("settingsPage.voice.tier"),
    tierHint: t("settingsPage.voice.tierHint"),
    // Google's family names ("WaveNet", "Chirp 3 HD") are product names.
    tiers: {
      standard: tier("standard"),
      wavenet: tier("wavenet"),
      neural2: tier("neural2"),
      studio: tier("studio"),
      "chirp3-hd": tier("chirp3-hd"),
    },
    gender: t("settingsPage.voice.gender"),
    genderHint: t("settingsPage.voice.genderHint"),
    genders: { any: t("settingsPage.voice.gender.any"), male: t("settingsPage.voice.gender.male"), female: t("settingsPage.voice.gender.female") },
    specific: t("settingsPage.voice.specific"),
    specificHintGoogle: t("settingsPage.voice.specificHintGoogle"),
    specificHintBrowser: t("settingsPage.voice.specificHintBrowser"),
    chooseForMe: t("settingsPage.voice.chooseForMe"),
    rate: t("settingsPage.voice.rate"),
    slower: t("settingsPage.voice.slower"),
    faster: t("settingsPage.voice.faster"),
    pitch: t("settingsPage.voice.pitch"),
    semitones: t("settingsPage.voice.semitones", { value: "{value}" }),
    deeper: t("settingsPage.voice.deeper"),
    higher: t("settingsPage.voice.higher"),
    pitchHint: t("settingsPage.voice.pitchHint"),
    volume: t("settingsPage.voice.volume"),
    quieter: t("settingsPage.voice.quieter"),
    louder: t("settingsPage.voice.louder"),
    volumeHint: t("settingsPage.voice.volumeHint"),
    device: t("settingsPage.voice.device"),
    deviceHint: t("settingsPage.voice.deviceHint"),
    devices: {
      none: t("settingsPage.voice.device.none"),
      handset: t("settingsPage.voice.device.handset"),
      headphones: t("settingsPage.voice.device.headphones"),
      "small-speaker": t("settingsPage.voice.device.small-speaker"),
      "smart-speaker": t("settingsPage.voice.device.smart-speaker"),
      car: t("settingsPage.voice.device.car"),
      wearable: t("settingsPage.voice.device.wearable"),
    },
    speakReplies: t("settingsPage.voice.speakReplies"),
    speakRepliesHint: t("settingsPage.voice.speakRepliesHint"),
    playing: t("settingsPage.voice.playing"),
    hear: t("settingsPage.voice.hear"),
    listens: t("settingsPage.voice.listens"),
    listensBody: t("settingsPage.voice.listensBody"),
    spokenLanguage: t("settingsPage.voice.spokenLanguage"),
    spokenLanguageHint: t("settingsPage.voice.spokenLanguageHint"),
    sameAsAbove: t("settingsPage.voice.sameAsAbove"),
    alternatives: t("settingsPage.voice.alternatives"),
    alternativesHint: t("settingsPage.voice.alternativesHint"),
    models: {
      latest_short: { name: t("settingsPage.voice.model.latest_short"), detail: t("settingsPage.voice.model.latest_short.detail") },
      latest_long: { name: t("settingsPage.voice.model.latest_long"), detail: t("settingsPage.voice.model.latest_long.detail") },
      command_and_search: { name: t("settingsPage.voice.model.command_and_search"), detail: t("settingsPage.voice.model.command_and_search.detail") },
      // "Chirp" is Google's name for the model.
      chirp: { name: RECOGNITION_MODEL_LABELS.chirp.name, detail: t("settingsPage.voice.model.chirp.detail") },
    },
    phrases: t("settingsPage.voice.phrases"),
    phrasesHint: t("settingsPage.voice.phrasesHint"),
    punctuation: t("settingsPage.voice.punctuation"),
    profanity: t("settingsPage.voice.profanity"),
    profanityHint: t("settingsPage.voice.profanityHint"),
    enhanced: t("settingsPage.voice.enhanced"),
    enhancedHint: t("settingsPage.voice.enhancedHint"),
    applyNext: t("settingsPage.voice.applyNext"),
    save: t("settingsPage.voice.save"),
    ownKey: {
      title: t("settingsPage.voice.ownKey.title"),
      bring: t("settingsPage.voice.ownKey.bring"),
      bringBody: t("settingsPage.voice.ownKey.bringBody"),
      switch: t("settingsPage.voice.ownKey.switch"),
      apiKey: t("settingsPage.voice.ownKey.apiKey"),
      hint: t("settingsPage.voice.ownKey.hint"),
      replace: t("settingsPage.replaceKey"),
      use: t("settingsPage.voice.ownKey.use"),
      remove: t("settingsPage.voice.ownKey.remove"),
    },
  };
}

// ---------------------------------------------------------------------------
// Voice assistants

/** A capability, by its id; one added later reads in English until it is translated. */
export function capabilityLabel(t: Translate, capability: Pick<Capability, "id" | "label">): string {
  return lookup(t, `settingsPage.voiceAssistants.capability.${capability.id}`, capability.label);
}

export function scopeLabel(t: Translate, scope: VoiceScope): string {
  return t(`settingsPage.voiceAssistants.scope.${scope}`);
}

// ---------------------------------------------------------------------------
// WhatsApp

export function whatsappConnectLabels(t: Translate): WhatsAppConnectLabels {
  return {
    whatYouCanSend: [
      t("settingsPage.whatsapp.send.school"),
      t("settingsPage.whatsapp.send.bills"),
      t("settingsPage.whatsapp.send.groceries"),
      t("settingsPage.whatsapp.send.appointments"),
      t("settingsPage.whatsapp.send.anything"),
    ],
    number: t("settingsPage.whatsapp.number"),
    copyAria: t("settingsPage.whatsapp.copyAria"),
    copyTitle: t("settingsPage.whatsapp.copyTitle"),
    copied: t("settingsPage.whatsapp.copied"),
    connectToo: t("settingsPage.whatsapp.connectToo"),
    connectTitle: t("settingsPage.whatsapp.connectTitle"),
    connectTooBody: t("settingsPage.whatsapp.connectTooBody"),
    connectBody: t("settingsPage.whatsapp.connectBody"),
    gettingCode: t("settingsPage.whatsapp.gettingCode"),
    letsConnect: t("settingsPage.whatsapp.letsConnect"),
    linkTitle: t("settingsPage.whatsapp.linkTitle"),
    linkBody: t("settingsPage.whatsapp.linkBody"),
    step1: t("settingsPage.whatsapp.step1"),
    step2: t("settingsPage.whatsapp.step2"),
    step2Hint: t("settingsPage.whatsapp.step2Hint"),
    step3: t("settingsPage.whatsapp.step3"),
    open: t("settingsPage.whatsapp.open"),
    waiting: t("settingsPage.whatsapp.waiting"),
    checking: t("settingsPage.checking"),
    sent: t("settingsPage.whatsapp.sent"),
    newCode: t("settingsPage.whatsapp.newCode"),
    gettingNewCode: t("settingsPage.whatsapp.gettingNewCode"),
  };
}

export function whatsappLinkedLabels(t: Translate): WhatsAppLinkedLabels {
  return {
    title: t("settingsPage.whatsapp.linked"),
    phone: t("settingsPage.whatsapp.linkedPhone", { phone: "{phone}" }),
    number: t("settingsPage.whatsapp.linkedNumber"),
    lines: [t("settingsPage.whatsapp.linked.forward"), t("settingsPage.whatsapp.linked.homesend"), t("settingsPage.whatsapp.linked.nothingPaid")],
    goHomeSend: t("settingsPage.whatsapp.goHomeSend"),
  };
}

/** Ending a link: your own (`name` null) or someone else's, by their name. */
export function whatsappDisconnectLabels(t: Translate, name: string | null): WhatsAppDisconnectLabels {
  return {
    aria: name === null ? t("settingsPage.whatsapp.disconnectMine") : t("settingsPage.whatsapp.disconnectFor", { name }),
    title: name === null ? t("settingsPage.whatsapp.disconnectMineTitle") : t("settingsPage.whatsapp.disconnectForTitle", { name }),
    description: t("settingsPage.whatsapp.disconnectBody"),
    confirm: t("settingsPage.whatsapp.disconnect"),
    cancel: t("settingsPage.cancel"),
  };
}
