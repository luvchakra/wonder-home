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
