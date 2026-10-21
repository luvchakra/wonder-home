import { ChevronRight, Clapperboard, CloudRain, CloudSun, Sun, Tv } from "lucide-react";
import Link from "next/link";

import { pickFew, screenLists, type ScreenPick } from "@wonderhome/core/home/screen-picks";
import { todayWeather, type TodayWeather } from "@wonderhome/core/home/today-weather";
import { weatherProviderFromEnv } from "@wonderhome/core/home/open-meteo";
import { householdWeather } from "@wonderhome/core/home/weather-service";

import type { Session } from "../_lib/session";
import { formatTime } from "../_lib/session";

/**
 * The date card at the top of Home (the owner, 2026-10-21: "make this card
 * longer and show more weather info on this card, any new movies released,
 * any good family stuff to watch on ott … show something new on every load").
 *
 * What it says is only ever what is on record or what a real provider sent:
 * the day and the household; the weather where Weather is on (now, the day's
 * high and low, and rain still ahead today — `home/today-weather.ts`); and,
 * where a deployment has a film catalogue, one film new in cinemas and one
 * family pick to stream, a different pair each load (`home/screen-picks.ts`).
 * Anything not configured is simply not there — never a placeholder.
 */

/** The end of today on the household's clock. */
function endOfLocalDay(timezone: string, now: Date): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
  const elapsed = ((parts.hour ?? 0) * 3600 + (parts.minute ?? 0) * 60 + (parts.second ?? 0)) * 1000;
  return new Date(now.getTime() - elapsed + 24 * 3600 * 1000);
}

export function DateLine({ date, household }: { date: string; household: string }) {
  return (
    <span className="min-w-0 text-start">
      <span className="block text-sm font-semibold whitespace-nowrap">{date}</span>
      <span className="block text-xs break-words text-[var(--wh-foreground-subtle)]">{household}</span>
    </span>
  );
}

function PickRow({ pick, label, kindWord }: { pick: ScreenPick; label: string; kindWord: string }) {
  return (
    <a href={pick.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-2.5 rounded-[var(--wh-radius-sm)] p-1 hover:bg-[var(--wh-surface-muted)]">
      {pick.posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a provider's poster, already sized
        <img src={pick.posterUrl} alt="" loading="lazy" className="h-12 w-8 shrink-0 rounded-[4px] object-cover" />
      ) : (
        <span aria-hidden className="grid h-12 w-8 shrink-0 place-items-center rounded-[4px] bg-[var(--wh-surface-muted)] text-[var(--wh-foreground-subtle)]">
          {pick.kind === "show" ? <Tv className="size-4" /> : <Clapperboard className="size-4" />}
        </span>
      )}
      <span className="min-w-0">
        <span className="block text-[0.6875rem] font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{label}</span>
        <span className="block text-sm font-medium break-words">{pick.title}</span>
        <span className="block text-xs text-[var(--wh-foreground-muted)]">{[kindWord, pick.year].filter(Boolean).join(" · ")}</span>
      </span>
    </a>
  );
}

export async function TodayCard({ session, now, date }: { session: Session; now: Date; date: string }) {
  const { t, preferences } = session.locale;
  const { membership, supabase, view } = session;
  const timezone = membership.household.timezone;
  const [weather, lists] = await Promise.all([
    weatherProviderFromEnv() ? householdWeather(supabase, membership.household.id, { now }).catch(() => null) : Promise.resolve(null),
    screenLists(preferences.region || "IN").catch(() => null),
  ]);
  const today: TodayWeather | null = weather?.state === "ready" ? todayWeather(weather.windows, now, endOfLocalDay(timezone, now)) : null;
  const imperial = preferences.measurement === "imperial";
  const degrees = (celsius: number) => `${imperial ? Math.round((celsius * 9) / 5 + 32) : celsius}°`;
  const [cinema] = lists ? pickFew(lists.inCinemas, 1) : [];
  const [stream] = lists ? pickFew(lists.familyStreaming, 1) : [];
  const rainy = Boolean(today?.rainAt);

  return (
    <div data-today-card="" className="relative z-10 mx-4 mt-4 rounded-[var(--wh-radius)] bg-[var(--wh-surface)]/92 p-3 shadow-[var(--wh-shadow-card)] backdrop-blur-sm sm:absolute sm:end-4 sm:top-4 sm:m-0 sm:w-[21rem]">
      <div className="flex items-start gap-2.5">
        {rainy ? (
          <CloudRain aria-hidden className="mt-0.5 size-6 shrink-0 text-[var(--wh-tone-home)]" />
        ) : (
          <Sun aria-hidden className="mt-0.5 size-6 shrink-0 text-[var(--wh-tone-money)]" />
        )}
        <span className="min-w-0 flex-1">
          <DateLine date={date} household={view.householdName} />
        </span>
        {today ? (
          <span className="shrink-0 text-end">
            <span className="block text-2xl leading-none font-bold tabular-nums">{degrees(today.nowC)}</span>
            <span className="mt-1 block text-[0.6875rem] whitespace-nowrap text-[var(--wh-foreground-muted)] tabular-nums">
              {t("today.highLow", { high: degrees(today.highC), low: degrees(today.lowC) })}
            </span>
          </span>
        ) : null}
      </div>
      {today && weather?.state === "ready" ? (
        <p className="mt-2 text-xs text-[var(--wh-foreground-muted)]">
          {today.rainAt
            ? t("today.rainAt", { time: formatTime(timezone, today.rainAt), chance: Math.round(today.rainChance * 100) })
            : t("today.dry")}
          {" · "}
          <span className="break-words">{t("today.weatherIn", { place: weather.place })}</span>
        </p>
      ) : null}
      {weather?.state === "off" && weather.reason === "no_area" && view.permissions.includes("household.manage") ? (
        // Weather is on here but nobody has said where home is; only an Admin can, and only on Integrations.
        <Link href="/household/integrations#weather" className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[var(--wh-primary)] hover:underline">
          <CloudSun aria-hidden className="size-4 shrink-0" />
          <span className="break-words">{t("today.weatherArea")}</span>
        </Link>
      ) : null}
      {cinema || stream ? (
        <div className="mt-2 grid gap-1 border-t border-[var(--wh-border)] pt-2">
          {cinema ? <PickRow pick={cinema} label={t("today.inCinemas")} kindWord={t("today.film")} /> : null}
          {stream ? <PickRow pick={stream} label={t("today.toStream")} kindWord={stream.kind === "show" ? t("today.show") : t("today.film")} /> : null}
          <p className="px-1 text-[0.625rem] leading-snug text-[var(--wh-foreground-subtle)]">{t("today.credit")}</p>
        </div>
      ) : null}
      <Link href="/today" className="mt-1 flex items-center justify-end gap-0.5 text-xs font-semibold text-[var(--wh-primary)] hover:underline">
        {t("today.plan")} <ChevronRight aria-hidden className="size-3.5" />
      </Link>
    </div>
  );
}

/** What shows while the weather and films are on their way: the day and the household, as before. */
export function TodayCardFallback({ date, household }: { date: string; household: string }) {
  return (
    <div data-today-card="" className="relative z-10 mx-4 mt-4 flex items-start gap-2.5 rounded-[var(--wh-radius)] bg-[var(--wh-surface)]/92 p-3 shadow-[var(--wh-shadow-card)] sm:absolute sm:end-4 sm:top-4 sm:m-0 sm:w-[21rem]">
      <Sun aria-hidden className="mt-0.5 size-6 shrink-0 text-[var(--wh-tone-money)]" />
      <DateLine date={date} household={household} />
    </div>
  );
}
