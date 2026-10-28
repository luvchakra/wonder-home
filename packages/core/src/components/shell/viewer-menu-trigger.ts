import type { ShellViewer } from "./mobile-header";

/** The avatar button's name and look, the same before and after the menu's code has loaded. */
export const viewerMenuLabel = (viewer: ShellViewer) => `${viewer.displayName}, ${viewer.roleLabel}. Account menu`;

export const VIEWER_TRIGGER_CLASS =
  "ml-1 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]";
