import Link from "next/link";

import { createAdminClient } from "@wonderhome/core/db/admin";
import { translatorForRecipient } from "@wonderhome/core/notifications/deliver";
import { verifyUnsubscribe } from "@wonderhome/core/notifications/unsubscribe";

import { AuthLayout } from "../_components/auth-layout";
import { visitorLocale, type EntryLocale } from "../_lib/entry-locale";
import { turnEmailOffAction } from "./actions";
import { EmailOffForm } from "./email-off-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Email notifications", robots: { index: false, follow: false } };

/** The person's own language for this page when the link is genuine; the visitor's otherwise. */
async function localeFor(memberId: string): Promise<EntryLocale | null> {
  try {
    const admin = createAdminClient();
    const { data: member } = await admin.from("household_members").select("language, date_format, time_format, measurement_system, household_id").eq("id", memberId).maybeSingle();
    if (!member) return null;
    const { data: household } = await admin.from("households").select("timezone, region, currency, measurement_system, default_language").eq("id", (member as { household_id: string }).household_id).maybeSingle();
    const found = await translatorForRecipient(household as Record<string, unknown> | null, member as Record<string, unknown>);
    return found ? { language: found.preferences.language, dir: found.preferences.dir, t: found.t } : null;
  } catch {
    return null;
  }
}

/**
 * The page behind the link at the foot of a notification email (story 27-009).
 * Reached from a mail app, so it changes nothing until the button is pressed:
 * a mail scanner opening the link must not switch anyone's email off.
 */
export default async function EmailOffPage({ searchParams }: { searchParams: Promise<{ m?: string; t?: string }> }) {
  const { m = "", t: token = "" } = await searchParams;
  const genuine = verifyUnsubscribe(m, token);
  const locale = (genuine ? await localeFor(m) : null) ?? (await visitorLocale());
  const { t } = locale;

  return (
    <AuthLayout locale={locale} title={t("emailOff.title")} lede={genuine ? t("emailOff.body") : t("emailOff.invalid")} offerInstall={false}>
      {genuine ? (
        <EmailOffForm member={m} token={token} action={turnEmailOffAction} labels={{ button: t("emailOff.button"), done: t("emailOff.done"), invalid: t("emailOff.invalid") }} />
      ) : null}
      <Link href="/" className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-[var(--wh-primary)] underline-offset-4 hover:underline">
        {t("emailOff.open")}
      </Link>
    </AuthLayout>
  );
}
