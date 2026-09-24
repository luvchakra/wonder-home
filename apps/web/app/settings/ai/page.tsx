import { Bot, ShieldCheck } from "lucide-react";

import { credentialStatus } from "@wonderhome/core/ai/credentials";
import { describeKeySource, platformKey, resolveModelKey } from "@wonderhome/core/ai/model-key";
import { describeDataUse } from "@wonderhome/core/ai/privacy";
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

  return (
    <AppShell active="more" viewer={viewer} secondary={secondary} pathname="/settings/ai" back={{ href: "/settings", label: "Back to settings" }} title="AI Assistant">
      <div className="space-y-6">
        <header className="wh-rise">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">AI Assistant</h1>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">Which model answers for {membership.household.name}, and what it may be told.</p>
        </header>

        <section>
          <SectionHeader title="Provider & key" />
          <Card className="space-y-4 p-4">
            <div className="flex items-start gap-3">
              <IconTile icon={Bot} tone="ai" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{keyNote.title}</p>
                <p className="mt-0.5 text-xs text-[var(--wh-foreground-muted)]">{keyNote.detail}</p>
                {credential.configured && credential.updatedAt ? (
                  <p className="mt-1 text-[0.6875rem] text-[var(--wh-foreground-subtle)]">Set {formatDate(membership.household.timezone, credential.updatedAt, "long")}</p>
                ) : null}
              </div>
              <Badge tone={keyNote.tone === "attention" ? "attention" : "handled"}>
                {key.source === "household" ? "Your key" : key.source === "platform" ? "Included" : "Rules only"}
              </Badge>
            </div>

            {manages ? (
              <>
                <p className="text-xs text-[var(--wh-foreground-muted)]">
                  WonderHome runs the assistant on its own key, so you do not need an account with a model provider. Use your own instead if you would rather the requests were billed to you and covered by your own agreement with them.
                </p>
                <AiKeyForm householdId={householdId} save={saveAiKey} remove={removeAiKey} configured={credential.configured} />
                {key.source === "none" ? (
                  <p className="rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] px-3 py-2 text-xs text-[var(--wh-foreground-muted)]">
                    This deployment has no key of its own either. An operator sets one with the
                    <code className="mx-1 rounded bg-[var(--wh-surface)] px-1 py-0.5 text-[0.6875rem]">WONDERHOME_AI_KEY</code>
                    environment variable — there is no platform administration screen for it.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-xs text-[var(--wh-foreground-subtle)]">An Admin decides this for the household.</p>
            )}
          </Card>
        </section>

        <section>
          <SectionHeader title="What the assistant may share" />
          <Card className="space-y-4 p-4">
            {/* Read on the server every time. A screen cannot cache its way
                into a more permissive answer (story 15-005). */}
            <div className="flex items-start gap-3">
              <IconTile icon={ShieldCheck} tone="primary" />
              <ul className="min-w-0 flex-1 space-y-1.5">
                {describeDataUse(dataUse).map((line) => (
                  <li key={line} className="text-sm text-[var(--wh-foreground-muted)]">{line}</li>
                ))}
              </ul>
            </div>
            {manages ? (
              <DataUseForm action={saveDataUseAction} householdId={householdId} policy={dataUse} />
            ) : (
              <p className="text-xs text-[var(--wh-foreground-subtle)]">An Admin decides this for the household.</p>
            )}
          </Card>
        </section>

        <QuoteCard>Smart help, on your terms.</QuoteCard>
      </div>
    </AppShell>
  );
}
