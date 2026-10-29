import { BrandMark } from "@wonderhome/core/ui/brand";
import { LANGUAGE_CODES } from "@wonderhome/core/i18n/locales";
import { translatorFor } from "@wonderhome/core/i18n/translate";
import { ScriptAccent } from "@wonderhome/core/ui/script-accent";
import { Skeleton } from "@wonderhome/core/ui/states";

/**
 * What appears the instant a navigation starts, before any data has arrived:
 * the shape of the shell and of the screen being opened. Next streams it
 * immediately (on a soft navigation it is even prefetched), so a tap is
 * answered on the next frame and the real screen replaces it as its data
 * lands. Each screen with its own `loading.tsx` names its shape (audit B10):
 * `dashboard` for Home and anything without one, `list` for a screen of
 * tabs and rows (Family, Groceries, Meals), `chat` for HomeTalk.
 *
 * Over the skeleton sits a veil — the mark breathing, one handwritten line —
 * that appears after 150 ms, so a fast load never flashes it. It is fixed
 * and takes no room, so nothing moves when the screen arrives. The line is
 * rendered in every language and CSS shows the one `<html lang>` names; no
 * header is read, so the screen stays static and prefetchable.
 */
export async function ScreenLoading({ shape = "dashboard" }: { shape?: "dashboard" | "list" | "chat" }) {
  const lines = await Promise.all(
    LANGUAGE_CODES.map(async (code) => {
      const t = await translatorFor(code);
      return { code, label: t("loading.label"), line: t("loading.script") };
    }),
  );
  const english = lines[0]!;
  return (
    <div className="min-h-dvh" role="status" aria-live="polite" aria-label={english.label}>
      <div className="wh-glass sticky top-0 z-30 border-b border-[var(--wh-border)]/70">
        <div className="mx-auto flex h-[var(--wh-header-height)] max-w-[var(--wh-content-wide)] items-center gap-3 px-4 lg:px-8">
          <BrandMark size={30} className="lg:hidden" />
          <Skeleton className="h-4 w-32" />
          <span className="flex-1" />
          <Skeleton className="size-8 rounded-full" />
        </div>
      </div>

      <div className="mx-auto w-full max-w-[var(--wh-content-max)] space-y-5 px-4 pt-5 lg:px-8 lg:pt-6">
        {shape === "chat" ? <ChatShape /> : <ListShape tiles={shape === "dashboard"} tabs={shape === "list"} />}
      </div>
      <div className="wh-loading-veil" aria-hidden>
        <span className="wh-loading-mark">
          <BrandMark size={56} />
        </span>
        {lines.map(({ code, line }) => (
          <span key={code} lang={code} className="wh-loading-line">
            <ScriptAccent tone="primary" size="md" heart>
              {line}
            </ScriptAccent>
          </span>
        ))}
      </div>
      <span className="sr-only">{english.label}…</span>
    </div>
  );
}

function ListShape({ tiles, tabs }: { tiles: boolean; tabs: boolean }) {
  return (
    <>
      <div className="space-y-2">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      {tiles ? (
        <div className="grid grid-cols-3 gap-2.5">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-16 rounded-[var(--wh-radius)]" />
          ))}
        </div>
      ) : null}
      {tabs ? <Skeleton className="h-10 w-full rounded-[var(--wh-radius-pill)]" /> : null}
      <div className="space-y-3">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex items-center gap-3 rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-3">
            <Skeleton className="size-10 rounded-[var(--wh-radius-sm)]" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-8 w-16 rounded-[var(--wh-radius-pill)]" />
          </div>
        ))}
      </div>
    </>
  );
}

/** HomeTalk's shape: a few turns of conversation, and the composer at the foot. */
function ChatShape() {
  return (
    <div className="flex min-h-[calc(100dvh-var(--wh-header-height)-6rem)] flex-col gap-3">
      <Skeleton className="h-7 w-1/2" />
      <div className="flex-1 space-y-3 pt-2">
        <Skeleton className="h-14 w-4/5 rounded-[var(--wh-radius)]" />
        <Skeleton className="ml-auto h-10 w-3/5 rounded-[var(--wh-radius)]" />
        <Skeleton className="h-20 w-4/5 rounded-[var(--wh-radius)]" />
      </div>
      <Skeleton className="h-12 w-full rounded-[var(--wh-radius-pill)]" />
    </div>
  );
}
