import Link from "next/link";

import { googleAuthEnabled } from "@wonderhome/core/config/auth-providers";
import { Alert } from "@wonderhome/core/ui/alert";
import { Field } from "@wonderhome/core/ui/field";
import { PasswordField } from "@wonderhome/core/ui/password-field";

import { signIn, signInWithGoogle } from "../(auth)/actions";
import { AuthForm } from "../_components/auth-form";
import { AuthLayout } from "../_components/auth-layout";
import { AuthDivider, GoogleButton } from "../_components/google-button";
import { visitorLocale } from "../_lib/entry-locale";

export const metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const [{ next, error }, locale] = await Promise.all([searchParams, visitorLocale()]);
  const { t } = locale;
  const google = googleAuthEnabled();

  return (
    <AuthLayout
      locale={locale}
      title={t("entry.signIn.title")}
      lede={t("entry.signIn.lede")}
      footer={{ prompt: t("entry.signIn.footerPrompt"), href: "/sign-up", label: t("entry.signIn.footerLink") }}
      accent={t("entry.signIn.accent")}
    >
      <div className="space-y-4">
        {/* The callback sends people here when a link could not be used, which
            is the one thing it can say without revealing whose link it was. */}
        {error === "link" ? <Alert tone="attention">{t("entry.signIn.linkExpired")}</Alert> : null}

        {google ? (
          <>
            <GoogleButton action={signInWithGoogle} label={t("entry.signIn.google")} pendingLabel={t("entry.google.pending")} next={next} />
            <AuthDivider label={t("entry.google.or")} />
          </>
        ) : null}

        <AuthForm action={signIn} submitLabel={t("entry.signIn.submit")} pendingLabel={t("entry.signIn.pending")}>
          <input type="hidden" name="next" value={next ?? "/"} />
          <Field
            label={t("entry.field.email")}
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder={t("entry.field.emailPlaceholder")}
          />
          <PasswordField
            label={t("entry.field.password")}
            name="password"
            autoComplete="current-password"
            required
            showLabel={t("entry.field.showPassword")}
            hideLabel={t("entry.field.hidePassword")}
            action={
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-[var(--wh-primary)] underline-offset-2 hover:underline"
              >
                {t("entry.signIn.forgot")}
              </Link>
            }
          />
        </AuthForm>
      </div>
    </AuthLayout>
  );
}
