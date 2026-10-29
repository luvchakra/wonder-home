"use client";

import { Camera, Trash2 } from "lucide-react";
import { useActionState, useRef } from "react";

import { Avatar } from "@wonderhome/core/ui/avatar";
import { Pill } from "@wonderhome/core/ui/pill";

import { ICON_ACTION } from "./icon-action";
import type { ActionState } from "../(auth)/actions";
import { shrinkPhoto } from "../_lib/shrink-photo";
import { removePetPhotoAction, updatePetPhotoAction } from "../(auth)/home-actions";
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
export type AvatarLabels = { add: string; change: string; uploading: string; remove: string; removing: string };

const AVATAR_ENGLISH: AvatarLabels = { add: "Add photo", change: "Change photo", uploading: "Uploading…", remove: "Remove photo", removing: "Removing…" };

export function MemberAvatarControl({
  householdId,
  memberId,
  displayName,
  avatarUrl,
  labels = AVATAR_ENGLISH,
  kind = "member",
  variant = "full",
}: {
  /** "icons": just the change/remove buttons, for the card's top action row; "full": the picture beside them. */
  variant?: "full" | "icons";
  householdId: string;
  /** The member's id, or the pet's when `kind` is "pet". */
  memberId: string;
  /** A person's profile picture, or a pet's: the same control, each through its own write. */
  kind?: "member" | "pet";
  displayName: string;
  avatarUrl: string | null;
  /** Server-built words; English when a caller has not localized yet. */
  labels?: AvatarLabels;
}) {
  const [uploadState, uploadAction, uploading] = useActionState<ActionState, FormData>(kind === "pet" ? updatePetPhotoAction : updateMemberAvatarAction, {});
  const [removeState, removeAction, removing] = useActionState<ActionState, FormData>(kind === "pet" ? removePetPhotoAction : removeMemberAvatarAction, {});
  const icons = variant === "icons";
  const idField = kind === "pet" ? "petId" : "memberId";
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadFormRef = useRef<HTMLFormElement>(null);

  return (
    <div className={icons ? "contents" : "space-y-1.5"}>
      <div className={icons ? "contents" : "flex items-center gap-3"}>
        {icons ? null : <Avatar name={displayName} size="lg" imageUrl={avatarUrl} />}
        <div className={icons ? "contents" : "flex flex-wrap gap-2"}>
          <form ref={uploadFormRef} action={uploadAction}>
            <input type="hidden" name="householdId" value={householdId} />
            <input type="hidden" name={idField} value={memberId} />
            <input
              ref={inputRef}
              type="file"
              name="photo"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              className="sr-only"
              onChange={async (event) => {
                // Shrunk first: a phone photo is often larger than a request may carry.
                const input = event.currentTarget;
                const file = input.files?.[0];
                if (!file) return;
                const small = await shrinkPhoto(file);
                if (small !== file) {
                  const swap = new DataTransfer();
                  swap.items.add(small);
                  input.files = swap.files;
                }
                uploadFormRef.current?.requestSubmit();
              }}
            />
            {(() => {
              const label = uploading ? labels.uploading : avatarUrl ? labels.change : labels.add;
              return (
                <Pill type="button" tone="quiet" onClick={() => inputRef.current?.click()} disabled={uploading} className={icons ? ICON_ACTION : undefined} aria-label={icons ? `${label} — ${displayName}` : undefined} title={icons ? label : undefined}>
                  <Camera aria-hidden className={icons ? "size-4" : "size-3.5"} /> {icons ? null : label}
                </Pill>
              );
            })()}
          </form>
          {avatarUrl ? (
            <form action={removeAction}>
              <input type="hidden" name="householdId" value={householdId} />
              <input type="hidden" name={idField} value={memberId} />
              <Pill type="submit" tone="quiet" disabled={removing} className={`text-[var(--wh-risk)] ${icons ? ICON_ACTION : ""}`} aria-label={icons ? `${labels.remove} — ${displayName}` : undefined} title={icons ? labels.remove : undefined}>
                <Trash2 aria-hidden className={icons ? "size-4" : "size-3.5"} /> {icons ? null : removing ? labels.removing : labels.remove}
              </Pill>
            </form>
          ) : null}
        </div>
      </div>
      {uploadState.error ? <p role="alert" className={`${icons ? "basis-full " : ""}text-xs text-[var(--wh-risk)]`}>{uploadState.error}</p> : null}
      {removeState.error ? <p role="alert" className={`${icons ? "basis-full " : ""}text-xs text-[var(--wh-risk)]`}>{removeState.error}</p> : null}
    </div>
  );
}
