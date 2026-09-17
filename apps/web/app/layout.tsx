import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

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
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
