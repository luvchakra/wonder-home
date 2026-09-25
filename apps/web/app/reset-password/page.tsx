import { PasswordField } from "@wonderhome/core/ui/password-field";

import { resetPassword } from "../(auth)/actions";
import { AuthForm } from "../_components/auth-form";
import { AuthLayout } from "../_components/auth-layout";
import { visitorLocale } from "../_lib/entry-locale";

export const metadata = { title: "Choose a new password" };
export const dynamic = "force-dynamic";

/**
 * Setting the new password.
 *
 * Reached only through the emailed link, which the callback has already
 * exchanged for a recovery session. There is no "current password" field and
 * there should not be: the link that arrived at the account's own address is
 * the proof. Without that session Supabase refuses the change, so an expired
 * or already-used link cannot set anything — and the form says so plainly
 * rather than failing silently.
 *
 * The recovery session has no household behind it yet, so the language is
 * the browser's, as on every signed-out screen.
 */
export default async function ResetPasswordPage() {
  const locale = await visitorLocale();
  const { t } = locale;
  const toggle = { showLabel: t("entry.field.showPassword"), hideLabel: t("entry.field.hidePassword") };

  return (
    <AuthLayout
      locale={locale}
      title={t("entry.reset.title")}
      lede={t("entry.reset.lede")}
      footer={{ prompt: t("entry.reset.footerPrompt"), href: "/forgot-password", label: t("entry.reset.footerLink") }}
      accent={t("entry.reset.accent")}
      promise={{
        headline: t("entry.reset.headline"),
        points: [t("entry.reset.point1"), t("entry.reset.point2"), t("entry.reset.point3")],
      }}
    >
      <AuthForm action={resetPassword} submitLabel={t("entry.reset.submit")} pendingLabel={t("common.saving")}>
        <PasswordField
          label={t("entry.reset.newPassword")}
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          hint={t("entry.field.passwordHint")}
          {...toggle}
        />
        <PasswordField
          label={t("entry.reset.confirm")}
          name="confirm"
          autoComplete="new-password"
          required
          minLength={8}
          {...toggle}
        />
      </AuthForm>
    </AuthLayout>
  );
}
