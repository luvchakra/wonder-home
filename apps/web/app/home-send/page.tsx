import { Send } from "lucide-react";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@wonderhome/core/db/admin";
import { getHomeSendAddress, platformHomeSendEmailDomain } from "@wonderhome/core/homesend/addresses";
import { listHomeSendChanges } from "@wonderhome/core/homesend/changes";
import { ingestFile, ingestText } from "@wonderhome/core/homesend/ingest";
import { listHomeSendItems } from "@wonderhome/core/homesend/repository";
import { consumeShareHandoff } from "@wonderhome/core/homesend/share-handoff";
import { isHouseholdAdmin, listMembers } from "@wonderhome/core/identity/households";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Alert } from "@wonderhome/core/ui/alert";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { EmptyState } from "@wonderhome/core/ui/states";

import { HomeSendChannels } from "../_components/home-send-channels";
import { HomeSendInbox } from "../_components/home-send-inbox";
import { requireSession } from "../_lib/session";

export const metadata = { title: "HomeSend" };
export const dynamic = "force-dynamic";

const SHARE_ERROR_MESSAGES: Record<string, string> = {
  size: "That shared file is too large — please use one under 4MB.",
  upload: "That share couldn't be saved — please try sending it in again.",
  rate_limited: "Too many shares from this connection recently — please wait a few minutes and try again.",
};

/**
 * Resumes a share staged before sign-in (Phase 4's Web Share Target
 * handoff) — the same classify-then-save step a signed-in upload/paste
 * already runs, just reached from `/sign-in?next=/home-send?handoff=...`
 * instead of the confirm form's own submit. A missing or expired token is
 * silently nothing to resume, same as `consumeShareHandoff` treats both.
 */
async function resumeShareHandoff(
  supabase: SupabaseClient,
  householdId: string,
  memberId: string,
  token: string,
): Promise<void> {
  const content = await consumeShareHandoff(createAdminClient(), token);
  if (!content) return;

  const actor = { householdId, memberId };
  try {
    if (content.kind === "file") {
      await ingestFile(supabase, actor, { bytes: new Uint8Array(content.fileBytes), claimedType: content.fileContentType });
    } else {
      await ingestText(supabase, actor, { text: content.rawText });
    }
  } catch {
    // A share that cannot be taken in now is not worth failing the page
    // over; the inbox simply does not show it.
  }
}

/**
 * HomeSend's own screen: the "Inputs" end of the pipeline architecture/
 * README describes, on its own page rather than only the composer's
 * paperclip. Drag a photo or file on, paste a forwarded message, and
 * HomeBrain reads it — the review step is the same confirm-before-routing
 * form the paperclip already uses (`HomeSendConfirmStep`), never a second
 * write path. Adding this screen is a deliberate exception to "one door,
 * not two" (CLAUDE.md rule 13): HomeSend is one pipeline, and this is a
 * second *surface* for the same one door, not a competing "Ask AI" shortcut
 * bolted onto an unrelated screen — the paperclip in HomeTalk stays exactly
 * as it was.
 */
export default async function HomeSendPage({
  searchParams,
}: {
  searchParams: Promise<{ handoff?: string; shareError?: string }>;
}) {
  const [{ handoff, shareError }, session] = await Promise.all([searchParams, requireSession("/home-send")]);
  const { supabase, membership, view, viewer, secondary } = session;
  const householdId = membership.household.id;

  // A shared photo/text staged before sign-in — resume it once, then land
  // on the clean URL so a reload never tries to consume the same (already
  // deleted) token twice.
  if (handoff) {
    await resumeShareHandoff(supabase, householdId, membership.memberId, handoff);
    redirect("/home-send");
  }

  const shell = {
    active: "more" as const,
    viewer,
    secondary,
    pathname: "/home-send",
    back: { href: "/more", label: "Back" },
    title: "HomeSend",
  };

  if (view.tone === "child") {
    return (
      <AppShell {...shell}>
        <EmptyState icon={Send} tone="ai" title="Not available to you" description="HomeSend is for the adults in the household." />
      </AppShell>
    );
  }

  const [items, members, changes, address] = await Promise.all([
    listHomeSendItems(supabase, householdId).catch(() => []),
    listMembers(supabase, householdId, membership.household.ownerMemberId).catch(() => []),
    listHomeSendChanges(supabase, householdId).catch(() => []),
    getHomeSendAddress(supabase, householdId).catch(() => null),
  ]);

  const kids = members.filter((member) => member.memberType === "child").map((kid) => ({ id: kid.id, displayName: kid.displayName }));
  // Pending intake survives closing the page (Wave 3 §14): whatever is
  // waiting on a person, and whatever failed safely, is read back from the
  // table every time — never held only in the page that sent it.
  const pending = items.filter((item) => item.status === "received" || item.status === "classified");
  const failed = items.filter((item) => item.status === "failed");
  const history = items.filter((item) => item.status === "routed" || item.status === "dismissed" || item.status === "undone").slice(0, 15);

  return (
    <AppShell {...shell}>
      <div className="space-y-5">
        <header className="wh-rise hidden lg:block">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">HomeSend</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">A photo, a PDF, a voice note, a link or a forwarded message — drop it here and HomeBrain reads it.</p>
        </header>

        {shareError && SHARE_ERROR_MESSAGES[shareError] ? <Alert>{SHARE_ERROR_MESSAGES[shareError]}</Alert> : null}

        <HomeSendInbox householdId={householdId} kids={kids} pending={pending} failed={failed} history={history} changes={changes} />

        <HomeSendChannels
          householdId={householdId}
          isAdmin={isHouseholdAdmin(membership)}
          emailConfigured={platformHomeSendEmailDomain() !== null}
          address={address}
        />

        <QuoteCard>Send it in. WonderHome takes it from here.</QuoteCard>
      </div>
    </AppShell>
  );
}
