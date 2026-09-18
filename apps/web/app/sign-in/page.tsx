import Link from "next/link";

import { googleAuthEnabled } from "@wonderhome/core/config/auth-providers";
import { Alert } from "@wonderhome/core/ui/alert";
import { Field } from "@wonderhome/core/ui/field";
import { PasswordField } from "@wonderhome/core/ui/password-field";

import { signIn, signInWithGoogle } from "../(auth)/actions";
import { AuthForm } from "../_components/auth-form";
import { AuthLayout } from "../_components/auth-layout";
import { AuthDivider, GoogleButton } from "../_components/google-button";

export const metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const google = googleAuthEnabled();

  return (
    <AuthLayout
      title="Welcome back!"
      lede="Good to see you again."
      footer={{ prompt: "Don't have an account?", href: "/sign-up", label: "Sign up" }}
      accent="Same family. Smarter days."
    >
      <div className="space-y-4">
        {/* The callback sends people here when a link could not be used, which
            is the one thing it can say without revealing whose link it was. */}
        {error === "link" ? (
          <Alert tone="attention">
            That link has expired or has already been used. Ask for a new one below.
          </Alert>
        ) : null}

        {google ? (
          <>
            <GoogleButton action={signInWithGoogle} label="Continue with Google" next={next} />
            <AuthDivider />
          </>
        ) : null}

        <AuthForm action={signIn} submitLabel="Sign in" pendingLabel="Signing in…">
          <input type="hidden" name="next" value={next ?? "/"} />
          <Field label="Email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
          <PasswordField
            label="Password"
            name="password"
            autoComplete="current-password"
            required
            action={
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-[var(--wh-primary)] underline-offset-2 hover:underline"
              >
                Forgot password?
              </Link>
            }
          />
        </AuthForm>
      </div>
    </AuthLayout>
  );
}
