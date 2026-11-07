import { Bot, Mic, ShieldCheck } from "lucide-react";

import { credentialStatus, geminiVoiceKeyStatus } from "@wonderhome/core/ai/credentials";
import { describeKeySource, platformKey, resolveModelKey } from "@wonderhome/core/ai/model-key";
import { loadDataUse } from "@wonderhome/core/ai/privacy-repository";
import { loadConfirmRequested } from "@wonderhome/core/conversation/consent-repository";
import { AUTO_ADD_PERCENTS } from "@wonderhome/core/homesend/auto-add";
import { loadAutoAddPercent } from "@wonderhome/core/household/auto-add-repository";
import { loadDirectAdd } from "@wonderhome/core/household/direct-add-repository";
import { loadHomeSendTidy } from "@wonderhome/core/household/homesend-tidy-repository";
import { keyLabel } from "@wonderhome/core/homesend/learned";
import { listLearnedDefaults } from "@wonderhome/core/homesend/learned-repository";
import { listMembers } from "@wonderhome/core/identity/households";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Badge } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";

import { removeAiKey, removeGeminiVoiceKey, saveAiKey, saveGeminiVoiceKey } from "../../(auth)/ai-key-actions";
import { saveDataUseAction } from "../../(auth)/privacy-actions";
import { AiKeyForm } from "../../_components/ai-key-form";
import { ReturnLink, returnLabelKey } from "../../_components/return-link";
import { safeReturnTo } from "../../_lib/return-to";
import { openKeyAlerts } from "@wonderhome/core/ai/key-alert-status";
import { AutoAddPercentPicker } from "../../_components/auto-add-percent-picker";
import { DirectAddSwitch } from "../../_components/direct-add-switch";
import { HomeSendLearned } from "../../_components/homesend-learned";
import { HomeSendTidySwitch } from "../../_components/homesend-tidy-switch";
import { KeyAlertBanner } from "../../_components/key-alert-banner";
import { ConfirmRequestedSwitch } from "../../_components/confirm-requested-switch";
import { DataUseForm } from "../../_components/data-use-form";
import { formatDate, requireSession } from "../../_lib/session";
import { aiKeyFormLabels, dataUseFormLabels, dataUseLines, keySourceWords } from "../../_lib/settings-labels";
import { OpenOnHash } from "../../_components/open-on-hash";

export const metadata = { title: "AI Assistant" };
export const dynamic = "force-dynamic";

/**
 * The assistant's one settings page (Settings consolidation): which key
 * answers for the household, the household's own key, and what the
 * assistant may share with a model provider. Every member can read it;
 * only someone with `household.manage` sees the editors, and the actions
 * check that again on the server. A stored key is never shown back.
 */
export default async function AiAssistantSettingsPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const [query, session] = await Promise.all([searchParams, requireSession("/settings/ai")]);
  const returnTo = safeReturnTo(query.returnTo);
  const { supabase, membership, view, viewer, secondary } = session;
  const householdId = membership.household.id;
  const [credential, voiceCredential, dataUse, confirmRequested, autoAddPercent, directAdd, keyAlerts, homesendTidy, learned, members] = await Promise.all([
    credentialStatus(supabase, householdId).catch(() => ({ configured: false, provider: null, updatedAt: null })),
    geminiVoiceKeyStatus(supabase, householdId).catch(() => ({ configured: false, provider: null, updatedAt: null })),
    loadDataUse(supabase, householdId),
    loadConfirmRequested(supabase, householdId),
    loadAutoAddPercent(supabase, householdId),
    loadDirectAdd(supabase, householdId),
    openKeyAlerts(supabase, householdId),
    loadHomeSendTidy(supabase, householdId),
    listLearnedDefaults(supabase, householdId).catch(() => []),
    listMembers(supabase, householdId, null).catch(() => []),
  ]);

  // Which key actually answers, decided in one place so the screen can never
  // disagree with the server about it.
  const key = resolveModelKey(credential.configured && credential.provider ? { provider: credential.provider, key: "set" } : null, platformKey());
  const keyNote = describeKeySource(key.source);
  const manages = view.permissions.includes("household.manage");
  const { t } = session.locale;
  const keyWords = keySourceWords(t, key.source);
  // What HomeSend learned (14-066), in words: "class2@lakeside.edu → Tara", and who taught it when.
  const nameOf = new Map(members.map((member) => [member.id, member.displayName]));
  const learnedRows = learned
    .filter((row) => nameOf.has(row.valueMemberId))
    .map((row) => {
      const date = formatDate(membership.household.timezone, new Date(row.learnedAt));
      const by = row.learnedByMemberId ? nameOf.get(row.learnedByMemberId) : undefined;
      return {
        id: row.id,
        name: `${keyLabel(row.key)} → ${nameOf.get(row.valueMemberId)}`,
        reason: row.mixed ? t("settingsPage.ai.learned.mixed") : by ? t("settingsPage.ai.learned.by", { name: by, date }) : t("settingsPage.ai.learned.on", { date }),
      };
    });
  // Gemini voice runs only on Google: its own key first, else the assistant's when that is Google's.
  const voiceLine = voiceCredential.configured
    ? t("settingsPage.ai.voiceKey.own", { date: voiceCredential.updatedAt ? formatDate(membership.household.timezone, voiceCredential.updatedAt, "long") : "" })
    : key.provider === "google"
      ? t("settingsPage.ai.voiceKey.assistant")
      : t("settingsPage.ai.voiceKey.none");
  // The environment variable's name keeps its own code styling wherever the sentence puts it.
  const [noKeyBefore, noKeyAfter] = t("settingsPage.ai.noPlatformKey", { variable: "{variable}" }).split("{variable}");

  return (
    <AppShell active="more" viewer={viewer} secondary={secondary} pathname="/settings/ai" back={{ href: "/settings", label: t("settingsPage.backToSettings") }} title={t("settingsPage.ai.title")}>
      <div className="space-y-6">
        <OpenOnHash />
        <header className="wh-rise">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("settingsPage.ai.title")}</h1>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{t("settingsPage.ai.lede", { household: membership.household.name })}</p>
        </header>
        {returnTo ? <ReturnLink href={returnTo} label={t(returnLabelKey(returnTo))} /> : null}
        {/* This is the page the banner sends an Admin to, so it says what is wrong without a link back to itself. */}
        <KeyAlertBanner alerts={keyAlerts} manages={manages} link={false} t={t} />

        {/* What HomeTalk does with a request (HomeBrain 4.0 §3.9): first, because it is what a person meets every day. */}
        <section id="acting">
          <SectionHeader title={t("settingsPage.ai.section.acting")} />
          <Card className="p-4">
            <ConfirmRequestedSwitch
              householdId={householdId}
              confirm={confirmRequested}
              manages={manages}
              labels={{
                title: t("settingsPage.ai.confirmRequested.title"),
                on: t("settingsPage.ai.confirmRequested.on"),
                off: t("settingsPage.ai.confirmRequested.off"),
                adminDecides: t("settingsPage.adminDecides"),
              }}
            />
          </Card>
          {/* HomeSend's bar for adding on its own (the owner, 2026-10-26): beside the other "acting" choice. */}
          <Card className="mt-3 p-4">
            <AutoAddPercentPicker
              householdId={householdId}
              percent={autoAddPercent}
              options={AUTO_ADD_PERCENTS}
              manages={manages}
              labels={{
                title: t("settingsPage.ai.autoAdd.title"),
                detail: t("settingsPage.ai.autoAdd.detail"),
                option: Object.fromEntries(AUTO_ADD_PERCENTS.map((percent) => [percent, t(percent === 95 ? "settingsPage.ai.autoAdd.optionDefault" : "settingsPage.ai.autoAdd.option", { percent })])),
                adminDecides: t("settingsPage.adminDecides"),
              }}
            />
          </Card>
          {/* Whether bills and receipts, or health documents, may be added on their own at all (the owner, 2026-10-26): right beside the bar. */}
          {(["money", "health"] as const).map((area) => (
            <Card key={area} id={`direct-add-${area}`} className="mt-3 p-4">
              <DirectAddSwitch
                householdId={householdId}
                area={area}
                on={directAdd[area]}
                manages={manages}
                labels={{
                  title: t(`settingsPage.ai.directAdd.${area}.title`),
                  on: t(`settingsPage.ai.directAdd.${area}.on`),
                  off: t(`settingsPage.ai.directAdd.${area}.off`),
                  files: t("settingsPage.ai.directAdd.files"),
                  adminDecides: t("settingsPage.adminDecides"),
                }}
              />
            </Card>
          ))}
          {/* HomeSend's daily tidy (the owner, 2026-11-03): beside the other HomeSend choices. */}
          <Card id="homesend-tidy" className="mt-3 p-4">
            <HomeSendTidySwitch
              householdId={householdId}
              on={homesendTidy !== false}
              manages={manages}
              labels={{
                title: t("settingsPage.ai.homesendTidy.title"),
                on: t("settingsPage.ai.homesendTidy.on"),
                off: t("settingsPage.ai.homesendTidy.off"),
                detail: t("settingsPage.ai.homesendTidy.detail"),
                adminDecides: t("settingsPage.adminDecides"),
              }}
            />
          </Card>
          {/* What HomeSend has learned (14-066): so the same question is never asked twice. */}
          <Card id="homesend-learned" className="mt-3 p-4">
            <HomeSendLearned
              householdId={householdId}
              rows={learnedRows}
              manages={manages}
              labels={{
                title: t("settingsPage.ai.learned.title"),
                intro: t("settingsPage.ai.learned.intro"),
                empty: t("settingsPage.ai.learned.empty"),
                forget: t("settingsPage.ai.learned.forget"),
                forgetAll: t("settingsPage.ai.learned.forgetAll"),
                forgotten: t("settingsPage.ai.learned.forgotten"),
                adminDecides: t("settingsPage.adminDecides"),
              }}
            />
          </Card>
        </section>


        <section id="provider-key" className="scroll-mt-20">
          <SectionHeader title={t("settingsPage.ai.section.key")} />
          <Card className="space-y-4 p-4">
            <div className="flex items-start gap-3">
              <IconTile icon={Bot} tone="ai" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{keyWords.title}</p>
                <p className="mt-0.5 text-xs text-[var(--wh-foreground-muted)]">{keyWords.detail}</p>
                {credential.configured && credential.updatedAt ? (
                  <p className="mt-1 text-[0.6875rem] text-[var(--wh-foreground-subtle)]">{t("settingsPage.ai.keySet", { date: formatDate(membership.household.timezone, credential.updatedAt, "long") })}</p>
                ) : null}
              </div>
              <Badge tone={keyNote.tone === "attention" ? "attention" : "handled"}>
                {key.source === "household" ? t("settingsPage.badge.yourKey") : key.source === "platform" ? t("settingsPage.badge.included") : t("settingsPage.ai.badge.rulesOnly")}
              </Badge>
            </div>

            {manages ? (
              <>
                <p className="text-xs text-[var(--wh-foreground-muted)]">{t("settingsPage.ai.ownKeyIntro")}</p>
                <AiKeyForm householdId={householdId} save={saveAiKey} remove={removeAiKey} configured={credential.configured} provider={credential.provider} labels={aiKeyFormLabels(t)} returnTo={returnTo} />
                {key.source === "none" ? (
                  <p className="rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] px-3 py-2 text-xs text-[var(--wh-foreground-muted)]">
                    {noKeyBefore}
                    <code className="rounded bg-[var(--wh-surface)] px-1 py-0.5 text-[0.6875rem]">WONDERHOME_AI_KEY</code>
                    {noKeyAfter}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-xs text-[var(--wh-foreground-subtle)]">{t("settingsPage.adminDecides")}</p>
            )}
          </Card>
        </section>

        <section id="voice-key">
          <SectionHeader title={t("settingsPage.ai.voiceKey.title")} />
          <Card className="space-y-4 p-4">
            <div className="flex items-start gap-3">
              <IconTile icon={Mic} tone="ai" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{voiceLine}</p>
                <p className="mt-0.5 text-xs text-[var(--wh-foreground-muted)]">{t("settingsPage.ai.voiceKey.intro")}</p>
              </div>
            </div>
            {manages ? (
              <AiKeyForm
                householdId={householdId}
                save={saveGeminiVoiceKey}
                remove={removeGeminiVoiceKey}
                configured={voiceCredential.configured}
                labels={{ ...aiKeyFormLabels(t), useOwn: t("settingsPage.ai.voiceKey.save"), remove: t("settingsPage.ai.voiceKey.remove") }}
                returnTo={returnTo}
                googleOnly
              />
            ) : (
              <p className="text-xs text-[var(--wh-foreground-subtle)]">{t("settingsPage.adminDecides")}</p>
            )}
          </Card>
        </section>

        <section id="share">
          <SectionHeader title={t("settingsPage.ai.section.share")} />
          <Card className="space-y-4 p-4">
            {/* Read on the server every time. A screen cannot cache its way
                into a more permissive answer (story 15-005). */}
            <div className="flex items-start gap-3">
              <IconTile icon={ShieldCheck} tone="primary" />
              <ul className="min-w-0 flex-1 space-y-1.5">
                {dataUseLines(t, dataUse).map((line) => (
                  <li key={line} className="text-sm text-[var(--wh-foreground-muted)]">{line}</li>
                ))}
              </ul>
            </div>
            {manages ? (
              <DataUseForm action={saveDataUseAction} householdId={householdId} policy={dataUse} labels={dataUseFormLabels(t)} returnTo={returnTo} />
            ) : (
              <p className="text-xs text-[var(--wh-foreground-subtle)]">{t("settingsPage.adminDecides")}</p>
            )}
          </Card>
        </section>

        <QuoteCard>{t("settingsPage.ai.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}
