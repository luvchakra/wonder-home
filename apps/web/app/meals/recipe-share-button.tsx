"use client";

import { Check, Copy, Download, Mail, MessageCircle, Share2 } from "lucide-react";
import { useState, useSyncExternalStore, type ComponentType } from "react";

import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";
import { Sheet } from "@wonderhome/core/ui/sheet";

export type RecipeShareLabels = {
  share: string;
  shareLabel: string;
  title: string;
  lede: string;
  preview: string;
  whatsapp: string;
  whatsappMeta: string;
  more: string;
  moreMeta: string;
  copy: string;
  copyMeta: string;
  copied: string;
  email: string;
  emailMeta: string;
  picture: string;
  pictureMeta: string;
};

const noSubscription = () => () => {};

/**
 * "Share" on a household recipe: a sheet of ways to send it, each saying what
 * goes (the owner, 2026-10-20). WhatsApp gets the recipe's picture card and
 * the whole recipe as the message; where a phone cannot share a picture, the
 * message still goes to WhatsApp and the picture can be saved. Nothing about
 * the household travels with it — only the recipe.
 */
export function RecipeShareButton({ name, message, cardPath, labels }: { name: string; message: string; cardPath: string; labels: RecipeShareLabels }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const canShare = useSyncExternalStore(noSubscription, () => typeof navigator.share === "function", () => false);

  const card = async (): Promise<File | null> => {
    try {
      const blob = await (await fetch(cardPath)).blob();
      return new File([blob], `${name.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase() || "recipe"}.png`, { type: "image/png" });
    } catch {
      return null;
    }
  };

  const whatsapp = async () => {
    setBusy(true);
    try {
      const file = await card();
      if (file && typeof navigator.canShare === "function" && navigator.canShare({ files: [file], text: message })) {
        // The phone's own sheet, with the picture and the message together; WhatsApp is picked there.
        await navigator.share({ files: [file], text: message, title: name }).catch(() => undefined);
      } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener");
      }
    } finally {
      setBusy(false);
    }
  };

  const options: { key: string; icon: ComponentType<{ className?: string }>; tone: IconTone; title: string; meta: string; run: () => void | Promise<void> }[] = [
    { key: "whatsapp", icon: MessageCircle, tone: "handled", title: labels.whatsapp, meta: labels.whatsappMeta, run: whatsapp },
    ...(canShare
      ? [{ key: "more", icon: Share2, tone: "primary" as IconTone, title: labels.more, meta: labels.moreMeta, run: () => {
            void navigator.share({ title: name, text: message }).catch(() => undefined);
          } }]
      : []),
    {
      key: "copy",
      icon: copied ? Check : Copy,
      tone: "neutral",
      title: copied ? labels.copied : labels.copy,
      meta: labels.copyMeta,
      run: async () => {
        await navigator.clipboard?.writeText(message).catch(() => undefined);
        setCopied(true);
      },
    },
    { key: "email", icon: Mail, tone: "people", title: labels.email, meta: labels.emailMeta, run: () => {
        window.open(`mailto:?subject=${encodeURIComponent(name)}&body=${encodeURIComponent(message)}`, "_self");
      } },
    {
      key: "picture",
      icon: Download,
      tone: "meals",
      title: labels.picture,
      meta: labels.pictureMeta,
      run: () => {
        const link = document.createElement("a");
        link.href = cardPath;
        link.download = `${name}.png`;
        link.click();
      },
    },
  ];

  return (
    <>
      <button
        type="button"
        aria-label={labels.shareLabel}
        title={labels.share}
        onClick={() => {
          setCopied(false);
          setOpen(true);
        }}
        className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)] hover:text-[var(--wh-foreground)]"
      >
        <Share2 aria-hidden className="size-4" />
      </button>
      <Sheet open={open} onOpenChange={setOpen} title={labels.title} description={labels.lede}>
        <ul className="divide-y divide-[var(--wh-border)]">
          {options.map((option) => (
            <li key={option.key}>
              <button
                type="button"
                disabled={busy}
                onClick={() => void option.run()}
                className="flex min-h-14 w-full items-center gap-3 rounded-[var(--wh-radius-sm)] px-1 py-2 text-start hover:bg-[var(--wh-surface-muted)] disabled:opacity-60"
              >
                <IconTile icon={option.icon} tone={option.tone} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{option.title}</span>
                  <span className="block text-xs text-[var(--wh-foreground-muted)]">{option.meta}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <details className="mt-3 text-xs text-[var(--wh-foreground-muted)]">
          <summary className="cursor-pointer font-semibold">{labels.preview}</summary>
          <pre className="mt-2 font-[inherit] whitespace-pre-wrap">{message}</pre>
        </details>
      </Sheet>
    </>
  );
}
