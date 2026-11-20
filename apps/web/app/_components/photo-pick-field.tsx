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
  wide = false,
}: {
  name: string;
  displayName: string;
  currentUrl: string | null;
  labels: PhotoPickLabels;
  /** Beside the photo: whose card this is ("You", "Child 2"). */
  caption: string;
  /** A dish's picture (a recipe, 25-050): a wide preview and a larger photo, not a round avatar. */
  wide?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  // A dish's chosen photo is drawn from the file itself, never put in an image's address (25-050).
  const [chosen, setChosen] = useState<Blob | null>(null);
  const [removed, setRemoved] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);

  async function picked(input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file) return;
    const small = await shrinkPhoto(file, wide ? 1280 : undefined);
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
    if (wide) setChosen(small);
    else setPreview(URL.createObjectURL(small));
  }

  function clear() {
    if (inputRef.current) inputRef.current.value = "";
    setPreview(null);
    setChosen(null);
    setRemoved(Boolean(currentUrl));
  }

  const shown = wide ? (chosen ? "chosen" : removed ? null : currentUrl) : (preview ?? (removed ? null : currentUrl));

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-3">
        {wide ? (
          chosen ? (
            <ChosenPreview photo={chosen} />
          ) : shown ? (
            // eslint-disable-next-line @next/next/no-img-element -- the saved picture's short-lived signed URL, from the server
            <img src={shown} alt="" className="h-24 w-full rounded-[var(--wh-radius-sm)] object-cover" />
          ) : null
        ) : (
          <Avatar name={displayName || "?"} size="lg" imageUrl={shown} />
        )}
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

/**
 * A chosen photo, drawn onto a canvas from the file itself: what the person
 * picked is decoded as an image and painted, never turned into an address
 * for the page to load. Cropped to fill like the recipe cards do.
 */
function ChosenPreview({ photo }: { photo: Blob }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    void createImageBitmap(photo)
      .then((bitmap) => {
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return bitmap.close();
        const width = canvas.clientWidth || 320;
        const height = canvas.clientHeight || 96;
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        const scale = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height);
        const drawWidth = bitmap.width * scale;
        const drawHeight = bitmap.height * scale;
        canvas.getContext("2d")?.drawImage(bitmap, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);
        bitmap.close();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [photo]);
  return <canvas ref={canvasRef} aria-hidden className="h-24 w-full rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)]" />;
}
