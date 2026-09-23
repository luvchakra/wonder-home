/**
 * A warm, sunlit corner: a window, a sleeping cat, a mug and a stack of
 * books — for Home's greeting header.
 *
 * Inline SVG in the app's flat-illustration style (`HomeIllustration`'s own
 * discipline: design tokens only, no photo, no stock asset), not a literal
 * reproduction of a photorealistic reference — rule 8 asks for imagery "in
 * the household's own tones," which this app only ever does as vector shapes
 * built from the same palette every other illustration uses.
 */
export function CozyCornerIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 300" className={className} aria-hidden>
      <defs>
        <linearGradient id="wh-cozy-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(0.975 0.02 75)" />
          <stop offset="1" stopColor="oklch(0.955 0.03 60)" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="600" height="300" fill="url(#wh-cozy-bg)" />

      {/* Window, top right, with a soft glow */}
      <circle cx="470" cy="70" r="70" fill="#F6C453" opacity="0.16" />
      <rect x="410" y="10" width="150" height="120" rx="10" fill="oklch(0.98 0.01 90)" stroke="oklch(0.88 0.02 75)" strokeWidth="3" />
      <path d="M485 10 V 130 M410 70 H 560" stroke="oklch(0.88 0.02 75)" strokeWidth="3" />
      <circle cx="530" cy="42" r="16" fill="#F6C453" opacity="0.85" />

      {/* Potted plant, right edge */}
      <path d="M552 300 L 540 240 L 592 240 L 580 300 Z" fill="oklch(0.62 0.1 45)" />
      <path d="M566 240 C 540 210 530 170 545 140 C 555 175 560 205 566 240 Z" fill="oklch(0.62 0.13 150)" />
      <path d="M566 240 C 580 200 600 175 596 145 C 578 175 570 205 566 240 Z" fill="oklch(0.68 0.14 150)" />
      <path d="M566 240 C 566 195 566 165 566 135 C 572 170 570 205 566 240 Z" fill="oklch(0.56 0.12 150)" />

      {/* Sunlit floor line */}
      <path d="M0 260 Q 300 230 600 260 L 600 300 L 0 300 Z" fill="oklch(0.93 0.03 70)" opacity="0.6" />

      {/* Stack of books, centre-right */}
      <rect x="330" y="222" width="130" height="20" rx="6" fill="oklch(0.66 0.17 20)" />
      <rect x="336" y="202" width="118" height="20" rx="6" fill="oklch(0.7 0.13 150)" />
      <rect x="342" y="182" width="106" height="20" rx="6" fill="oklch(0.68 0.16 62)" />

      {/* Mug beside the books */}
      <path d="M258 190 h 56 v 48 a 28 28 0 0 1 -56 0 z" fill="oklch(0.995 0.005 80)" stroke="oklch(0.88 0.02 75)" strokeWidth="2" />
      <path d="M314 202 q 22 0 22 18 t -22 18" fill="none" stroke="oklch(0.88 0.02 75)" strokeWidth="6" strokeLinecap="round" />
      <path
        d="M286 214c-3.4-2.7-6.2-4.7-6.2-7.5a3.2 3.2 0 0 1 6.2-1 3.2 3.2 0 0 1 6.2 1c0 2.8-2.8 4.8-6.2 7.5z"
        fill="oklch(0.66 0.17 20)"
      />

      {/* Sleeping cat, centre-left */}
      <ellipse cx="150" cy="238" rx="92" ry="46" fill="oklch(0.9 0.015 75)" />
      <path
        d="M118 205 C 96 185 90 150 108 140 C 112 158 122 172 134 182 Z"
        fill="oklch(0.62 0.04 60)"
      />
      <path
        d="M78 218 C 60 200 56 168 74 158 C 76 176 86 190 96 200 Z"
        fill="oklch(0.62 0.04 60)"
      />
      <circle cx="96" cy="196" r="46" fill="oklch(0.94 0.012 75)" />
      <path d="M62 176 L 74 152 L 88 180 Z" fill="oklch(0.9 0.015 75)" />
      <path d="M108 178 L 118 150 L 132 176 Z" fill="oklch(0.9 0.015 75)" />
      <path d="M72 196 q 12 8 24 0" stroke="oklch(0.4 0.03 60)" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M116 196 q 12 8 24 0" stroke="oklch(0.4 0.03 60)" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M92 212 q 4 4 8 0" stroke="oklch(0.4 0.03 60)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <ellipse cx="210" cy="248" rx="20" ry="12" fill="oklch(0.62 0.04 60)" opacity="0.7" />

      {/* Paw tucked under */}
      <ellipse cx="150" cy="272" rx="30" ry="14" fill="oklch(0.94 0.012 75)" />
    </svg>
  );
}
