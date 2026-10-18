import { CalendarHeart, Eye, Link2, MapPin, MessageCircle, NotebookPen, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { atLocal, isDateKey, localMoment } from "@wonderhome/core/calendar/dates";
import { isOccurrenceCancelled } from "@wonderhome/core/calendar/repository";
import { loadEvent, planningGaps, type PlanningGap } from "@wonderhome/core/family/event-detail";
import { INVITE_TEMPLATES, inviteDesign, suggestTemplate, svgDataUri } from "@wonderhome/core/family/invite-templates";
import { listMembers, isHouseholdAdmin } from "@wonderhome/core/identity/households";
import { localTimeValue, schoolDateValue } from "@wonderhome/core/school/times";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { ActionRow } from "@wonderhome/core/ui/action-row";
import { Avatar } from "@wonderhome/core/ui/avatar";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Badge } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";

import {
  answerEventAction,
  createInviteLinkAction,
  removeGuestAction,
  revokeInviteLinkAction,
  setEventCancelledAction,
  setEventInviteesAction,
  setInviteDesignAction,
} from "../../../(auth)/event-actions";
import { setOccurrenceCancelledAction } from "../../../(auth)/calendar-actions";
import { EventActionButton, EventEditForm, EventInviteesForm, EventLinkShare, type EventEditInitial, type EventEditLabels } from "../../../_components/event-controls";
import { InviteDesignForm, type InviteDesignOption, type InvitePreview } from "../../../_components/invite-design-form";
import { invitationWords } from "../../../_lib/invitation-words";
import { eventFormLabels } from "../../../_lib/event-form-labels";
import { formatDate, formatTime, requireSession } from "../../../_lib/session";

export const metadata = { title: "Event" };
export const dynamic = "force-dynamic";

const GAP_ICON: Record<PlanningGap, typeof MapPin> = { where: MapPin, who: Users, notes: NotebookPen, share: Link2, replies: MessageCircle };

/**
 * One family event, opened (rule 21): what it is, what is still to plan and
 * the one thing that settles each, who in the family is asked and their
 * answers, the invite link for people outside WonderHome, and their replies.
 * Every member can read it; changing it follows the event's own rules (its
 * owner, or anyone for an unowned event, or an Admin), checked again on the
 * server.
 */
export default async function EventPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ on?: string }> }) {
  const [{ eventId }, { on }] = await Promise.all([params, searchParams]);
  const session = await requireSession(`/family/events/${eventId}`);
  const { supabase, membership, viewer, secondary } = session;
  const { t } = session.locale;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) notFound();

  // Opened from the calendar: the day it was tapped on, which for a repeating
  // event is the occurrence, and the day to go back to.
  const day = isDateKey(on) ? on : null;
  const [event, members, occurrenceSkipped] = await Promise.all([
    loadEvent(supabase, householdId, eventId).catch(() => null),
    listMembers(supabase, householdId, membership.household.ownerMemberId).catch(() => []),
    day ? isOccurrenceCancelled(supabase, { householdId, eventId, occurrenceDate: day }).catch(() => false) : Promise.resolve(false),
  ]);
  if (!event) notFound();

  const active = members.filter((member) => member.status === "active");
  const nameOf = (id: string | null) => active.find((member) => member.id === id)?.displayName ?? null;
  const photoOf = (id: string | null) => active.find((member) => member.id === id)?.avatarUrl ?? undefined;
  const canEdit = event.ownerMemberId === null || event.ownerMemberId === membership.memberId || isHouseholdAdmin(membership);
  const now = new Date();
  const over = event.endsAt.getTime() < now.getTime();
  const cancelled = event.status === "cancelled";
  const gaps = planningGaps(event, now);
  const mine = event.participants.find((participant) => participant.memberId === membership.memberId);
  const ids = { householdId, eventId: event.id };
  const formWords = eventFormLabels(t);
  const editLabels: EventEditLabels = {
    edit: t("events.edit"),
    title: t("events.editTitle"),
    what: formWords.what,
    kind: formWords.kind,
    kinds: formWords.kinds,
    starts: formWords.starts,
    ends: formWords.ends,
    where: formWords.where,
    wherePlaceholder: formWords.wherePlaceholder,
    notes: t("events.notesLabel"),
    notesPlaceholder: t("events.notesPlaceholder"),
    save: t("events.save"),
    saving: t("events.saving"),
    calendar: formWords.calendar,
    clash: t("calendar.form.clashMove"),
    saveAnyway: t("calendar.form.saveAnyway"),
  };
  const local = (at: Date) => `${schoolDateValue({ dueAt: at, dueTimeKnown: true }, timezone)}T${localTimeValue(at, timezone)}`;
  const firstDay = localMoment(event.startsAt, timezone).dateKey;
  const lastDay = localMoment(new Date(event.endsAt.getTime() - 1), timezone).dateKey;
  const initial: EventEditInitial = {
    title: event.title,
    kind: event.kind,
    startsAt: local(event.startsAt),
    endsAt: local(event.endsAt),
    location: event.location ?? "",
    notes: event.notes ?? "",
    allDay: event.allDay,
    startDate: firstDay,
    endDate: lastDay,
    category: event.category ?? "",
    repeat: event.recurrence?.freq ?? "none",
    repeatUntil: event.recurrence?.until ?? "",
    visibility: event.visibility,
  };
  const when = event.allDay
    ? firstDay === lastDay
      ? `${formatDate(timezone, event.startsAt, "long")} · ${t("calendar.entry.allDay")}`
      : `${formatDate(timezone, event.startsAt, "long")} – ${formatDate(timezone, new Date(event.endsAt.getTime() - 1), "long")}`
    : `${formatDate(timezone, event.startsAt, "long")} · ${formatTime(timezone, event.startsAt)} – ${formatTime(timezone, event.endsAt)}`;
  const isOwner = event.ownerMemberId === membership.memberId;
  const occurrence = day && event.recurrence ? day : null;
  const occurrenceWords = occurrence ? formatDate(timezone, atLocal(occurrence, 12 * 60, timezone), "long") : null;
  const back = day ? { href: `/calendar?view=day&date=${day}`, label: t("calendar.event.back") } : { href: "/family", label: t("events.back") };
  const linkPath = event.inviteToken ? `/e/${event.inviteToken}` : null;
  const option = (key: (typeof INVITE_TEMPLATES)[number], name: string): InviteDesignOption => {
    const { palette, corner } = inviteDesign(key);
    return { key, name, image: svgDataUri(corner), paper: palette.paper, accent: palette.accent };
  };
  const suggested = suggestTemplate(event);
  // The preview's words: the event as a guest would read it, in the viewer's language.
  const prefs = session.locale.preferences;
  const guestWords = invitationWords(t, prefs.language, {
    linkId: "",
    householdId,
    eventId: event.id,
    householdName: membership.household.name,
    timezone,
    language: prefs.language,
    region: prefs.region,
    title: event.title,
    kind: event.kind,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    location: event.location,
    allDay: event.allDay,
    template: suggested,
    message: null,
    cancelled,
    over,
  });
  const invitePreview: InvitePreview = {
    suggested,
    words: { invited: guestWords.invited, title: guestWords.title, day: guestWords.day, time: guestWords.time, place: guestWords.place, hosted: guestWords.hosted },
    kindLines: Object.fromEntries(INVITE_TEMPLATES.map((key) => [key, t(`invite.card.kind.${key}`)])) as InvitePreview["kindLines"],
  };
  const designOptions: InviteDesignOption[] = [
    { ...option(suggested, t("events.invite.auto", { design: t(`invite.template.${suggested}`) })), key: "auto" },
    ...INVITE_TEMPLATES.map((key) => option(key, t(`invite.template.${key}`))),
  ];

  return (
    <AppShell active="family" viewer={viewer} secondary={secondary} pathname="/family" back={back} title={event.title}>
      <div className="space-y-6">
        <header className="wh-rise space-y-1">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{event.title}</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">{t("events.lede")}</p>
          {cancelled ? <Badge tone="attention">{t("events.status.cancelled")}</Badge> : over ? <Badge>{t("events.status.over")}</Badge> : null}
        </header>

        <Card className="space-y-4 p-4">
          <div className="flex items-start gap-3">
            <IconTile icon={CalendarHeart} tone="people" />
            <dl className="grid min-w-0 flex-1 gap-2.5">
              <Fact label={t("events.fact.when")} value={when} />
              <Fact label={t("events.fact.where")} value={event.location} />
              <Fact label={t("events.fact.kind")} value={formWords.kinds[event.kind]} />
              <Fact label={t("calendar.event.category")} value={event.category ? t(`calendar.category.${event.category}`) : null} />
              <Fact label={t("calendar.event.repeats")} value={event.recurrence ? t(`calendar.form.repeat.${event.recurrence.freq}`) : null} />
              <Fact label={t("calendar.event.visibility")} value={event.visibility === "household" ? null : t(`calendar.form.visibility.${event.visibility}`)} />
              <Fact label={t("events.fact.owner")} value={nameOf(event.ownerMemberId)} />
              <Fact label={t("events.fact.notes")} value={event.notes} />
            </dl>
          </div>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              {!cancelled ? <EventEditForm householdId={householdId} eventId={event.id} initial={initial} labels={editLabels} canNarrow={isOwner} /> : null}
              <EventActionButton action={setEventCancelledAction} fields={{ ...ids, cancelled: cancelled ? "false" : "true" }}>
                {cancelled ? t("events.restore") : t("events.cancelEvent")}
              </EventActionButton>
            </div>
          ) : null}
        </Card>

        {occurrence && !cancelled ? (
          <Card className="flex flex-wrap items-center gap-3 p-4">
            <p className="min-w-0 flex-1 text-sm">
              {occurrenceSkipped ? t("calendar.event.skipped", { date: occurrenceWords ?? occurrence }) : t("calendar.event.occurrence", { date: occurrenceWords ?? occurrence })}
            </p>
            {canEdit ? (
              <EventActionButton action={setOccurrenceCancelledAction} fields={{ ...ids, occurrenceDate: occurrence, cancelled: occurrenceSkipped ? "false" : "true" }}>
                {occurrenceSkipped ? t("calendar.event.restore") : t("calendar.event.skip")}
              </EventActionButton>
            ) : null}
          </Card>
        ) : null}

        {mine && !cancelled && !over ? (
          <section className="space-y-2">
            <SectionHeader title={t("events.you.question")} />
            <div className="flex flex-wrap gap-2">
              {(["yes", "maybe", "no"] as const).map((answer) => (
                <EventActionButton key={answer} action={answerEventAction} fields={{ ...ids, response: answer }} tone={mine.response === answer ? "primary" : "quiet"} pressed={mine.response === answer}>
                  {t(`events.answer.${answer}`)}
                </EventActionButton>
              ))}
            </div>
          </section>
        ) : null}

        {!cancelled && !over ? (
          <section>
            <SectionHeader title={t("events.gaps.title")} />
            <Card className="px-3">
              {gaps.length === 0 ? (
                <p className="py-3 text-sm text-[var(--wh-foreground-muted)]">{t("events.gaps.done")}</p>
              ) : (
                <ul className="divide-y divide-[var(--wh-border)]">
                  {gaps.map((gap) => (
                    <ActionRow
                      key={gap}
                      icon={GAP_ICON[gap]}
                      tone={gap === "replies" ? "neutral" : "people"}
                      title={t(`events.gaps.${gap}`)}
                      action={
                        !canEdit ? undefined : gap === "where" || gap === "notes" ? (
                          <EventEditForm householdId={householdId} eventId={event.id} initial={initial} labels={editLabels} trigger={t("events.gaps.add")} canNarrow={isOwner} />
                        ) : gap === "share" ? (
                          <EventActionButton action={createInviteLinkAction} fields={ids} tone="soft">
                            {t("events.link.create")}
                          </EventActionButton>
                        ) : undefined
                      }
                    />
                  ))}
                </ul>
              )}
            </Card>
          </section>
        ) : null}

        <section id="family">
          <SectionHeader title={t("events.family.title")} count={event.participants.length} />
          <Card className="space-y-4 p-4">
            {event.participants.length === 0 ? (
              <p className="text-sm text-[var(--wh-foreground-muted)]">{t("events.family.none")}</p>
            ) : (
              <ul className="divide-y divide-[var(--wh-border)]">
                {event.participants.map((participant) => (
                  <li key={participant.memberId} className="flex items-center gap-3 py-2.5">
                    <Avatar name={nameOf(participant.memberId) ?? "?"} size="sm" imageUrl={photoOf(participant.memberId)} />
                    <span className="min-w-0 flex-1 text-sm font-medium">{nameOf(participant.memberId) ?? "—"}</span>
                    <Badge tone={participant.response === "yes" ? "handled" : participant.response === "no" ? "attention" : "neutral"}>{t(`events.response.${participant.response}`)}</Badge>
                  </li>
                ))}
              </ul>
            )}
            {canEdit && !cancelled && !over ? (
              <EventInviteesForm
                action={setEventInviteesAction}
                householdId={householdId}
                eventId={event.id}
                members={active.map((member) => ({ id: member.id, name: member.displayName }))}
                selected={event.participants.map((participant) => participant.memberId)}
                labels={{ choose: t("events.family.choose"), save: t("events.family.save"), saving: t("events.saving") }}
              />
            ) : null}
          </Card>
        </section>

        {!cancelled && !over ? (
          <section id="link">
            <SectionHeader title={t("events.link.title")} />
            <Card className="space-y-3 p-4">
              <p className="text-xs text-[var(--wh-foreground-muted)]">{t("events.link.lede")}</p>
              {canEdit ? (
                <div className="space-y-2 border-b border-[var(--wh-border)] pb-4">
                  <p className="text-xs text-[var(--wh-foreground-muted)]">{t("events.invite.lede")}</p>
                  <InviteDesignForm
                    action={setInviteDesignAction}
                    householdId={householdId}
                    eventId={event.id}
                    options={designOptions}
                    selected={event.inviteTemplate ?? "auto"}
                    message={event.inviteMessage ?? ""}
                    labels={{ design: t("events.invite.title"), message: t("events.invite.message"), messageHint: t("events.invite.messageHint"), save: t("events.invite.save"), saving: t("events.invite.saving"), saved: t("events.invite.saved"), preview: t("events.invite.previewDesign"), previewTitle: t("events.invite.previewTitle"), previewLede: t("events.invite.previewLede") }}
                    preview={invitePreview}
                  />
                </div>
              ) : null}
              {linkPath ? (
                <>
                  <Link href={linkPath} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--wh-primary)] underline-offset-2 hover:underline">
                    <Eye aria-hidden className="size-4" /> {t("events.invite.preview")}
                  </Link>
                  <EventLinkShare path={linkPath} title={event.title} labels={{ copy: t("events.link.copy"), copied: t("events.link.copied"), share: t("events.link.share"), shareText: t("events.link.shareText", { title: "{title}" }), shareCard: t("events.link.shareCard"), saveCard: t("events.link.saveCard") }} />
                  <div className="flex flex-wrap gap-2">
                    <EventActionButton action={createInviteLinkAction} fields={ids}>{t("events.link.new")}</EventActionButton>
                    <EventActionButton action={revokeInviteLinkAction} fields={ids} className="text-[var(--wh-risk)]">{t("events.link.off")}</EventActionButton>
                  </div>
                  <p className="text-[0.6875rem] text-[var(--wh-foreground-subtle)]">{t("events.link.newHint")}</p>
                </>
              ) : (
                <EventActionButton action={createInviteLinkAction} fields={ids} tone="primary">
                  <Link2 aria-hidden className="size-3.5" /> {t("events.link.create")}
                </EventActionButton>
              )}
            </Card>
          </section>
        ) : null}

        {event.guests.length > 0 || linkPath ? (
          <section>
            <SectionHeader title={t("events.guests.title")} count={event.guests.length} />
            <Card className="px-3">
              {event.guests.length === 0 ? (
                <p className="py-3 text-sm text-[var(--wh-foreground-muted)]">{t("events.guests.none")}</p>
              ) : (
                <ul className="divide-y divide-[var(--wh-border)]">
                  {event.guests.map((guest) => (
                    <li key={guest.id} className="flex items-start gap-3 py-3">
                      <Avatar name={guest.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{guest.name}</p>
                        <p className="text-xs text-[var(--wh-foreground-subtle)]">
                          {t(`events.response.${guest.response}`)} · {t("events.guests.party", { count: guest.partySize })}
                        </p>
                        {guest.note ? <p className="mt-0.5 text-xs text-[var(--wh-foreground-muted)]">“{guest.note}”</p> : null}
                      </div>
                      <EventActionButton action={removeGuestAction} fields={{ ...ids, guestId: guest.id }} label={t("events.guests.remove", { name: guest.name })} className="px-2.5">
                        <Trash2 aria-hidden className="size-3.5" />
                      </EventActionButton>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
        ) : null}

        <QuoteCard>{t("events.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{label}</dt>
      <dd className="text-sm whitespace-pre-line">{value}</dd>
    </div>
  );
}
