/**
 * An original illustration of a home in the WonderHome palette: a warm house,
 * a tree, a path, sun and a few floating "handled" notes.
 *
 * Inline SVG on purpose — no image request, scales to any size, and it uses
 * the design tokens so it is always in the product's colours. Decorative: every
 * placement marks it aria-hidden.
 */
export function HomeIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 560 400" className={className} aria-hidden>
      <defs>
        <linearGradient id="wh-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.97 0.03 70)" />
          <stop offset="1" stopColor="oklch(0.965 0.028 180)" />
        </linearGradient>
        <linearGradient id="wh-roof" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(0.72 0.14 45)" />
          <stop offset="1" stopColor="oklch(0.62 0.15 35)" />
        </linearGradient>
        <linearGradient id="wh-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.995 0.005 80)" />
          <stop offset="1" stopColor="oklch(0.96 0.02 75)" />
        </linearGradient>
      </defs>

      <circle cx="470" cy="70" r="34" fill="#F6C453" opacity="0.95" />
      <circle cx="470" cy="70" r="48" fill="#F6C453" opacity="0.22" />

      <ellipse cx="280" cy="360" rx="260" ry="40" fill="oklch(0.9 0.06 150)" opacity="0.6" />
      <path d="M40 340 Q 280 300 520 340 L 520 400 L 40 400 Z" fill="oklch(0.86 0.08 150)" opacity="0.7" />

      {/* Tree */}
      <rect x="86" y="250" width="14" height="80" rx="6" fill="oklch(0.55 0.08 60)" />
      <circle cx="93" cy="230" r="46" fill="oklch(0.7 0.14 150)" />
      <circle cx="66" cy="252" r="30" fill="oklch(0.74 0.13 150)" />
      <circle cx="122" cy="255" r="28" fill="oklch(0.66 0.14 150)" />

      {/* House */}
      <path d="M170 320 L 170 210 L 300 120 L 430 210 L 430 320 Z" fill="url(#wh-wall)" stroke="oklch(0.86 0.02 75)" strokeWidth="2" />
      <path d="M150 218 L 300 108 L 450 218 L 430 230 L 300 138 L 170 230 Z" fill="url(#wh-roof)" />
      <rect x="350" y="130" width="24" height="50" rx="4" fill="oklch(0.6 0.12 35)" />

      {/* Door */}
      <rect x="276" y="245" width="48" height="75" rx="10" fill="oklch(0.49 0.09 190)" />
      <circle cx="312" cy="284" r="3" fill="oklch(0.95 0.03 85)" />

      {/* Windows */}
      <rect x="200" y="235" width="50" height="42" rx="8" fill="oklch(0.9 0.05 200)" stroke="oklch(0.99 0 0)" strokeWidth="4" />
      <rect x="350" y="235" width="50" height="42" rx="8" fill="oklch(0.9 0.05 200)" stroke="oklch(0.99 0 0)" strokeWidth="4" />
      <path d="M225 235 V 277 M200 256 H 250 M375 235 V 277 M350 256 H 400" stroke="oklch(0.99 0 0)" strokeWidth="3" />

      {/* Heart on the house */}
      <path d="M300 200c-7-5.6-13-9.8-13-15.6a6.5 6.5 0 0 1 13-1.5 6.5 6.5 0 0 1 13 1.5c0 5.8-6 10-13 15.6z" fill="oklch(0.66 0.17 20)" />

      {/* Path */}
      <path d="M300 320 Q 290 360 250 400 L 350 400 Q 310 360 300 320 Z" fill="oklch(0.92 0.03 75)" />

      {/* Floating notes */}
      <g className="wh-float" style={{ ["--wh-float-tilt" as string]: "-4deg" }}>
        <rect x="40" y="70" width="150" height="46" rx="14" fill="oklch(1 0 0)" stroke="oklch(0.92 0.012 75)" />
        <circle cx="64" cy="93" r="10" fill="oklch(0.955 0.04 155)" />
        <path d="M59 93l3.5 3.5L70 89" stroke="oklch(0.62 0.13 155)" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <rect x="82" y="84" width="84" height="7" rx="3.5" fill="oklch(0.27 0.05 255)" opacity="0.8" />
        <rect x="82" y="97" width="56" height="6" rx="3" fill="oklch(0.62 0.025 250)" opacity="0.6" />
      </g>
      <g className="wh-float" style={{ ["--wh-float-tilt" as string]: "3deg", ["--wh-float-delay" as string]: "1.2s" }}>
        <rect x="380" y="270" width="150" height="46" rx="14" fill="oklch(1 0 0)" stroke="oklch(0.92 0.012 75)" />
        <circle cx="404" cy="293" r="10" fill="oklch(0.96 0.045 75)" />
        <rect x="399" y="289" width="10" height="8" rx="2" fill="oklch(0.68 0.16 62)" />
        <rect x="422" y="284" width="84" height="7" rx="3.5" fill="oklch(0.27 0.05 255)" opacity="0.8" />
        <rect x="422" y="297" width="48" height="6" rx="3" fill="oklch(0.62 0.025 250)" opacity="0.6" />
      </g>
    </svg>
  );
}
