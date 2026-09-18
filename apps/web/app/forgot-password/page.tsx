import Link from "next/link";

import { Field } from "@wonderhome/core/ui/field";

import { requestPasswordReset } from "../(auth)/actions";
import { AuthForm } from "../_components/auth-form";
import { AuthLayout } from "../_components/auth-layout";

export const metadata = { title: "Reset your password" };

/**
 * Asking for a new password.
 *
 * The answer is the same whichever address is typed, so this screen cannot be
 * used to find out who has an account. That is also why the confirmation is a
 * notice on this page rather than a redirect: a redirect that only happened
 * for real accounts would leak exactly what the wording is protecting.
 */
export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      title="Reset your password"
      lede="We'll email you a link to set a new one."
      footer={{ prompt: "Remembered it?", href: "/sign-in", label: "Sign in" }}
      accent="Happens to everyone."
      promise={{
        headline: "Back in, in a minute.",
        points: ["A link, not a password, by email", "It expires in an hour", "One use only"],
      }}
    >
      <AuthForm action={requestPasswordReset} submitLabel="Send reset link" pendingLabel="Sending…">
        <Field
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          hint={
            <>
              The address you signed up with. Not sure?{" "}
              <Link href="/sign-up" className="font-medium text-[var(--wh-primary)] underline-offset-2 hover:underline">
                Create an account
              </Link>
              .
            </>
          }
        />
      </AuthForm>
    </AuthLayout>
  );
}
