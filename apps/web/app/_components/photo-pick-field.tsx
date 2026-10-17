"use client";

import { Camera, Trash2, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Avatar } from "@wonderhome/core/ui/avatar";
import { Pill } from "@wonderhome/core/ui/pill";

import { shrinkPhoto } from "../_lib/shrink-photo";

export type PhotoPickLabels = { add: string; change: string; remove: string; undo: string; tooLarge: string };

/** What a photo may still weigh after shrinking (the server refuses more). */
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * A photo chosen while filling in someone's details, saved with the rest of
 * the form (onboarding's people steps). The picture shows at once; nothing is
 * uploaded until the form is saved. A photo already on record can be removed
 * here too, and the removal undone before saving (rule 12).
 *
 * Posts `name` (the file) and `${name}_remove` ("1" to clear a saved photo).
 */
export function PhotoPickField({
  name,
  displayName,
  currentUrl,
  labels,
  caption,
}: {
  name: string;
  displayName: string;
  currentUrl: string | null;
  labels: PhotoPickLabels;
  /** Beside the photo: whose card this is ("You", "Child 2"). */
  caption: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);

  async function picked(input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file) return;
    const small = await shrinkPhoto(file);
    if (small.size > MAX_BYTES) {
      setProblem(labels.tooLarge);
      input.value = "";
      return;
    }
    setProblem(null);
    if (small !== file) {
      const swap = new DataTransfer();
      swap.items.add(small);
      input.files = swap.files;
    }
    setRemoved(false);
    setPreview(URL.createObjectURL(small));
  }

  function clear() {
    if (inputRef.current) inputRef.current.value = "";
    setPreview(null);
    setRemoved(Boolean(currentUrl));
  }

  const shown = preview ?? (removed ? null : currentUrl);

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={displayName || "?"} size="lg" imageUrl={shown} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-sm font-semibold break-words text-[var(--wh-foreground-muted)]">{caption}</p>
          <div className="flex flex-wrap gap-2">
            <input
              ref={inputRef}
              type="file"
              name={name}
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => void picked(event.currentTarget)}
            />
            <input type="hidden" name={`${name}_remove`} value={removed ? "1" : ""} />
            <Pill type="button" tone="quiet" onClick={() => inputRef.current?.click()}>
              <Camera aria-hidden className="size-3.5" /> {shown ? labels.change : labels.add}
            </Pill>
            {shown ? (
              <Pill type="button" tone="quiet" onClick={clear} aria-label={`${labels.remove}: ${caption}`}>
                <Trash2 aria-hidden className="size-3.5" /> {labels.remove}
              </Pill>
            ) : removed ? (
              <Pill type="button" tone="quiet" onClick={() => setRemoved(false)}>
                <Undo2 aria-hidden className="size-3.5" /> {labels.undo}
              </Pill>
            ) : null}
          </div>
        </div>
      </div>
      {problem ? <p className="text-xs text-[var(--wh-risk)]">{problem}</p> : null}
    </div>
  );
}
