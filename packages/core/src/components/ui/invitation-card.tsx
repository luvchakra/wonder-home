import { CalendarDays, Clock, MapPin } from "lucide-react";

import { inviteDesign, svgDataUri, type InviteTemplate } from "../../family/invite-templates";
import { cn } from "../../lib/cn";

/**
 * A decorated invitation (story 26-009): the card a guest opens from an
 * event's link, dressed in the design the household picked — bunting and
 * balloons for a birthday, a marigold toran for a wedding or a puja, lanterns
 * and diyas for a festival.
 *
 * Its drawings and palette come from `family/invite-templates.ts`, the same
 * source the WhatsApp share card is drawn from, so the page matches the
 * picture in the chat. The festive palette is the invitation's own and never
 * styles a control: the reply form below it keeps the product's tokens.
 *
 * Every word a guest needs is in plain type. The handwritten "You're
 * invited!" is the one script line (rule 2) and is decoration — the kind line
 * under it says the same thing in words. Nothing is truncated: a long title
 * or place wraps (rules 11 and 15).
 */
export type InvitationCardWords = {
  invited: string;
  kindLine: string;
  title: string;
  day: string;
  time: string | null;
  place: string | null;
  message: string | null;
  hosted: string;
};

export function InvitationCard({ template, words, className }: { template: InviteTemplate; words: InvitationCardWords; className?: string }) {
  const { palette, band, corner } = inviteDesign(template);
  const cornerSrc = svgDataUri(corner);
  const detail = "flex items-start justify-center gap-2 text-center";

  return (
    <article
      className={cn("relative isolate overflow-hidden rounded-[var(--wh-radius-lg)] shadow-[var(--wh-shadow-float)]", className)}
      style={{ background: palette.paper, color: palette.ink }}
      aria-label={`${words.kindLine}: ${words.title}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- an inline SVG drawing, not a photo to optimise */}
      <img src={svgDataUri(band)} alt="" aria-hidden className="pointer-events-none block w-full select-none" />
      <div aria-hidden className="pointer-events-none absolute inset-2.5 rounded-[calc(var(--wh-radius-lg)-6px)] border-2" style={{ borderColor: palette.accent }} />
      <div aria-hidden className="pointer-events-none absolute inset-4 rounded-[calc(var(--wh-radius-lg)-10px)] border" style={{ borderColor: palette.accent2, opacity: 0.6 }} />
      {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
      <img src={cornerSrc} alt="" aria-hidden className="pointer-events-none absolute bottom-3 left-3 -z-10 w-[24%] max-w-28 opacity-90 select-none" />
      {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
      <img src={cornerSrc} alt="" aria-hidden className="pointer-events-none absolute right-3 bottom-3 -z-10 w-[24%] max-w-28 -scale-x-100 opacity-90 select-none" />

      <div className="relative space-y-4 px-7 pt-2 pb-24 text-center sm:px-10">
        <p aria-hidden className="font-[family-name:var(--font-caveat)] text-[2.5rem] leading-none font-semibold" style={{ color: palette.accent }}>
          {words.invited}
        </p>
        <p className="text-xs font-semibold tracking-[0.18em] uppercase" style={{ color: palette.muted }}>
          {words.kindLine}
        </p>
        <h2 className="text-[1.75rem] leading-tight font-bold tracking-tight text-balance [overflow-wrap:anywhere] sm:text-3xl">{words.title}</h2>
        <div aria-hidden className="mx-auto flex w-40 items-center gap-2">
          <span className="h-px flex-1" style={{ background: palette.accent }} />
          <span className="size-2 rotate-45" style={{ background: palette.accent2 }} />
          <span className="h-px flex-1" style={{ background: palette.accent }} />
        </div>
        <div className="space-y-1.5 text-[0.9375rem]">
          <p className={cn(detail, "font-semibold")}>
            <CalendarDays aria-hidden className="mt-0.5 size-4 shrink-0" style={{ color: palette.accent }} />
            <span>{words.day}</span>
          </p>
          {words.time ? (
            <p className={detail}>
              <Clock aria-hidden className="mt-0.5 size-4 shrink-0" style={{ color: palette.accent }} />
              <span>{words.time}</span>
            </p>
          ) : null}
          {words.place ? (
            <p className={detail}>
              <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" style={{ color: palette.accent }} />
              <span className="[overflow-wrap:anywhere]">{words.place}</span>
            </p>
          ) : null}
        </div>
        {words.message ? (
          <p className="mx-auto max-w-sm rounded-[var(--wh-radius)] px-4 py-3 text-sm whitespace-pre-line" style={{ background: palette.soft }}>
            {words.message}
          </p>
        ) : null}
        <p className="text-sm font-medium" style={{ color: palette.muted }}>
          {words.hosted}
        </p>
      </div>
    </article>
  );
}
