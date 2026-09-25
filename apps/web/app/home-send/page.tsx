import { Send } from "lucide-react";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { consumableNames, purchaseLabels } from "@wonderhome/core/commerce/repository";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { getHomeSendAddress, platformHomeSendEmailDomain } from "@wonderhome/core/homesend/addresses";
import { listHomeSendChanges } from "@wonderhome/core/homesend/changes";
import { inboxSegments, inChannel, readInboxChannel } from "@wonderhome/core/homesend/channels";
import { ingestFile, ingestText } from "@wonderhome/core/homesend/ingest";
import { listHomeSendItems } from "@wonderhome/core/homesend/repository";
import { consumeShareHandoff } from "@wonderhome/core/homesend/share-handoff";
import { isHouseholdAdmin, listMembers } from "@wonderhome/core/identity/households";
import { whatsappConfigFromEnv } from "@wonderhome/core/notifications/whatsapp";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Alert } from "@wonderhome/core/ui/alert";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SegmentedControl } from "@wonderhome/core/ui/segmented-control";
import { EmptyState } from "@wonderhome/core/ui/states";
import { formatWhatsAppNumber, whatsappBusinessNumber } from "@wonderhome/core/whatsapp/linking";
import { listWhatsAppLinks } from "@wonderhome/core/whatsapp/repository";

import { HomeSendChannels } from "../_components/home-send-channels";
import { prepareReview } from "../(auth)/home-send-review";
import { HomeSendInbox, type PreparedReview } from "../_components/home-send-inbox";
import { homesendPageLabels } from "../_lib/homesend-labels";
import { requireSession } from "../_lib/session";

export const metadata = { title: "HomeSend" };
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
  searchParams: Promise<{ handoff?: string; shareError?: string; channel?: string }>;
}) {
  const [{ handoff, shareError, channel: channelParam }, session] = await Promise.all([searchParams, requireSession("/home-send")]);
  const { supabase, membership, view, viewer, secondary, locale } = session;
  const { t } = locale;
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

  // WhatsApp is a channel only once the deployment has a business number
  // to show; before that no card, tab or link offers it (story 14-016).
  const whatsappNumber = whatsappConfigFromEnv() ? whatsappBusinessNumber() : null;
  const emailConfigured = platformHomeSendEmailDomain() !== null;
  const [allItems, members, changes, address, whatsappLinks] = await Promise.all([
    listHomeSendItems(supabase, householdId).catch(() => []),
    listMembers(supabase, householdId, membership.household.ownerMemberId).catch(() => []),
    listHomeSendChanges(supabase, householdId).catch(() => []),
    getHomeSendAddress(supabase, householdId).catch(() => null),
    whatsappNumber ? listWhatsAppLinks(supabase, householdId).catch(() => []) : Promise.resolve([]),
  ]);

  // "All | WhatsApp | Email | Uploads": the tabs filter what is listed, never
  // what can be sent — the drop zone above them always takes anything.
  const segments = inboxSegments(
    allItems.map((item) => ({ source: item.source, waiting: item.status === "received" || item.status === "classified" })),
    { whatsapp: whatsappNumber !== null, email: emailConfigured },
  ).map((segment) => ({ ...segment, label: t(`homesend.channel.${segment.key}`) }));
  // A tab that isn't offered (a hand-typed ?channel=email with no email) reads as All.
  const requested = readInboxChannel(channelParam);
  const channel = segments.some((segment) => segment.key === requested) ? requested : "all";
  const items = inChannel(allItems, channel);
  const senders = Object.fromEntries(members.map((member) => [member.id, member.displayName]));
  const myWhatsApp = whatsappLinks.find((link) => link.memberId === membership.memberId) ?? null;

  const kids = members.filter((member) => member.memberType === "child").map((kid) => ({ id: kid.id, displayName: kid.displayName }));
  // Pending intake survives closing the page (Wave 3 §14): whatever is
  // waiting on a person, and whatever failed safely, is read back from the
  // table every time — never held only in the page that sent it.
  const pending = items.filter((item) => item.status === "received" || item.status === "classified");
  const failed = items.filter((item) => item.status === "failed");

  // Who each waiting item is for, and whether it is already on record —
  // worked out now, on this member's own client, so opening one shows the
  // same "I found Asmi's existing Science Exhibition" a fresh send would.
  const reviews: Record<string, PreparedReview> = {};
  await Promise.all(
    pending.slice(0, 10).map(async (item) => {
      const review = await prepareReview(supabase, membership, item).catch(() => null);
      if (review) reviews[item.id] = { subject: review.subject, reconciliation: review.reconciliation, confirmation: review.confirmation, plan: review.plan ?? null };
    }),
  );
  const history = items.filter((item) => item.status === "routed" || item.status === "dismissed" || item.status === "undone").slice(0, 15);
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

        <HomeSendInbox
          householdId={householdId}
          kids={kids}
          canAddChild={isHouseholdAdmin(membership)}
          pending={pending}
          failed={failed}
          history={history}
          changes={changes}
          reviews={reviews}
          groceryNames={groceryNames}
          purchaseNames={purchaseNames}
          senders={senders}
          filterLabel={channel === "all" ? null : (segments.find((segment) => segment.key === channel)?.label ?? null)}
          filter={segments.length > 0 ? <SegmentedControl segments={segments} active={channel} label={t("homesend.filter.label")} /> : null}
          labels={labels}
        />

        <HomeSendChannels
          householdId={householdId}
          isAdmin={isHouseholdAdmin(membership)}
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
