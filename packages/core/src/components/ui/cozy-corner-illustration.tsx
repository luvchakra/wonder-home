/**
 * A warm, sunlit corner: a window, a cat that tiptoes in, a mug and a stack of
 * books — for Home's greeting header, as a full-width background the
 * greeting text sits on top of.
 *
 * Inline SVG in the app's flat-illustration style (`HomeIllustration`'s own
 * discipline: design tokens only, no photo, no stock asset), not a literal
 * reproduction of a photorealistic reference — rule 8 asks for imagery "in
 * the household's own tones," which this app only ever does as vector shapes
 * built from the same palette every other illustration uses.
 *
 * The scene is deliberately drawn into the right ~60% of a wide canvas,
 * leaving the left clear for the greeting text to sit over without fighting
 * the artwork for legibility. `xMinYMid slice` keeps that left edge anchored
 * — a narrower container crops from the right (into the busier half of the
 * scene) rather than symmetrically, which would eat into the clear side.
 */
export function CozyCornerIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 900 300" preserveAspectRatio="xMinYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id="wh-cozy-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(0.975 0.02 75)" />
          <stop offset="1" stopColor="oklch(0.955 0.03 60)" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="900" height="300" fill="url(#wh-cozy-bg)" />

      {/* Window, top right, with a soft glow */}
      <circle cx="770" cy="70" r="70" fill="#F6C453" opacity="0.16" />
      <rect x="710" y="10" width="150" height="120" rx="10" fill="oklch(0.98 0.01 90)" stroke="oklch(0.88 0.02 75)" strokeWidth="3" />
      <path d="M785 10 V 130 M710 70 H 860" stroke="oklch(0.88 0.02 75)" strokeWidth="3" />
      <circle cx="830" cy="42" r="16" fill="#F6C453" opacity="0.85" />

      {/* Potted plant, right edge */}
      <path d="M852 300 L 840 240 L 892 240 L 880 300 Z" fill="oklch(0.62 0.1 45)" />
      <path d="M866 240 C 840 210 830 170 845 140 C 855 175 860 205 866 240 Z" fill="oklch(0.62 0.13 150)" />
      <path d="M866 240 C 880 200 900 175 896 145 C 878 175 870 205 866 240 Z" fill="oklch(0.68 0.14 150)" />
      <path d="M866 240 C 866 195 866 165 866 135 C 872 170 870 205 866 240 Z" fill="oklch(0.56 0.12 150)" />

      {/* Sunlit floor line */}
      <path d="M0 260 Q 450 230 900 260 L 900 300 L 0 300 Z" fill="oklch(0.93 0.03 70)" opacity="0.6" />

      {/* Stack of books, centre-right */}
      <rect x="630" y="222" width="130" height="20" rx="6" fill="oklch(0.66 0.17 20)" />
      <rect x="636" y="202" width="118" height="20" rx="6" fill="oklch(0.7 0.13 150)" />
      <rect x="642" y="182" width="106" height="20" rx="6" fill="oklch(0.68 0.16 62)" />

      {/* Mug beside the books */}
      <path d="M558 190 h 56 v 48 a 28 28 0 0 1 -56 0 z" fill="oklch(0.995 0.005 80)" stroke="oklch(0.88 0.02 75)" strokeWidth="2" />
      <path d="M614 202 q 22 0 22 18 t -22 18" fill="none" stroke="oklch(0.88 0.02 75)" strokeWidth="6" strokeLinecap="round" />
      <path
        d="M586 214c-3.4-2.7-6.2-4.7-6.2-7.5a3.2 3.2 0 0 1 6.2-1 3.2 3.2 0 0 1 6.2 1c0 2.8-2.8 4.8-6.2 7.5z"
        fill="oklch(0.66 0.17 20)"
      />

      {/* The cat, centre-right. It tiptoes in from the right on arrival,
          settles, then blinks now and then and flicks its tail. Motion is
          the theme's (`wh-cat-*` in ui-theme.css), and all of it stops
          under prefers-reduced-motion, leaving the cat simply sitting there. */}
      <g className="wh-cat-sneak">
        <g className="wh-cat-tail">
          <ellipse cx="510" cy="248" rx="20" ry="12" fill="oklch(0.62 0.04 60)" opacity="0.7" />
        </g>
        <ellipse cx="450" cy="238" rx="92" ry="46" fill="oklch(0.9 0.015 75)" />
        <path
          d="M418 205 C 396 185 390 150 408 140 C 412 158 422 172 434 182 Z"
          fill="oklch(0.62 0.04 60)"
        />
        <path
          d="M378 218 C 360 200 356 168 374 158 C 376 176 386 190 396 200 Z"
          fill="oklch(0.62 0.04 60)"
        />
        <circle cx="396" cy="196" r="46" fill="oklch(0.94 0.012 75)" />
        <path d="M362 176 L 374 152 L 388 180 Z" fill="oklch(0.9 0.015 75)" />
        <path d="M408 178 L 418 150 L 432 176 Z" fill="oklch(0.9 0.015 75)" />

        {/* Eyes, open, each with a catch-light; they blink together */}
        <g className="wh-cat-blink">
          <ellipse cx="384" cy="194" rx="6.5" ry="8.5" fill="oklch(0.33 0.03 60)" />
          <ellipse cx="428" cy="194" rx="6.5" ry="8.5" fill="oklch(0.33 0.03 60)" />
          <circle cx="386.5" cy="190.5" r="2.2" fill="oklch(0.995 0.005 80)" />
          <circle cx="430.5" cy="190.5" r="2.2" fill="oklch(0.995 0.005 80)" />
        </g>

        {/* Rosy cheeks and a small smile */}
        <ellipse cx="370" cy="210" rx="7" ry="4" fill="#F472B6" opacity="0.22" />
        <ellipse cx="442" cy="210" rx="7" ry="4" fill="#F472B6" opacity="0.22" />
        <path d="M400 208 q 3 4 6 0 q 3 4 6 0" stroke="oklch(0.4 0.03 60)" strokeWidth="2.5" fill="none" strokeLinecap="round" />

        {/* Paw tucked under */}
        <ellipse cx="450" cy="272" rx="30" ry="14" fill="oklch(0.94 0.012 75)" />
      </g>
    </svg>
  );
}
