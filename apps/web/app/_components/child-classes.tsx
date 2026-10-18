import { BookOpen, CalendarDays, Dumbbell, ExternalLink, Languages, Music, Palette, Sparkles, Trophy } from "lucide-react";

import { isoDateIn } from "@wonderhome/core/context/format";
import { requestT } from "@wonderhome/core/i18n/request";
import { mapsLink } from "@wonderhome/core/places/provider";
import { orderedNotes, type Activity } from "@wonderhome/core/school/activities";
import { ActionRow } from "@wonderhome/core/ui/action-row";
import { Card } from "@wonderhome/core/ui/card";
import { ExpandableRow } from "@wonderhome/core/ui/expandable-row";
import { IconTile } from "@wonderhome/core/ui/icon-tile";

import { weekdayNames } from "../_lib/child-detail-words";
import { formatDate } from "../_lib/session";
import { ActivityNoteSheet, ActivitySheet, StandDownButton, type ChildDetailWords } from "../school/child-details";

/**
 * A child's classes outside school (story 08-011), as folded rows: the class,
 * a short description, its days and times; opened, every detail — teacher,
 * where (Google Maps), dates, notes, competitions coming up, medals and
 * awards — each added, changed or removed in place. One component for Kids &
 * School and the child's details in Family, so both always show the same
 * classes through the same saves. Rendered outside any form: its sheets
 * carry their own.
 */
export function ChildClasses({
  householdId,
  child,
  activities,
  canChange,
  words,
  timezone,
  language,
}: {
  householdId: string;
  child: { id: string; name: string };
  activities: readonly Activity[];
  canChange: boolean;
  words: ChildDetailWords;
  timezone: string;
  language: string;
}) {
  const t = requestT();
  const dayNames = weekdayNames(language);
  const clock = new Intl.DateTimeFormat(language, { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
  const clockOf = (time: string) => clock.format(Date.UTC(2026, 0, 1, Number(time.slice(0, 2)), Number(time.slice(3, 5))));
  const today = isoDateIn(new Date(), timezone);
  // "Tue, Thu · 5:00 – 6:00 pm": what a folded class says about when it meets.
  const whenOf = (activity: Activity) =>
    [
      activity.days.length === 7 ? t("school.activities.everyDay") : activity.days.length > 0 ? activity.days.map((day) => dayNames[day - 1]).join(", ") : t("school.activities.noSchedule"),
      activity.startsAt ? (activity.endsAt ? `${clockOf(activity.startsAt)} – ${clockOf(activity.endsAt)}` : clockOf(activity.startsAt)) : null,
    ]
      .filter(Boolean)
      .join(" · ");
  const activityIcon = (kind: string) =>
    kind === "music" || kind === "dance" ? Music : kind === "sport" || kind === "martial_arts" ? Dumbbell : kind === "art" ? Palette : kind === "language" ? Languages : kind === "academic" ? BookOpen : Sparkles;
  const kindWord = (kind: string) => words.activity.kinds[kind] ?? kind;
  const dateWord = (dateKey: string) => formatDate(timezone, new Date(`${dateKey}T12:00:00Z`), "long");

  return (
    <Card className="px-3 pb-1">
      <p className="pt-3 pb-1 text-sm font-semibold">{t("school.activities.title")}</p>
      {activities.length === 0 ? (
        <p className="pb-2 text-xs text-[var(--wh-foreground-subtle)]">{t("school.activities.none")}</p>
      ) : (
        <ul className="space-y-1">
          {activities.map((activity) => {
            const notes = orderedNotes(activity.items, today);
            const facts = [
              activity.teacherName ? t("school.activities.teacherLine", { name: [activity.teacherName, activity.teacherContact].filter(Boolean).join(" · ") }) : null,
              activity.startsOn || activity.endsOn
                ? [activity.startsOn ? t("school.activities.fromLine", { date: dateWord(activity.startsOn) }) : null, activity.endsOn ? t("school.activities.untilLine", { date: dateWord(activity.endsOn) }) : null].filter(Boolean).join(" · ")
                : null,
            ].filter(Boolean);
            return (
              <ExpandableRow
                key={activity.id}
                summary={
                  <>
                    <IconTile icon={activityIcon(activity.kind)} tone="school" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{activity.name}</span>
                      <span className="block text-xs text-[var(--wh-foreground-muted)]">{activity.description ?? kindWord(activity.kind)}</span>
                      <span className="block text-xs text-[var(--wh-foreground-subtle)]">{whenOf(activity)}</span>
                    </span>
                  </>
                }
              >
                <div className="space-y-3 px-2 pb-3 text-sm">
                  {facts.map((fact) => (
                    <p key={fact} className="text-[var(--wh-foreground-muted)]">{fact}</p>
                  ))}
                  {activity.place ? (
                    <p className="flex flex-wrap items-center gap-1 text-[var(--wh-foreground-muted)]">
                      {t("school.activities.whereLine", { place: [activity.place.name, activity.place.address].filter(Boolean).join(", ") })}
                      <a href={mapsLink({ name: activity.place.name, formattedAddress: activity.place.address ?? "", placeId: activity.place.placeId })} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-[var(--wh-primary)]">
                        {t("places.openInMaps")} <ExternalLink aria-hidden className="size-3" />
                      </a>
                    </p>
                  ) : null}
                  {activity.notes ? <p className="whitespace-pre-line">{activity.notes}</p> : null}
                  {notes.upcoming.length > 0 ? (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{t("school.activities.upcoming")}</p>
                      <ul className="divide-y divide-[var(--wh-border)]">
                        {notes.upcoming.map((note) => (
                          <ActionRow
                            key={note.id}
                            icon={Trophy}
                            tone="attention"
                            title={note.title}
                            meta={[note.onDate ? dateWord(note.onDate) : null, note.detail].filter(Boolean).join(" · ")}
                            action={canChange ? <StandDownButton kind="note" householdId={householdId} id={note.id} label={t("school.notes.remove", { name: note.title })} /> : undefined}
                          />
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {notes.past.length > 0 ? (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{t("school.activities.record")}</p>
                      <ul className="divide-y divide-[var(--wh-border)]">
                        {notes.past.map((note) => (
                          <ActionRow
                            key={note.id}
                            icon={note.kind === "award" ? Trophy : note.kind === "competition" ? CalendarDays : BookOpen}
                            tone={note.kind === "award" ? "handled" : "school"}
                            title={note.title}
                            meta={[words.note.kinds[note.kind], note.result, note.onDate ? dateWord(note.onDate) : null, note.detail].filter(Boolean).join(" · ")}
                            action={canChange ? <StandDownButton kind="note" householdId={householdId} id={note.id} label={t("school.notes.remove", { name: note.title })} /> : undefined}
                          />
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {canChange ? (
                    <div className="flex flex-wrap items-center gap-1">
                      <ActivityNoteSheet householdId={householdId} activity={{ id: activity.id, name: activity.name }} words={words} />
                      <span className="ml-auto flex items-center gap-1">
                        <ActivitySheet householdId={householdId} child={child} activity={activity} words={words} />
                        <StandDownButton kind="activity" householdId={householdId} id={activity.id} label={t("school.activities.remove", { name: activity.name })} />
                      </span>
                    </div>
                  ) : null}
                </div>
              </ExpandableRow>
            );
          })}
        </ul>
      )}
      {canChange ? <ActivitySheet householdId={householdId} child={child} words={words} /> : null}
    </Card>
  );
}
