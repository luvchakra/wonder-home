"use client";

import { useEffect } from "react";

/**
 * Keeps `<html lang dir>` true to the person reading (story 22-004, spec §32,
 * §37), so a screen reader pronounces the page in its own language and an
 * Arabic page lays out right to left. The root layout stays static — reading
 * a cookie there would make every page dynamic, the landing page included —
 * so the signed-in shell sets both as soon as it mounts.
 */
export function DocumentLocale({ language, dir }: { language: string; dir: "ltr" | "rtl" }) {
  useEffect(() => {
    const root = document.documentElement;
    if (root.lang !== language) root.lang = language;
    if (root.dir !== dir) root.dir = dir;
  }, [language, dir]);
  return null;
}
