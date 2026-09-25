import Link from "next/link";

import { googleAuthEnabled } from "@wonderhome/core/config/auth-providers";
import { Field } from "@wonderhome/core/ui/field";
import { PasswordField } from "@wonderhome/core/ui/password-field";

import { signInWithGoogle, signUp } from "../(auth)/actions";
import { AuthForm } from "../_components/auth-form";
import { AuthLayout } from "../_components/auth-layout";
import { AuthDivider, GoogleButton } from "../_components/google-button";
import { aroundLink, visitorLocale } from "../_lib/entry-locale";

export const metadata = { title: "Create your account" };

/**
 * Sign up (requirements §7).
 *
 * Google appears only where the deployment has it configured — the rule that
 * a "Continue with Google" button going nowhere is worse than none is now
 * enforced at runtime rather than by leaving the feature unbuilt.
 */
export default async function SignUpPage() {
  const locale = await visitorLocale();
  const { t } = locale;
  const google = googleAuthEnabled();
  const [termsBefore, termsAfter] = aroundLink(t, "entry.signUp.terms");

  return (
    <AuthLayout
      locale={locale}
      title={t("entry.signUp.title")}
      lede={t("entry.signUp.lede")}
      footer={{ prompt: t("entry.signUp.footerPrompt"), href: "/sign-in", label: t("entry.link.signIn") }}
      step={{ current: 1, total: 3 }}
      accent={t("entry.signUp.accent")}
    >
      <div className="space-y-4">
        {google ? (
          <>
            <GoogleButton action={signInWithGoogle} label={t("entry.signUp.google")} pendingLabel={t("entry.google.pending")} next="/welcome" />
            <AuthDivider label={t("entry.google.or")} />
          </>
        ) : null}

        <AuthForm action={signUp} submitLabel={t("entry.signUp.submit")} pendingLabel={t("entry.signUp.pending")}>
          <Field
            label={t("entry.signUp.fullName")}
            name="displayName"
            autoComplete="name"
            required
            placeholder={t("entry.signUp.fullNamePlaceholder")}
            hint={t("entry.signUp.fullNameHint")}
          />
          <Field
            label={t("entry.field.emailAddress")}
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder={t("entry.field.emailPlaceholder")}
          />
          <PasswordField
            label={t("entry.field.password")}
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
            hint={t("entry.field.passwordHint")}
            showLabel={t("entry.field.showPassword")}
            hideLabel={t("entry.field.hidePassword")}
          />
          <p className="text-xs text-[var(--wh-foreground-subtle)]">
            {termsBefore}
            <Link href="/legal" className="font-medium text-[var(--wh-primary)] underline-offset-2 hover:underline">
              {t("entry.signUp.termsLink")}
            </Link>
            {termsAfter}
          </p>
        </AuthForm>
      </div>
    </AuthLayout>
  );
}
