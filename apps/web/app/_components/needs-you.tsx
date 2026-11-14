import type { SupabaseClient } from "@supabase/supabase-js";

import type { Translate } from "@wonderhome/core/i18n/translate";
import type { NeedsYouItem } from "@wonderhome/core/hometalk/needs-you";
import { loadNeedsYou } from "@wonderhome/core/hometalk/needs-you-repository";
import { GraduationCap, HeartPulse, Inbox, MessageCircle, ReceiptText, ShoppingBasket } from "lucide-react";

import { ButtonLink } from "@wonderhome/core/ui/button";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { NeedsYouAnswers } from "./needs-you-list";

type NeedsYouRow = {
  id: string;
  kind: string | null;
  prompt: string;
  defaultLine: string;
  answers: { value: string; label: string }[];
  /** Answered where it lives (a HomeTalk proposal, an approval). */
  href: string | null;
  openLabel: string;
};

function iconFor(kind: string | null): { icon: typeof Inbox; tone: IconTone } {
  if (kind === "bill" || kind === "receipt" || kind === "purchase") return { icon: ReceiptText, tone: "money" };
  if (kind === "school_item" || kind === "activity_item") return { icon: GraduationCap, tone: "school" };
  if (kind === "health_document") return { icon: HeartPulse, tone: "health" };
  if (kind === "grocery_item") return { icon: ShoppingBasket, tone: "meals" };
  if (kind && !kind.includes("homesend")) return { icon: MessageCircle, tone: "ai" };
  return { icon: Inbox, tone: "ai" };
}

/**
 * The one "Needs you" list (2026-11-14, decision 4), at the top of HomeTalk
 * and on Home: at most three, most consequential first, each with its tap
 * answers and what happens if nobody answers, and when. Shows nothing when
 * nothing needs this person (rule 4: nothing to do, no row).
 */
export async function NeedsYou({
  supabase,
  householdId,
  timeZone,
  language,
  t,
  className,
}: {
  supabase: SupabaseClient;
  householdId: string;
  timeZone: string;
  language: string;
  t: Translate;
  className?: string;
}) {
  const list = await loadNeedsYou(supabase, householdId).catch(() => ({ shown: [] as NeedsYouItem[], total: 0 }));
  if (list.shown.length === 0) return null;
  const when = whenFormatter(language, timeZone);
  const rows: NeedsYouRow[] = list.shown.map((item) => ({
    id: item.id,
    kind: item.prompt.kind ?? null,
    prompt: promptWords(item, t),
    defaultLine: defaultWords(item, t, when(item.defaultAt)),
    answers: item.answeredInPlace ? item.answers.map((answer) => ({ value: answer.value, label: answerWords(answer.value, t) })) : [],
    href: item.answeredInPlace ? null : (item.prompt.href ?? "/ai"),
    openLabel: t("needsYou.answer.open"),
  }));
  const answerLabels = { done: t("needsYou.result.done"), settled: t("needsYou.result.settled"), failed: t("needsYou.result.failed") };
  // Each row (rule 4): tinted tile, the question, what happens if nobody answers and when, then the tap answers.
  return (
    <Card id="needs-you" className={className}>
      <SectionHeader title={t("needsYou.title")} count={list.total} />
      <p className="mt-1 text-sm text-[var(--wh-foreground-muted)]">{t("needsYou.lede")}</p>
      <ul className="mt-3 grid gap-3">
        {rows.map((row) => {
          const { icon, tone } = iconFor(row.kind);
          return (
            <li key={row.id} className="flex gap-3 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-background)] p-3">
              <IconTile icon={icon} tone={tone} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium break-words text-[var(--wh-foreground)]">{row.prompt}</p>
                <p className="mt-1 text-xs text-[var(--wh-foreground-muted)]">{row.defaultLine}</p>
                {row.href ? (
                  <div className="mt-2">
                    <ButtonLink href={row.href} variant="secondary">
                      {row.openLabel}
                    </ButtonLink>
                  </div>
                ) : (
                  <NeedsYouAnswers householdId={householdId} id={row.id} answers={row.answers} labels={answerLabels} />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {list.total > list.shown.length ? <p className="mt-3 text-sm text-[var(--wh-foreground-muted)]">{t("needsYou.more", { count: list.total - list.shown.length })}</p> : null}
    </Card>
  );
}

function whenFormatter(language: string, timeZone: string): (iso: string) => string {
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat(language, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone });
  } catch {
    format = new Intl.DateTimeFormat("en", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "UTC" });
  }
  return (iso) => format.format(new Date(iso));
}

const PROMPTS = new Set(["homesend.check", "homesend.check.careful", "homesend.waiting", "homesend.waiting.duplicate", "homesend.resend", "hometalk.proposal", "approval"]);
const ANSWERS = new Set(["looks_right", "not_right", "note", "set_aside", "keep_existing", "open"]);
const DEFAULTS = new Set(["looks_right", "keep_checking", "note", "keep_existing", "set_aside", "not_done"]);

/** A part's own words (B, C) live under the same keys; anything not yet worded falls back to plain words, never a raw key. */
function wordsOr(t: Translate, key: string, params: Record<string, string>, fallback: string): string {
  try {
    const words = t(key as Parameters<Translate>[0], params);
    return words && words !== key ? words : fallback;
  } catch {
    return fallback;
  }
}

function promptWords(item: NeedsYouItem, t: Translate): string {
  const title = item.prompt.title?.trim() || t("needsYou.thisEntry");
  const code = PROMPTS.has(item.prompt.code) ? item.prompt.code : null;
  if (code) return t(`needsYou.prompt.${code}` as Parameters<Translate>[0], { title });
  return wordsOr(t, `needsYou.prompt.${item.prompt.code}`, { title }, t("needsYou.prompt.other", { title }));
}

function answerWords(value: string, t: Translate): string {
  if (ANSWERS.has(value)) return t(`needsYou.answer.${value}` as Parameters<Translate>[0]);
  return wordsOr(t, `needsYou.answer.${value}`, {}, value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()));
}

function defaultWords(item: NeedsYouItem, t: Translate, when: string): string {
  if (DEFAULTS.has(item.defaultAnswer)) return t(`needsYou.default.${item.defaultAnswer}` as Parameters<Translate>[0], { when });
  return wordsOr(t, `needsYou.default.${item.defaultAnswer}`, { when }, t("needsYou.default.other", { when }));
}
