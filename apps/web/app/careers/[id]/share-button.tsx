"use client";

import { Check, Share2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@wonderhome/core/ui/button";

/** The phone's share sheet where there is one; otherwise the link is copied. */
export function ShareButton({ title, path }: { title: string; path: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = new URL(path, window.location.origin).toString();
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Dismissing the share sheet is not an error.
    }
  };
  return (
    <Button type="button" variant="secondary" onClick={share} className="gap-1.5">
      {copied ? <Check aria-hidden className="size-4" /> : <Share2 aria-hidden className="size-4" />}
      <span aria-live="polite">{copied ? "Link copied" : "Share"}</span>
    </Button>
  );
}
