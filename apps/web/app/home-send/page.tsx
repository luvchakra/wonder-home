import { Send } from "lucide-react";

import { listHomeSendChanges } from "@wonderhome/core/homesend/changes";
import { listHomeSendItems } from "@wonderhome/core/homesend/repository";
import { listMembers } from "@wonderhome/core/identity/households";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { EmptyState } from "@wonderhome/core/ui/states";

import { HomeSendInbox } from "../_components/home-send-inbox";
import { requireSession } from "../_lib/session";

export const metadata = { title: "HomeSend" };
export const dynamic = "force-dynamic";

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
export default async function HomeSendPage() {
  const session = await requireSession("/home-send");
  const { supabase, membership, view, viewer, secondary } = session;
  const householdId = membership.household.id;
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

  const [items, members, changes] = await Promise.all([
    listHomeSendItems(supabase, householdId).catch(() => []),
    listMembers(supabase, householdId, membership.household.ownerMemberId).catch(() => []),
    listHomeSendChanges(supabase, householdId).catch(() => []),
  ]);

  const kids = members.filter((member) => member.memberType === "child").map((kid) => ({ id: kid.id, displayName: kid.displayName }));
  const pending = items.filter((item) => item.status === "received" || item.status === "classified");
  const history = items.filter((item) => item.status === "routed" || item.status === "dismissed" || item.status === "undone").slice(0, 15);

  return (
    <AppShell {...shell}>
      <div className="space-y-5">
        <header className="wh-rise hidden lg:block">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">HomeSend</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">A photo, a file, or a forwarded message — drop it here and HomeBrain reads it.</p>
        </header>

        <HomeSendInbox householdId={householdId} kids={kids} pending={pending} history={history} changes={changes} />

        <QuoteCard>Send it in. WonderHome takes it from here.</QuoteCard>
      </div>
    </AppShell>
  );
}
