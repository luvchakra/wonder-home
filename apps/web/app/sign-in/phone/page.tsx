import Link from "next/link";
import { notFound } from "next/navigation";

import { phoneAuthEnabled } from "@wonderhome/core/config/auth-providers";

import { AuthLayout } from "../../_components/auth-layout";
import { visitorLocale } from "../../_lib/entry-locale";
import { PhoneSignInForm } from "./phone-sign-in-form";
import { sameSitePath } from "@wonderhome/core/security/same-site-path";

export const metadata = { title: "Sign in with your phone" };

/**
 * Signing in with a phone number and a texted code (story 01-011) — for a
 * househelper with no email above all. It exists only where the deployment
 * offers it (`phoneAuthEnabled`), so nobody waits for a code that never comes.
 */
export default async function PhoneSignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!phoneAuthEnabled()) notFound();
  const [{ next }, locale] = await Promise.all([searchParams, visitorLocale()]);
  const { t } = locale;
  const safeNext = sameSitePath(next) ?? "/";

  return (
    <AuthLayout
      locale={locale}
      title={t("entry.phone.title")}
      lede={t("entry.phone.lede")}
      footer={{ prompt: t("entry.signIn.footerPrompt"), href: "/sign-up", label: t("entry.signIn.footerLink") }}
      accent={t("entry.signIn.accent")}
    >
      <div className="space-y-4">
        <PhoneSignInForm
          next={safeNext}
          labels={{
            number: t("entry.phone.number"),
            numberHint: t("entry.phone.numberHint"),
            send: t("entry.phone.send"),
            sending: t("entry.phone.sending"),
            code: t("entry.phone.code"),
            verify: t("entry.signIn.submit"),
            verifying: t("entry.signIn.pending"),
            otherNumber: t("entry.phone.otherNumber"),
            resend: t("entry.phone.resend"),
          }}
        />
        <Link
          href={`/sign-in${next ? `?next=${encodeURIComponent(safeNext)}` : ""}`}
          className="block text-center text-sm font-medium text-[var(--wh-primary)] underline-offset-2 hover:underline"
        >
          {t("entry.phone.useEmail")}
        </Link>
      </div>
    </AuthLayout>
  );
}
