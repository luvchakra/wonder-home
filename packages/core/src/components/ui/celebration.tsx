"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

/**
 * Confetti falling and balloons rising, for a goal kept (the owner,
 * 2026-10-20: "on goal completion show confetti and balloons going up as
 * celebration").
 *
 * Decoration only: it sits over the whole screen for about three seconds,
 * catches no taps, is hidden from assistive technology (the button that
 * started it already announces what happened) and is not shown at all under
 * reduced motion. Each `play` change starts it once more. Colours are the
 * household domain tones, so it is the app's own palette in either theme.
 */
const COLOURS = ["var(--wh-primary)", "var(--wh-tone-meals)", "var(--wh-tone-care)", "var(--wh-tone-school)", "var(--wh-tone-people)", "var(--wh-tone-money)", "var(--wh-tone-home)"];

type Piece = { id: number; left: number; size: number; colour: string; delay: number; fall: number; drift: number; spin: number; round: boolean };
type Balloon = { id: number; left: number; colour: string; delay: number; rise: number; sway: number; scale: number };

function pieces(seed: number): { confetti: Piece[]; balloons: Balloon[] } {
  const random = () => Math.random();
  const confetti = Array.from({ length: 70 }, (_, index) => ({
    id: seed * 1000 + index,
    left: random() * 100,
    size: 6 + random() * 6,
    colour: COLOURS[index % COLOURS.length]!,
    delay: random() * 500,
    fall: 1800 + random() * 1200,
    drift: (random() - 0.5) * 160,
    spin: 360 + random() * 540,
    round: random() > 0.6,
  }));
  const balloons = Array.from({ length: 7 }, (_, index) => ({
    id: seed * 1000 + 500 + index,
    left: 6 + (index * 88) / 6 + (random() - 0.5) * 6,
    colour: COLOURS[(index * 3) % COLOURS.length]!,
    delay: random() * 600,
    rise: 2600 + random() * 900,
    sway: (random() - 0.5) * 40,
    scale: 0.8 + random() * 0.45,
  }));
  return { confetti, balloons };
}

export function Celebration({ play }: { play: number }) {
  const [shown, setShown] = useState<{ confetti: Piece[]; balloons: Balloon[] } | null>(null);

  useEffect(() => {
    if (play <= 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // A fresh scatter each time it plays; made in the browser, after the tap.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShown(pieces(play));
    const done = window.setTimeout(() => setShown(null), 3800);
    return () => window.clearTimeout(done);
  }, [play]);

  if (!shown || typeof document === "undefined") return null;
  return createPortal(
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[80] overflow-hidden">
      {shown.confetti.map((piece) => (
        <span
          key={piece.id}
          className="wh-confetti"
          style={
            {
              left: `${piece.left}%`,
              width: piece.size,
              height: piece.round ? piece.size : piece.size * 0.45,
              borderRadius: piece.round ? "9999px" : "2px",
              background: piece.colour,
              "--wh-delay": `${piece.delay}ms`,
              "--wh-fall": `${piece.fall}ms`,
              "--wh-drift": `${piece.drift}px`,
              "--wh-spin": `${piece.spin}deg`,
            } as CSSProperties
          }
        />
      ))}
      {shown.balloons.map((balloon) => (
        <svg
          key={balloon.id}
          className="wh-balloon"
          width={44 * balloon.scale}
          height={86 * balloon.scale}
          viewBox="0 0 44 86"
          style={{ left: `${balloon.left}%`, "--wh-delay": `${balloon.delay}ms`, "--wh-rise": `${balloon.rise}ms`, "--wh-sway": `${balloon.sway}px` } as CSSProperties}
        >
          <path d="M22 54 C22 62 18 66 24 74 C28 79 20 82 22 86" fill="none" stroke="var(--wh-foreground-subtle)" strokeWidth="1.2" />
          <ellipse cx="22" cy="25" rx="19" ry="24" fill={balloon.colour} />
          <path d="M18 48 L26 48 L22 54 Z" fill={balloon.colour} />
          <ellipse cx="15" cy="16" rx="4" ry="7" fill="white" opacity="0.35" transform="rotate(-20 15 16)" />
        </svg>
      ))}
    </div>,
    document.body,
  );
}
