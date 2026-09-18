import type { Metadata, Viewport } from "next";
import { Caveat, Inter } from "next/font/google";

import "./globals.css";

/**
 * Inter, self-hosted by next/font so no request ever leaves for a font CDN —
 * the CSP allows fonts from 'self' only, on purpose. `display: swap` keeps text
 * readable in the system face while the file arrives.
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

/**
 * Caveat, the handwritten accent the mockups close every screen with. Only
 * ever decoration (see ui/script-accent.tsx), so `display: swap` showing the
 * system face for a moment costs nothing a household needs to read.
 */
const caveat = Caveat({
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600"],
  variable: "--font-caveat",
});

export const metadata: Metadata = {
  title: {
    default: "WonderHome",
    template: "%s · WonderHome",
  },
  description: "Happier Homes. Brighter Tomorrows. Less mental load. More family time.",
  applicationName: "WonderHome",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "WonderHome", statusBarStyle: "default" },
  // Every file here is generated from the same geometry the header renders,
  // by `npm run brand`. The dark tile is offered to browsers that ask for it:
  // a white tile in a dark tab strip is a bright rectangle, not a brand.
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml", media: "(prefers-color-scheme: light)" },
      { url: "/icon-dark.svg", type: "image/svg+xml", media: "(prefers-color-scheme: dark)" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  // One colour, because the app ships one scheme. A dark themeColor here would
  // tint the browser chrome to match a palette the page never renders.
  themeColor: "#fbf8f3",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${caveat.variable}`}>
      <body>{children}</body>
    </html>
  );
}
