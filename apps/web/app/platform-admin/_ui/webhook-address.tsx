"use client";

import { useState } from "react";

import { Button } from "@wonderhome/core/ui/button";

/** The address to paste into a provider's webhook settings, with Copy (WhatsApp card). */
export function WebhookAddress({ url, hint }: { url: string; hint: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="mb-3 space-y-1 text-sm">
      <p className="font-semibold">Webhook URL</p>
      <p className="flex flex-wrap items-center gap-2">
        <code className="text-xs break-all select-all">{url}</code>
        <Button type="button" variant="quiet" onClick={copy}>{copied ? "Copied" : "Copy"}</Button>
      </p>
      <p className="text-xs text-[var(--wh-foreground-muted)]">{hint}</p>
    </div>
  );
}
