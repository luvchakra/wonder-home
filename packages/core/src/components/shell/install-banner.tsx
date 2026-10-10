"use client";

import { Share, X } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { cn } from "../../lib/cn";
import type { InstallBannerLabels } from "../../pwa/install-labels";
import { useInstallBanner } from "../../pwa/use-install-prompt";
import { BrandMark } from "../ui/brand";
import { Button } from "../ui/button";

/** Set once the banner has slid in on this page load, so moving between screens never replays it. */
let enteredThisLoad = false;

/**
 * The invitation to install WonderHome (story 00-011): a band at the very
 * top of the page, above the header, on a phone or tablet whose browser can
 * really install the app and where it is not installed yet
 * (`install-eligibility.ts` decides; this only draws).
 *
 * It sits in the flow, so it pushes the page down rather than covering it,
 * and it takes the top safe-area inset itself. Chromium gets one tap:
 * Install opens the browser's own prompt. iOS has no prompt, so "How to"
 * opens the two steps in place, with the Share glyph drawn where the
 * language puts it, and "I've added it" is remembered because a Safari tab
 * can never tell. The mark is the same geometry as the manifest's icons.
 *
 * Nothing is rendered on the server or before the browser has answered, so
 * a desktop never sees it even for a frame; it slides in once per page load
 * and not at all under reduced motion. It never takes focus.
 */
export function InstallBanner({ labels }: { labels: InstallBannerLabels }) {
  const { variant, install, dismiss, confirmAdded } = useInstallBanner();
  const [stepsOpen, setStepsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [animate] = useState(() => !enteredThisLoad);
  const stepsId = useId();

  const visible = variant !== "hidden";
  useEffect(() => {
    if (visible) enteredThisLoad = true;
  }, [visible]);

  if (!visible) return null;

  const ios = variant === "ios";
  const [beforeGlyph = "", afterGlyph = ""] = labels.step1.split("{share}");

  return (
    // Above the page's own decoration (a frame's corner leaves reach up into it),
    // below the sticky headers (z-30 and up) that scroll over it.
    <div className={cn("wh-install-banner relative z-20 print:hidden", animate && "wh-install-banner-enter")}>
      <section
        role="region"
        aria-label={labels.label}
        lang={labels.language}
        dir={labels.dir}
        className="min-h-0 overflow-hidden border-b border-[var(--wh-border)] bg-[var(--wh-surface)] pt-[env(safe-area-inset-top)] text-[var(--wh-foreground)] shadow-[0_1px_0_0_var(--wh-border)]"
      >
        <div className="mx-auto flex max-w-[var(--wh-content-wide)] items-center gap-3 py-2 ps-[max(1rem,env(safe-area-inset-left))] pe-[max(0.5rem,env(safe-area-inset-right))]">
          <BrandMark size={40} className="drop-shadow-sm" />
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-tight font-semibold tracking-tight">WonderHome</p>
            <p className="mt-0.5 text-xs leading-snug text-[var(--wh-foreground-muted)]">{labels.benefit}</p>
          </div>

          {ios ? (
            <Button
              type="button"
              variant="secondary"
              aria-expanded={stepsOpen}
              aria-controls={stepsId}
              onClick={() => setStepsOpen((open) => !open)}
              className="shrink-0 rounded-[var(--wh-radius-pill)] px-3.5"
            >
              {labels.howTo}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await install();
                } finally {
                  setBusy(false);
                }
              }}
              className="shrink-0 rounded-[var(--wh-radius-pill)] px-4 shadow-[var(--wh-shadow-primary)]"
            >
              {labels.install}
            </Button>
          )}

          <button
            type="button"
            aria-label={labels.dismiss}
            onClick={dismiss}
            className="grid size-11 shrink-0 place-items-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>

        {ios ? (
          <div
            id={stepsId}
            hidden={!stepsOpen}
            className="mx-auto max-w-[var(--wh-content-wide)] pb-3 ps-[max(1rem,env(safe-area-inset-left))] pe-[max(1rem,env(safe-area-inset-right))]"
          >
            <ol className="space-y-2 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] p-3 text-sm">
              <li className="flex items-start gap-2.5">
                <StepNumber>1</StepNumber>
                <span className="pt-0.5">
                  {beforeGlyph}
                  <Share
                    aria-hidden
                    className="mx-0.5 inline size-[1.1em] align-[-0.2em] text-[var(--wh-primary)]"
                  />
                  {afterGlyph}
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <StepNumber>2</StepNumber>
                <span className="pt-0.5">{labels.step2}</span>
              </li>
            </ol>
            <div className="mt-2 flex justify-end">
              <Button type="button" onClick={confirmAdded} className="rounded-[var(--wh-radius-pill)]">
                {labels.done}
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function StepNumber({ children }: { children: string }) {
  return (
    <span
      aria-hidden
      className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--wh-primary-soft)] text-xs font-semibold text-[var(--wh-primary)]"
    >
      {children}
    </span>
  );
}
