"use client";

import { useActionState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";

import { testPlatformKeyAction, type KeyTestState } from "../settings-actions";

const IDLE: KeyTestState = { tone: null, message: null };

/**
 * WonderHome's own key, in words (2026-11-21): which provider, how it ends,
 * any open alert and what it has meant for families, and "Test key". Never
 * the key itself.
 */
export function AiKeyHealth({ provider, last4, alertLine, canTest }: { provider: string | null; last4: string | null; alertLine: string | null; canTest: boolean }) {
  const [tested, test, testing] = useActionState(testPlatformKeyAction, IDLE);
  const name = provider ? ({ anthropic: "Anthropic", google: "Google", openai: "OpenAI" } as Record<string, string>)[provider] ?? provider : null;
  return (
    <div className="space-y-3">
      <p className="text-sm">
        {name ? <>In use: a {name} key{last4 ? <> ending in <span className="font-mono">{last4}</span></> : null}.</> : "No key is in use: every household without its own key is answered by rules only."}
      </p>
      {alertLine ? <Alert tone="risk">{alertLine}</Alert> : name ? <p className="text-sm text-[var(--wh-foreground-muted)]">No provider has refused it.</p> : null}
      {tested.message ? <Alert tone={tested.tone === "risk" ? "risk" : "info"}>{tested.message}</Alert> : null}
      {canTest && name ? (
        <form action={test}>
          <Button type="submit" variant="secondary" disabled={testing}>
            {testing ? "Testing…" : "Test key"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
