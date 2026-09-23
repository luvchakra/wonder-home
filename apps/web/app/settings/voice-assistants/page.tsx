import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Badge } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { EmptyState } from "@wonderhome/core/ui/states";
import { voiceOAuthClients } from "@wonderhome/core/voicelink/oauth";
import { listVoiceLinks, type VoiceLink } from "@wonderhome/core/voicelink/repository";
import { SCOPE_LABELS } from "@wonderhome/core/voicelink/scopes";
import { Speaker, Unlink } from "lucide-react";

import { revokeVoiceLinkAction } from "../../(auth)/voice-link-actions";
import { formatDate, requireSession } from "../../_lib/session";

export const metadata = { title: "Voice assistants" };
export const dynamic = "force-dynamic";

const PROVIDER_NAMES: Record<VoiceLink["provider"], string> = { amazon_alexa: "Alexa", gemini: "Gemini Voice" };

/**
 * Voice assistants linked to this home (voice phase 2): who each one speaks
 * for, what it may do, and a way to unlink it that works at once — its
 * tokens stop, and nothing in the home is deleted. A member sees their own
 * links; an admin sees every link in the household and can unlink any of
 * them. Linking itself starts in the assistant's own app, never here, so the
 * page says so rather than offering a button with nothing behind it.
 */
export default async function VoiceAssistantsPage() {
  const session = await requireSession("/settings/voice-assistants");
  const { supabase, membership, viewer, secondary } = session;
  const household = membership.household;
  const [links, members] = await Promise.all([
    listVoiceLinks(supabase, household.id).catch(() => null),
    supabase.from("household_members").select("id, display_name").eq("household_id", household.id),
  ]);
  const names = new Map(((members.data as { id: string; display_name: string }[] | null) ?? []).map((row) => [row.id, row.display_name]));
  const configured = voiceOAuthClients().map((client) => PROVIDER_NAMES[client.provider]);
  const active = (links ?? []).filter((link) => link.status === "active");
  const past = (links ?? []).filter((link) => link.status === "revoked");

  return (
    <AppShell active="more" viewer={viewer} secondary={secondary} pathname="/settings/voice-assistants" back={{ href: "/settings", label: "Back to settings" }} title="Voice assistants">
      <div className="space-y-6">
        <header className="wh-rise">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">Voice assistants</h1>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">
            Speakers that talk to WonderHome for someone in {household.name} — and exactly what each may do.
          </p>
        </header>

        <Card className="flex items-start gap-3">
          <IconTile icon={Speaker} tone="ai" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">Linking one</p>
            <p className="mt-0.5 text-[var(--wh-foreground-muted)]">
              {configured.length > 0
                ? `Open the ${configured.join(" or ")} app, find WonderHome, and sign in when it asks. You choose what it may do before anything is linked.`
                : "Voice assistants aren't set up for this WonderHome yet. Once they are, you'll link one from the assistant's own app."}
            </p>
          </div>
        </Card>

        {links === null ? (
          <Card><p className="text-sm text-[var(--wh-risk)]">The linked assistants couldn&apos;t be read just now. Nothing was changed — try again in a moment.</p></Card>
        ) : active.length === 0 ? (
          <EmptyState icon={Speaker} tone="ai" title="Nothing linked" description="No voice assistant speaks for anyone here yet." />
        ) : (
          <ul className="space-y-3">
            {active.map((link) => (
              <li key={link.id}>
                <Card className="flex items-start gap-3">
                  <IconTile icon={Speaker} tone="ai" />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-semibold">{PROVIDER_NAMES[link.provider]} · {names.get(link.memberId) ?? "A member"}</p>
                    <p className="mt-0.5 text-[var(--wh-foreground-muted)]">
                      Linked {formatDate(household.timezone, link.linkedAt)}
                      {link.lastUsedAt ? ` · last used ${formatDate(household.timezone, link.lastUsedAt)}` : " · not used yet"}
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {link.scopes.map((scope) => (
                        <li key={scope}><Badge tone="neutral">{SCOPE_LABELS[scope]}</Badge></li>
                      ))}
                    </ul>
                  </div>
                  <form action={revokeVoiceLinkAction}>
                    <input type="hidden" name="identityId" value={link.id} />
                    <button
                      type="submit"
                      aria-label={`Unlink ${PROVIDER_NAMES[link.provider]} for ${names.get(link.memberId) ?? "this member"}`}
                      className="grid size-11 place-items-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)] hover:text-[var(--wh-risk)]"
                    >
                      <Unlink className="size-5" aria-hidden />
                    </button>
                  </form>
                </Card>
              </li>
            ))}
          </ul>
        )}

        {past.length > 0 ? (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-[var(--wh-foreground-muted)]">Unlinked</h2>
            <ul className="space-y-2 text-sm text-[var(--wh-foreground-muted)]">
              {past.map((link) => (
                <li key={link.id}>
                  {PROVIDER_NAMES[link.provider]} · {names.get(link.memberId) ?? "A member"} — unlinked {link.revokedAt ? formatDate(household.timezone, link.revokedAt) : ""}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <QuoteCard>Your home, on your terms.</QuoteCard>
      </div>
    </AppShell>
  );
}
