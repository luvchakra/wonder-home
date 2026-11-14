import { Send } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HouseholdMembership } from "@wonderhome/core/identity/schemas";

import { consumableNames, purchaseLabels } from "@wonderhome/core/commerce/repository";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { getHomeSendAddress, platformHomeSendEmailDomain } from "@wonderhome/core/homesend/addresses";
import { listHomeSendChanges } from "@wonderhome/core/homesend/changes";
import { ingestFile, ingestText } from "@wonderhome/core/homesend/ingest";
import { countArchivedHomeSendItems, listArchiveReasons, listArchivedHomeSendItems, listHomeSendItems } from "@wonderhome/core/homesend/repository";
import { loadNeedsYou } from "@wonderhome/core/hometalk/needs-you-repository";
import { recoverWhen } from "@wonderhome/core/homesend/when";
import { consumeShareHandoff } from "@wonderhome/core/homesend/share-handoff";
import { isHouseholdAdmin, listMembers } from "@wonderhome/core/identity/households";
import { childrenWithClasses, listActivities } from "@wonderhome/core/school/activities";
import { whatsappConfigFromEnv } from "@wonderhome/core/notifications/whatsapp";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Alert } from "@wonderhome/core/ui/alert";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { EmptyState } from "@wonderhome/core/ui/states";
import { formatWhatsAppNumber, whatsappBusinessNumber } from "@wonderhome/core/whatsapp/linking";
import { listWhatsAppLinks } from "@wonderhome/core/whatsapp/repository";

import { HomeSendChannels, HomeSendWelcome } from "../_components/home-send-channels";
import { HomeSendInbox } from "../_components/home-send-inbox";
import { HomeSendArchived } from "../_components/home-send-archived";
import { homesendPageLabels } from "../_lib/homesend-labels";
import { requireSession } from "../_lib/session";
import { addIfAllowed } from "../(auth)/home-send-auto";

export const metadata = { title: "HomeSend" };

/** "Added recently" looks back this many days (the owner, 2026-11-03). */
const RECENT_DAYS = 7;
/** Set-aside items shown on the page; the rest are behind "See everything set aside". */
const SET_ASIDE_SHOWN = 10;

export const dynamic = "force-dynamic";

/** Why a share from the phone's share sheet did not arrive, by the `?shareError=` the share route sets. */
const SHARE_ERROR_KEYS = {
  size: "homesend.shareError.size",
  upload: "homesend.shareError.upload",
  rate_limited: "homesend.shareError.rateLimited",
} as const;

const isShareError = (value: string | undefined): value is keyof typeof SHARE_ERROR_KEYS => value !== undefined && Object.hasOwn(SHARE_ERROR_KEYS, value);

/**
 * Resumes a share staged before sign-in (Phase 4's Web Share Target
 * handoff) — the same classify-then-save step a signed-in upload/paste
 * already runs, just reached from `/sign-in?next=/home-send?handoff=...`
 * instead of the confirm form's own submit. A missing or expired token is
 * silently nothing to resume, same as `consumeShareHandoff` treats both.
 */
async function resumeShareHandoff(
  supabase: SupabaseClient,
  membership: HouseholdMembership,
  token: string,
): Promise<string | null> {
  const content = await consumeShareHandoff(createAdminClient(), token);
  if (!content) return null;

  const actor = { householdId: membership.household.id, memberId: membership.memberId };
  try {
    const outcome =
      content.kind === "file"
        ? await ingestFile(supabase, actor, { bytes: new Uint8Array(content.fileBytes), claimedType: content.fileContentType })
        : await ingestText(supabase, actor, { text: content.rawText });
    // Put in place on arrival, as a signed-in share is (14-066).
    if (!outcome.duplicate) await addIfAllowed(supabase, membership, outcome.itemId, { createdByMemberId: membership.memberId }).catch(() => null);
    return outcome.itemId;
  } catch {
    // A share that cannot be taken in now is not worth failing the page
    // over; the inbox simply does not show it.
    return null;
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
  searchParams: Promise<{ handoff?: string; shareError?: string; view?: string; shared?: string }>;
}) {
  const [{ handoff, shareError, view: viewParam, shared: sharedParam }, session] = await Promise.all([searchParams, requireSession("/home-send")]);
  const { supabase, membership, view, viewer, secondary, locale } = session;
  const { t } = locale;
  const householdId = membership.household.id;

  // A shared photo/text staged before sign-in — resume it once, then land
  // on the clean URL so a reload never tries to consume the same (already
  // deleted) token twice.
  if (handoff) {
    const resumed = await resumeShareHandoff(supabase, membership, handoff);
    redirect(resumed ? `/home-send?shared=${encodeURIComponent(resumed)}` : "/home-send");
  }

  const shell = {
    active: "more" as const,
    viewer,
    secondary,
    pathname: "/home-send",
    back: { href: "/more", label: t("common.back") },
    title: t("nav.item.homesend"),
  };

  if (view.tone === "child") {
    return (
      <AppShell {...shell}>
        <EmptyState icon={Send} tone="ai" title={t("homesend.childView.title")} description={t("homesend.childView.description")} />
      </AppShell>
    );
  }

  // Archived (the 30-day archive): kept, restorable, nothing added.
  if (viewParam === "archived") {
    const archived = await listArchivedHomeSendItems(supabase, householdId, 100);
    const reasons = await listArchiveReasons(supabase, householdId, archived.map((item) => item.id));
    const labels = homesendPageLabels(t, locale.preferences.language);
    return (
      <AppShell {...shell} back={{ href: "/home-send", label: labels.inbox.archived.back }} title={labels.inbox.archived.title}>
        <HomeSendArchived householdId={householdId} isAdmin={isHouseholdAdmin(membership)} viewerMemberId={membership.memberId} viewerType={membership.memberType} items={archived} reasons={Object.fromEntries(reasons)} labels={labels} />
      </AppShell>
    );
  }

  // WhatsApp is a channel only once the deployment has a business number
  // to show; before that no card, tab or link offers it (story 14-016).
  const whatsappNumber = whatsappConfigFromEnv() ? whatsappBusinessNumber() : null;
  const emailConfigured = platformHomeSendEmailDomain() !== null;
  const isAdmin = isHouseholdAdmin(membership);
  const [allItems, members, changes, address, whatsappLinks, activities, archivedCount, setAside, needsYou] = await Promise.all([
    listHomeSendItems(supabase, householdId).catch(() => []),
    listMembers(supabase, householdId, membership.household.ownerMemberId).catch(() => []),
    listHomeSendChanges(supabase, householdId).catch(() => []),
    getHomeSendAddress(supabase, householdId).catch(() => null),
    whatsappNumber ? listWhatsAppLinks(supabase, householdId).catch(() => []) : Promise.resolve([]),
    // Each child's own classes, so a class outside school is picked, not typed (rule 20).
    listActivities(supabase, householdId).catch(() => []),
    countArchivedHomeSendItems(supabase, householdId),
    // "Set aside": the most recent few, each with its reason and Restore; the rest one tap away.
    listArchivedHomeSendItems(supabase, householdId, SET_ASIDE_SHOWN).catch(() => []),
    // How many things need a word from this person, for the opening sentence.
    loadNeedsYou(supabase, householdId).catch(() => ({ shown: [], total: 0 })),
  ]);
  const setAsideReasons = await listArchiveReasons(supabase, householdId, setAside.map((item) => item.id)).catch(() => new Map());

  // One list, no channel tabs (the owner, 2026-11-03): where something came from is in its detail.
  // A waiting item's day and time, from its own words, whatever kind it was
  // read as: items read before dates were kept for every kind open with them too.
  const timezone = membership.household.timezone;
  const items = allItems.map((item) =>
    item.extracted && (item.status === "received" || item.status === "classified") ? { ...item, extracted: recoverWhen(item.extracted, { timezone, now: new Date(item.createdAt) }) } : item,
  );
  const myWhatsApp = whatsappLinks.find((link) => link.memberId === membership.memberId) ?? null;

  const kids = childrenWithClasses(members, activities);
  // "Nothing waits" (2026-11-14): nothing is reviewed here any more. What needs a person is one
  // question in the "Needs you" list at the top of HomeTalk, with a default after 24 hours; this
  // page is the send box, what was added recently (with Undo) and what was set aside (with Restore).
  const now = new Date();
  // "Added recently": what was added (and anything undone) in the last week, by its newest change.
  const since = now.getTime() - RECENT_DAYS * 86_400_000;
  const lastChange = new Map<string, number>();
  for (const change of changes) lastChange.set(change.intakeId, Math.max(lastChange.get(change.intakeId) ?? 0, Date.parse(change.createdAt) || 0));
  const history = items
    .filter((item) => (item.status === "routed" || item.status === "undone") && (lastChange.get(item.id) ?? Date.parse(item.createdAt)) >= since)
    .slice(0, 30);
  // "Got it" after a share from the phone (14-066): read from the item itself, never from the URL's say-so.
  const sharedItem = sharedParam ? items.find((item) => item.id === sharedParam) : undefined;
  const sharedTitle = sharedItem?.extracted?.title?.trim() || t("homesend.shared.something");
  const sharedChange = sharedItem?.status === "routed" ? changes.find((change) => change.intakeId === sharedItem.id && !change.undoneAt) : undefined;
  const shared = sharedChange
    ? { notice: t(sharedChange.changeType === "updated" ? "homesend.shared.moved" : "homesend.shared.added", { title: sharedTitle }), changeId: sharedChange.id, title: sharedTitle, itemId: sharedChange.intakeId, whole: sharedChange.domain === "purchase" }
    : null;
  const sharedNote = sharedItem && !shared
    ? sharedItem.status === "failed"
      ? t("homesend.shared.failed")
      : sharedItem.status === "classified"
        ? t("homesend.shared.waiting", { title: sharedTitle })
        : sharedItem.status === "received"
          ? t("homesend.shared.reading")
          : null
    : null;
  // The opening sentence (rule 7): how many things need a word, and where they are.
  const lead = needsYou.total > 0 ? t("homesend.lead.needsYou", { count: needsYou.total }) : t("homesend.lead.allClear");
  // "Also added to Groceries: White T-shirt" — each need by name, so two of
  // them from one notice can be told apart (and undone) separately.
  const groceryIds = changes.filter((change) => change.domain === "grocery_item").map((change) => change.entityId);
  const groceryNames = await consumableNames(supabase, householdId, groceryIds).catch(() => ({}));
  // A receipt's lines, each by what was bought (09-009).
  const purchaseIds = changes.filter((change) => change.domain === "purchase").map((change) => change.entityId);
  const purchaseNames = await purchaseLabels(supabase, householdId, purchaseIds).catch(() => ({}));

  const labels = homesendPageLabels(t, locale.preferences.language);

  return (
    <AppShell {...shell}>
      <div className="space-y-5">
        <header className="wh-rise hidden lg:block">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("nav.item.homesend")}</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">{t("homesend.lede")}</p>
        </header>

        {isShareError(shareError) ? <Alert>{t(SHARE_ERROR_KEYS[shareError])}</Alert> : null}
        {sharedNote ? <Alert tone="info">{sharedNote}</Alert> : null}

        <HomeSendInbox
          householdId={householdId}
          kids={kids}
          canAddChild={isAdmin}
          lead={lead}
          isAdmin={isAdmin}
          viewerMemberId={membership.memberId}
          viewerType={membership.memberType}
          clearCounts={null}
          pending={[]}
          pendingTotal={0}
          moreHref={null}
          failed={[]}
          failedInfo={{}}
          archived={null}
          history={history}
          changes={changes}
          reviews={{}}
          groceryNames={groceryNames}
          purchaseNames={purchaseNames}
          labels={labels}
          shared={shared}
          welcome={
            allItems.length === 0 && archivedCount === 0 ? (
              <HomeSendWelcome whatsapp={whatsappNumber && membership.memberType === "adult" ? { connected: myWhatsApp !== null } : null} labels={labels.channels} />
            ) : null
          }
        />

        {/* Always mounted, so Restore's own confirmation survives the list emptying; headed only when something is set aside. */}
        <section className="space-y-2" aria-labelledby={setAside.length > 0 ? "home-send-set-aside" : undefined}>
          {setAside.length > 0 ? (
            <>
              <SectionHeader title={t("homesend.setAside.title")} count={archivedCount} />
              <p id="home-send-set-aside" className="text-sm text-[var(--wh-foreground-muted)]">{t("homesend.setAside.lede")}</p>
            </>
          ) : null}
          <HomeSendArchived householdId={householdId} isAdmin={isAdmin} viewerMemberId={membership.memberId} viewerType={membership.memberType} items={setAside} reasons={Object.fromEntries(setAsideReasons)} labels={labels} compact />
          {archivedCount > setAside.length ? (
            <Link href="/home-send?view=archived" className="block text-center text-sm text-[var(--wh-primary)]">
              {t("homesend.setAside.all", { count: archivedCount })}
            </Link>
          ) : null}
        </section>

        <HomeSendChannels
          householdId={householdId}
          isAdmin={isAdmin}
          emailConfigured={emailConfigured}
          address={address}
          whatsapp={
            whatsappNumber && membership.memberType === "adult"
              ? { number: formatWhatsAppNumber(whatsappNumber), connected: myWhatsApp !== null }
              : null
          }
          labels={labels.channels}
        />

        <QuoteCard>{t("homesend.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}
