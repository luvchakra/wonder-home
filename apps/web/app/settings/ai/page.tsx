import { Bot, ShieldCheck } from "lucide-react";

import { credentialStatus } from "@wonderhome/core/ai/credentials";
import { describeKeySource, platformKey, resolveModelKey } from "@wonderhome/core/ai/model-key";
import { loadDataUse } from "@wonderhome/core/ai/privacy-repository";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Badge } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";

import { removeAiKey, saveAiKey } from "../../(auth)/ai-key-actions";
import { saveDataUseAction } from "../../(auth)/privacy-actions";
import { AiKeyForm } from "../../_components/ai-key-form";
import { DataUseForm } from "../../_components/data-use-form";
import { formatDate, requireSession } from "../../_lib/session";
import { aiKeyFormLabels, dataUseFormLabels, dataUseLines, keySourceWords } from "../../_lib/settings-labels";

export const metadata = { title: "AI Assistant" };
export const dynamic = "force-dynamic";

/**
 * The assistant's one settings page (Settings consolidation): which key
 * answers for the household, the household's own key, and what the
 * assistant may share with a model provider. Every member can read it;
 * only someone with `household.manage` sees the editors, and the actions
 * check that again on the server. A stored key is never shown back.
 */
export default async function AiAssistantSettingsPage() {
  const session = await requireSession("/settings/ai");
  const { supabase, membership, view, viewer, secondary } = session;
  const householdId = membership.household.id;
  const [credential, dataUse] = await Promise.all([
    credentialStatus(supabase, householdId).catch(() => ({ configured: false, provider: null, updatedAt: null })),
    loadDataUse(supabase, householdId),
  ]);

  // Which key actually answers, decided in one place so the screen can never
  // disagree with the server about it.
  const key = resolveModelKey(credential.configured && credential.provider ? { provider: credential.provider, key: "set" } : null, platformKey());
  const keyNote = describeKeySource(key.source);
  const manages = view.permissions.includes("household.manage");
  const { t } = session.locale;
  const keyWords = keySourceWords(t, key.source);
  // The environment variable's name keeps its own code styling wherever the sentence puts it.
  const [noKeyBefore, noKeyAfter] = t("settingsPage.ai.noPlatformKey", { variable: "{variable}" }).split("{variable}");

  return (
    <AppShell active="more" viewer={viewer} secondary={secondary} pathname="/settings/ai" back={{ href: "/settings", label: t("settingsPage.backToSettings") }} title={t("settingsPage.ai.title")}>
      <div className="space-y-6">
        <header className="wh-rise">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("settingsPage.ai.title")}</h1>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{t("settingsPage.ai.lede", { household: membership.household.name })}</p>
        </header>

        <section>
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
                <AiKeyForm householdId={householdId} save={saveAiKey} remove={removeAiKey} configured={credential.configured} labels={aiKeyFormLabels(t)} />
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

        <section>
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
              <DataUseForm action={saveDataUseAction} householdId={householdId} policy={dataUse} labels={dataUseFormLabels(t)} />
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
