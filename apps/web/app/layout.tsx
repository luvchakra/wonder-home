import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "WonderHome",
    template: "%s · WonderHome",
  },
  description: "Happier homes. Brighter tomorrows.",
  applicationName: "WonderHome",
};

export const viewport: Viewport = {
  // One colour, because the app ships one scheme. A dark themeColor here would
  // tint the browser chrome to match a palette the page never renders.
  themeColor: "#f2faf7",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
