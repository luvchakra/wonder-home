/**
 * A small original illustration of a family — three figures and a heart — in
 * the WonderHome palette, for the Home greeting. Same discipline as
 * `HomeIllustration`: inline SVG, design tokens only, purely decorative.
 */
export function FamilyIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 100" className={className} aria-hidden>
      <ellipse cx="60" cy="92" rx="54" ry="8" fill="oklch(0.9 0.06 150)" opacity="0.5" />

      {/* Taller figure */}
      <circle cx="34" cy="30" r="14" fill="oklch(0.68 0.16 62)" />
      <path d="M14 84 Q14 52 34 52 Q54 52 54 84 Z" fill="oklch(0.6 0.13 255)" />

      {/* Shorter figure */}
      <circle cx="66" cy="38" r="11" fill="oklch(0.66 0.17 20)" />
      <path d="M50 84 Q50 58 66 58 Q82 58 82 84 Z" fill="oklch(0.66 0.14 150)" />

      {/* Smallest figure */}
      <circle cx="92" cy="46" r="9" fill="oklch(0.72 0.14 45)" />
      <path d="M79 84 Q79 62 92 62 Q105 62 105 84 Z" fill="oklch(0.62 0.13 190)" />

      {/* Heart above the group */}
      <path
        d="M63 16c-3.6-3-6.6-5.3-6.6-8.6a3.6 3.6 0 0 1 6.6-2 3.6 3.6 0 0 1 6.6 2c0 3.3-3 5.6-6.6 8.6z"
        fill="oklch(0.66 0.17 20)"
      />
    </svg>
  );
}
