import { KeyRound } from "lucide-react";
import Link from "next/link";

import { KEY_PROVIDER_NAME } from "@wonderhome/core/ai/key-alert-status";
import type { Translate } from "@wonderhome/core/i18n/translate";
import type { AiKeyAlertRow } from "@wonderhome/core/notifications/notices";

/**
 * An AI key a provider stopped taking, said on the screen that depends on it
 * (the owner, 2026-10-26): what is wrong, in the notice's own words, and for
 * an Admin the one place to fix it. Everyone else is told an Admin has heard.
 */
export function KeyAlertBanner({
  alerts,
  manages,
  t,
  link = true,
  className,
}: {
  alerts: readonly AiKeyAlertRow[];
  manages: boolean;
  t: Translate;
  /** Off on Settings → AI Assistant itself, which is where the link would go. */
  link?: boolean;
  className?: string;
}) {
  if (alerts.length === 0) return null;
  return (
    <div role="alert" className={`space-y-2 rounded-[var(--wh-radius-sm)] bg-[var(--wh-attention-soft)] px-3 py-2.5 text-sm text-[var(--wh-attention)] ${className ?? ""}`}>
      {alerts.map((alert) => (
        <p key={alert.id} className="flex items-start gap-2">
          <KeyRound aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0">
            <span className="block font-semibold">{t(alert.purpose === "gemini_voice" ? "reminder.aiKey.title.gemini_voice" : "reminder.aiKey.title.assistant")}</span>
            <span className="block">{t(`reminder.aiKey.body.${alert.kind}` as "reminder.aiKey.body.out_of_credits", { provider: KEY_PROVIDER_NAME[alert.provider] })}</span>
          </span>
        </p>
      ))}
      {manages ? (
        link ? <Link href="/settings/ai" className="inline-block font-medium underline underline-offset-2">
          {t("keyAlert.fix")}
        </Link> : null
      ) : (
        <p className="text-xs">{t("keyAlert.adminTold")}</p>
      )}
    </div>
  );
}
