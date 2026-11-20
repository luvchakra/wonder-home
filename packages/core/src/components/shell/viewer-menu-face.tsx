import { Avatar } from "../ui/avatar";
import type { ShellViewer } from "./mobile-header";

/**
 * Where the avatar menu opens from: the phone header's avatar, or the desktop
 * sidebar's user card (pinned at its foot: avatar, name, and one line of who
 * they are in which household). Both open the same menu, and only one shows
 * at a size, so there is never a second button for the job (rule 14).
 */
export type ViewerMenuVariant = "avatar" | "card";

export const viewerTriggerClass = (variant: ViewerMenuVariant) =>
  variant === "card"
    ? "flex w-full items-center gap-2.5 rounded-[var(--wh-radius-sm)] px-2 py-2 text-start transition-colors hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)] data-[state=open]:bg-[var(--wh-surface-muted)]"
    : "ml-1 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]";

export function ViewerTriggerFace({ viewer, variant }: { viewer: ShellViewer; variant: ViewerMenuVariant }) {
  const avatar = <Avatar name={viewer.displayName} size="sm" imageUrl={viewer.avatarUrl ?? undefined} />;
  if (variant !== "card") return avatar;
  return (
    <>
      {avatar}
      {/* Wraps rather than ellipsising: a name is never truncated (rule 11). */}
      <span className="min-w-0 flex-1">
        <span className="block text-[0.8125rem] leading-snug font-semibold break-words text-[var(--wh-foreground)]">{viewer.displayName}</span>
        <span className="block text-xs leading-snug break-words text-[var(--wh-foreground-subtle)]">
          {viewer.roleLabel} · {viewer.householdName}
        </span>
      </span>
    </>
  );
}
