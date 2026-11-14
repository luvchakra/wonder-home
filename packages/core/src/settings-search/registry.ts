import type { TranslationKey } from "../i18n/translate";

/**
 * Every setting a person can reach from Settings or Profile, in one typed list, so a new
 * setting registers in one place and the search finds it (the owner, 2026-11-03).
 *
 * An entry names:
 *  - `label`: a catalog key, so the label is already in every language (the same key the
 *    screen shows, wherever there is one);
 *  - `kw`: when true, `settingsSearch.kw.<id>` carries comma-separated synonyms in each
 *    language ("rupee", "quiet", "password");
 *  - `parent`: the card or page it sits in, shown as the breadcrumb;
 *  - `href`: the page, then `#anchor`, the id the screen carries. The completeness test
 *    (`apps/web/app/settings/_lib/settings-registry.test.ts`) fails when an anchor is not in
 *    the page, or a settings page, section anchor or settings route has no entry;
 *  - `who`: who is shown it. Hiding is presentation; the page and its actions still check.
 *
 * Labels and keywords only: no household data ever enters the index, and nothing here is a
 * platform-admin screen.
 */
export type Audience =
  /** Every signed-in member. */
  | "everyone"
  /** Everyone but children. */
  | "nonChild"
  /** Adults only (not helpers, not children). */
  | "adult"
  /** Admins: those who hold `household.manage`. */
  | "admin"
  /** Those who hold `integrations.manage`. */
  | "integrations"
  /** `integrations.manage` and developer access switched on for the deployment. */
  | "developer";

export type RegistryEntry = {
  id: string;
  parent?: string;
  label: TranslationKey;
  href: string;
  who: Audience;
  kw?: true;
  desc?: TranslationKey;
};

const e = (id: string, parent: string | undefined, label: TranslationKey, href: string, who: Audience = "everyone", more: { kw?: true; desc?: TranslationKey } = {}): RegistryEntry => ({
  id,
  ...(parent ? { parent } : {}),
  label,
  href,
  who,
  ...more,
});

export const SETTINGS_REGISTRY: RegistryEntry[] = [
  // ── Manage Household (Admins) ─────────────────────────────────────────────
  e("manage", undefined, "nav.item.manage", "/settings#manage", "admin", { kw: true }),
  e("address", "manage", "manage.section.address", "/settings#address", "admin", { kw: true }),
  e("members", "manage", "manage.section.members", "/family", "admin", { kw: true }),
  e("responsibilities", "manage", "nav.item.responsibilities", "/household/responsibilities", "admin", { kw: true }),
  e("playbook", "manage", "manage.section.playbook", "/settings#playbook", "admin", { kw: true }),
  e("playbook-add", "playbook", "manage.form.savePlaybook", "/settings#add-playbook", "admin", { kw: true }),
  e("policies", "manage", "manage.section.policies", "/settings#policies", "admin", { kw: true }),
  e("policy-add", "policies", "manage.form.savePolicy", "/settings#add-policy", "admin", { kw: true }),
  e("autonomy", "manage", "manage.section.autonomy", "/settings#autonomy", "admin", { kw: true }),
  e("teach", "manage", "settingsHome.teach", "/settings#teach", "admin", { kw: true }),
  e("manage-notifications", "manage", "manage.section.notifications", "/settings/notifications#household", "admin", { kw: true }),
  e("activity", "manage", "manage.section.activity", "/settings#activity", "admin", { kw: true }),

  // ── Assistant: AI ─────────────────────────────────────────────────────────
  e("assistant", undefined, "settingsHome.group.assistant", "/settings#assistant", "everyone", { kw: true }),
  e("ai", "assistant", "settingsPage.ai.title", "/settings/ai", "everyone", { kw: true }),
  e("ai-acting", "ai", "settingsPage.ai.section.acting", "/settings/ai#acting", "everyone", { kw: true }),
  e("ai-confirm", "ai-acting", "settingsPage.ai.confirmRequested.title", "/settings/ai#confirm-requested", "everyone", { kw: true }),
  e("ai-auto-add", "ai-acting", "settingsPage.ai.autoAdd.title", "/settings/ai#auto-add", "everyone", { kw: true, desc: "settingsPage.ai.autoAdd.detail" }),
  e("ai-approval-scope", "ai-acting", "settingsPage.ai.recordFirst.approvalScope.title", "/settings/ai#approval-scope", "everyone", { kw: true }),
  e("ai-direct-money", "ai-acting", "settingsPage.ai.recordFirst.moneyHealth.title", "/settings/ai#money-health", "everyone", { kw: true }),
  e("ai-new-senders", "ai-acting", "settingsPage.ai.recordFirst.outsideSenders.title", "/settings/ai#new-senders", "everyone", { kw: true }),
  e("ai-homesend-tidy", "ai-acting", "settingsPage.ai.homesendTidy.title", "/settings/ai#homesend-tidy", "everyone", { kw: true, desc: "settingsPage.ai.homesendTidy.detail" }),
  e("ai-key", "ai", "settingsPage.ai.section.key", "/settings/ai#provider-key", "everyone", { kw: true }),
  e("ai-provider", "ai-key", "settingsPage.aiKey.provider", "/settings/ai#provider", "everyone", { kw: true }),
  e("ai-api-key", "ai-key", "settingsPage.aiKey.apiKey", "/settings/ai#apiKey", "everyone", { kw: true }),
  e("ai-voice-key", "ai-key", "settingsPage.ai.voiceKey.title", "/settings/ai#voice-key", "everyone", { kw: true }),
  e("ai-share", "ai", "settingsPage.ai.section.share", "/settings/ai#share", "everyone", { kw: true }),
  e("ai-share-allow", "ai-share", "settingsPage.dataUseForm.allow", "/settings/ai#share", "everyone", { kw: true }),
  e("ai-share-include", "ai-share", "settingsPage.dataUseForm.include", "/settings/ai#share", "everyone", { kw: true }),
  e("ai-share-retention", "ai-share", "settingsPage.dataUseForm.retention", "/settings/ai#share", "everyone", { kw: true }),

  // ── Assistant: Voice ──────────────────────────────────────────────────────
  e("voice", "assistant", "settingsPage.voice.title", "/settings/voice", "everyone", { kw: true }),
  e("voice-talking", "voice", "settingsPage.voice.simple.talking", "/settings/voice#liveEngine", "admin", { kw: true }),
  e("voice-engine", "voice-talking", "settingsPage.voice.liveEngine", "/settings/voice#liveEngine", "admin", { kw: true }),
  e("voice-hearing", "voice", "settingsPage.voice.simple.hearing", "/settings/voice#speakReplies", "admin", { kw: true }),
  e("voice-read-aloud", "voice-hearing", "settingsPage.voice.speakReplies", "/settings/voice#speakReplies", "admin", { kw: true }),
  e("voice-service", "voice-hearing", "settingsPage.voice.service", "/settings/voice#provider", "admin", { kw: true }),
  e("voice-language", "voice-hearing", "settingsPage.voice.language", "/settings/voice#language", "admin", { kw: true }),
  e("voice-family", "voice-hearing", "settingsPage.voice.tier", "/settings/voice#tier", "admin", { kw: true }),
  e("voice-gender", "voice-hearing", "settingsPage.voice.gender", "/settings/voice#gender", "admin", { kw: true }),
  e("voice-name", "voice-hearing", "settingsPage.voice.specific", "/settings/voice#voiceName", "admin", { kw: true }),
  e("voice-speed", "voice-hearing", "settingsPage.voice.rate", "/settings/voice#speakingRate", "admin", { kw: true }),
  e("voice-pitch", "voice-hearing", "settingsPage.voice.pitch", "/settings/voice#pitch", "admin", { kw: true }),
  e("voice-volume", "voice-hearing", "settingsPage.voice.volume", "/settings/voice#volumeGainDb", "admin", { kw: true }),
  e("voice-device", "voice-hearing", "settingsPage.voice.device", "/settings/voice#listeningDevice", "admin", { kw: true }),
  e("voice-understanding", "voice", "settingsPage.voice.simple.understanding", "/settings/voice#recognitionLanguage", "admin", { kw: true }),
  e("voice-spoken-language", "voice-understanding", "settingsPage.voice.spokenLanguage", "/settings/voice#recognitionLanguage", "admin", { kw: true }),
  e("voice-phrases", "voice-understanding", "settingsPage.voice.phrases", "/settings/voice#phraseHints", "admin", { kw: true }),
  e("voice-advanced", "voice", "settingsPage.voice.simple.advanced", "/settings/voice#voice-advanced", "admin", { kw: true }),

  // ── Connections ───────────────────────────────────────────────────────────
  e("connections", undefined, "connectionsPage.title", "/settings/connections", "everyone", { kw: true }),
  e("whatsapp", "connections", "settingsPage.notifications.channel.whatsapp", "/settings/connections#whatsapp", "everyone", { kw: true }),
  e("voice-assistants", "connections", "settingsPage.voiceAssistants.title", "/settings/connections#voice", "everyone", { kw: true }),
  e("school", "connections", "school.connect.title", "/settings/connections#school", "integrations", { kw: true }),
  e("shopping", "connections", "nav.item.groceries", "/settings/connections#shopping", "adult", { kw: true }),
  e("calendar", "connections", "manage.integrations.kind.calendar", "/settings/connections#calendar", "integrations", { kw: true }),
  e("email", "connections", "manage.integrations.kind.email", "/settings/connections#email", "integrations", { kw: true }),
  e("weather", "connections", "manage.integrations.kind.weather", "/settings/connections#weather", "integrations", { kw: true }),
  e("smart-home", "connections", "settingsSearch.label.smartHome", "/settings/connections#smart-home", "integrations", { kw: true }),
  e("payments", "connections", "settingsSearch.label.payments", "/settings/connections#payments", "integrations", { kw: true }),
  e("developer", "connections", "manage.integrations.developer", "/settings/connections#developer", "developer", { kw: true }),
  e("connectors", "connections", "connectionsPage.accounts", "/settings/connections#accounts", "everyone", { kw: true }),

  // ── Plan ──────────────────────────────────────────────────────────────────
  e("plan", undefined, "settingsPage.plan.title", "/settings/plan", "everyone", { kw: true }),
  e("plan-usage", "plan", "settingsPage.plan.usage", "/settings/plan#usage", "everyone", { kw: true }),
  e("plan-choose", "plan", "settingsPage.plan.choose", "/settings/plan#choose", "everyone", { kw: true }),
  e("plan-cancel", "plan", "settingsPage.plan.cancel", "/settings/plan#plan-card", "admin", { kw: true }),
  e("plan-billing", "plan", "settingsPage.plan.billing", "/settings/plan/billing", "admin", { kw: true }),

  // ── Profile (personal) ────────────────────────────────────────────────────
  e("profile", undefined, "nav.item.profile", "/settings/profile", "everyone", { kw: true }),
  e("profile-you", "profile", "profileHome.group.you", "/settings/profile#profile", "everyone", { kw: true }),
  e("profile-photo", "profile", "settingsHome.avatar.add", "/settings/profile#profile", "everyone", { kw: true }),
  e("sign-out", "profile", "nav.logout", "/settings/profile#account", "everyone", { kw: true }),

  e("language-region", "profile", "settings.languageRegion", "/settings/language-region", "everyone", { kw: true }),
  e("language", "language-region", "field.language", "/settings/language-region/language", "everyone", { kw: true }),
  e("region", "language-region", "field.region", "/settings/language-region/region", "everyone", { kw: true }),
  e("currency", "language-region", "field.currency", "/settings/language-region/currency", "everyone", { kw: true }),
  e("datetime", "language-region", "settingsSearch.label.dateTime", "/settings/language-region/datetime", "everyone", { kw: true }),
  e("units", "language-region", "field.units", "/settings/language-region/datetime#units", "everyone", { kw: true }),
  e("member-languages", "language-region", "settings.memberLanguages", "/settings/language-region/members", "everyone", { kw: true }),

  e("notifications", "profile", "settingsPage.notifications.title", "/settings/notifications", "everyone", { kw: true }),
  e("notification-center", "notifications", "notificationCenter.title", "/settings/notifications#notification-center", "everyone", { kw: true }),
  e("quiet-hours", "notifications", "settingsPage.notifications.quiet.title", "/settings/notifications#quiet-hours", "everyone", { kw: true }),
  e("smart-reminders", "notifications", "settingsPage.notifications.smart.digest", "/settings/notifications#smart-reminders", "everyone", { kw: true }),
  e("notification-routing", "notifications", "settingsPage.notifications.routing.title", "/settings/notifications#routing", "everyone", { kw: true }),
  e("push", "notifications", "push.device.title", "/settings/notifications#push", "everyone", { kw: true }),
  e("channels", "notifications", "settingsPage.notifications.channels", "/settings/notifications#channels", "everyone", { kw: true }),
  e("notification-delivery", "notifications", "manage.section.delivery", "/settings/notifications#delivery", "admin", { kw: true }),

  e("privacy", "profile", "settingsHome.privacy.title", "/settings/privacy", "everyone", { kw: true }),
  e("privacy-retention", "privacy", "settingsPage.privacy.section.retention", "/settings/privacy#retention", "everyone", { kw: true }),
  e("privacy-export", "privacy", "settingsPage.privacy.section.export", "/settings/privacy#export", "everyone", { kw: true }),
  e("privacy-delete", "privacy", "settingsPage.privacy.section.delete", "/settings/privacy#delete", "everyone", { kw: true }),
  e("location", "privacy", "location.title", "/settings/location", "everyone", { kw: true }),
  e("location-sharing", "location", "location.turnOn", "/settings/location#sharing", "nonChild", { kw: true }),
  e("location-audience", "location", "settingsSearch.label.locationAudience", "/settings/location#audience", "nonChild", { kw: true }),
];
