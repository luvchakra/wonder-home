"use client";

import { useState } from "react";

import { Avatar } from "../ui/avatar";
import type { ShellViewer } from "./mobile-header";
import { VIEWER_TRIGGER_CLASS, viewerMenuLabel } from "./viewer-menu-trigger";
import { useLoadedLater } from "./when-idle";

const loadContent = () => import("./viewer-menu-content");

/**
 * The avatar menu (Settings, Get Help, Install app, About, Log out).
 *
 * Its Radix menu, positioning and install sheet load after the page, not
 * with every screen's first JavaScript (performance audit B3). Until then the
 * avatar is a plain button that looks and reads the same; the code is warmed
 * once the page is idle, and a tap that comes first fetches it and opens the
 * menu the moment it is here.
 */
export function ViewerMenu({ viewer }: { viewer: ShellViewer }) {
  const [Content, fetchNow] = useLoadedLater(loadContent);
  const [asked, setAsked] = useState(false);

  if (Content) return <Content viewer={viewer} defaultOpen={asked} />;
  const ask = () => {
    setAsked(true);
    fetchNow();
  };
  return (
    <button
      type="button"
      aria-label={viewerMenuLabel(viewer)}
      aria-haspopup="menu"
      aria-expanded={asked}
      className={VIEWER_TRIGGER_CLASS}
      onClick={ask}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          ask();
        }
      }}
    >
      <Avatar name={viewer.displayName} size="sm" imageUrl={viewer.avatarUrl ?? undefined} />
    </button>
  );
}
