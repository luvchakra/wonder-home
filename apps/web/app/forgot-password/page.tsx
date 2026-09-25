import Link from "next/link";

import { Field } from "@wonderhome/core/ui/field";

import { requestPasswordReset } from "../(auth)/actions";
import { AuthForm } from "../_components/auth-form";
import { AuthLayout } from "../_components/auth-layout";
import { aroundLink, visitorLocale } from "../_lib/entry-locale";

export const metadata = { title: "Reset your password" };

/**
 * Asking for a new password.
 *
 * The answer is the same whichever address is typed, so this screen cannot be
 * used to find out who has an account. That is also why the confirmation is a
 * notice on this page rather than a redirect: a redirect that only happened
 * for real accounts would leak exactly what the wording is protecting.
 */
export default async function ForgotPasswordPage() {
  const locale = await visitorLocale();
  const { t } = locale;
  const [hintBefore, hintAfter] = aroundLink(t, "entry.forgot.hint");

  return (
    <AuthLayout
      locale={locale}
      title={t("entry.forgot.title")}
      lede={t("entry.forgot.lede")}
      footer={{ prompt: t("entry.forgot.footerPrompt"), href: "/sign-in", label: t("entry.link.signIn") }}
      accent={t("entry.forgot.accent")}
      promise={{
        headline: t("entry.forgot.headline"),
        points: [t("entry.forgot.point1"), t("entry.forgot.point2"), t("entry.forgot.point3")],
      }}
    >
      <AuthForm action={requestPasswordReset} submitLabel={t("entry.forgot.submit")} pendingLabel={t("entry.forgot.pending")}>
        <Field
          label={t("entry.field.emailAddress")}
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder={t("entry.field.emailPlaceholder")}
          hint={
            <>
              {hintBefore}
              <Link href="/sign-up" className="font-medium text-[var(--wh-primary)] underline-offset-2 hover:underline">
                {t("entry.forgot.hintLink")}
              </Link>
              {hintAfter}
            </>
          }
        />
      </AuthForm>
    </AuthLayout>
  );
}
