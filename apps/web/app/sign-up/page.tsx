import { Field } from "@wonderhome/core/ui/field";

import { signUp } from "../(auth)/actions";
import { AuthForm } from "../_components/auth-form";
import { AuthLayout } from "../_components/auth-layout";

export const metadata = { title: "Create your account" };

/**
 * Sign up (requirements §7). Email only, because no social identity provider
 * is configured — and per the no-fake-functionality rule a "Continue with
 * Google" button that goes nowhere is worse than none. The option appears the
 * day a provider is actually wired up.
 */
export default function SignUpPage() {
  return (
    <AuthLayout
      title="Create your account"
      lede="Join families building happier homes together."
      footer={{ prompt: "Already have an account?", href: "/sign-in", label: "Sign in" }}
      step={{ current: 1, total: 3 }}
    >
      <AuthForm action={signUp} submitLabel="Create account" pendingLabel="Creating account…">
        <Field label="Full name" name="displayName" autoComplete="name" required placeholder="Kunal Chakraborty" hint="What your family calls you." />
        <Field label="Email address" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          hint="At least 8 characters."
        />
        <p className="text-xs text-[var(--wh-foreground-subtle)]">
          By creating an account you agree to our Terms of Service and Privacy Policy. Your household&apos;s data
          is never used to train models by default.
        </p>
      </AuthForm>
    </AuthLayout>
  );
}
