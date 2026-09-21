"use client";

import { Camera, Trash2 } from "lucide-react";
import { useActionState, useRef } from "react";

import { Avatar } from "@wonderhome/core/ui/avatar";
import { Pill } from "@wonderhome/core/ui/pill";

import type { ActionState } from "../(auth)/actions";
import { removeMemberAvatarAction, updateMemberAvatarAction } from "../(auth)/household-actions";

/**
 * The photo half of "edit their details, including their profile pictures"
 * (rule 1) — upload and remove sit beside each other (rule 12: every entity
 * can be added, updated and removed), a member picture included.
 *
 * The file input submits itself the moment a photo is chosen, so this reads
 * as one action ("change the photo") rather than a two-step file-picker-then-
 * save some other button already covers.
 */
export function MemberAvatarControl({
  householdId,
  memberId,
  displayName,
  avatarUrl,
}: {
  householdId: string;
  memberId: string;
  displayName: string;
  avatarUrl: string | null;
}) {
  const [uploadState, uploadAction, uploading] = useActionState<ActionState, FormData>(updateMemberAvatarAction, {});
  const [removeState, removeAction, removing] = useActionState<ActionState, FormData>(removeMemberAvatarAction, {});
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadFormRef = useRef<HTMLFormElement>(null);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3">
        <Avatar name={displayName} size="lg" imageUrl={avatarUrl} />
        <div className="flex flex-wrap gap-2">
          <form ref={uploadFormRef} action={uploadAction}>
            <input type="hidden" name="householdId" value={householdId} />
            <input type="hidden" name="memberId" value={memberId} />
            <input
              ref={inputRef}
              type="file"
              name="photo"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={() => uploadFormRef.current?.requestSubmit()}
            />
            <Pill type="button" tone="quiet" onClick={() => inputRef.current?.click()} disabled={uploading}>
              <Camera aria-hidden className="size-3.5" /> {uploading ? "Uploading…" : avatarUrl ? "Change photo" : "Add photo"}
            </Pill>
          </form>
          {avatarUrl ? (
            <form action={removeAction}>
              <input type="hidden" name="householdId" value={householdId} />
              <input type="hidden" name="memberId" value={memberId} />
              <Pill type="submit" tone="quiet" disabled={removing} className="text-[var(--wh-risk)]">
                <Trash2 aria-hidden className="size-3.5" /> {removing ? "Removing…" : "Remove photo"}
              </Pill>
            </form>
          ) : null}
        </div>
      </div>
      {uploadState.error ? <p className="text-xs text-[var(--wh-risk)]">{uploadState.error}</p> : null}
      {removeState.error ? <p className="text-xs text-[var(--wh-risk)]">{removeState.error}</p> : null}
    </div>
  );
}
