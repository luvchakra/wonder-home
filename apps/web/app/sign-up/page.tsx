import { googleAuthEnabled } from "@wonderhome/core/config/auth-providers";
import { Field } from "@wonderhome/core/ui/field";
import { PasswordField } from "@wonderhome/core/ui/password-field";

import { signInWithGoogle, signUp } from "../(auth)/actions";
import { AuthForm } from "../_components/auth-form";
import { AuthLayout } from "../_components/auth-layout";
import { AuthDivider, GoogleButton } from "../_components/google-button";

export const metadata = { title: "Create your account" };

/**
 * Sign up (requirements §7).
 *
 * Google appears only where the deployment has it configured — the rule that
 * a "Continue with Google" button going nowhere is worse than none is now
 * enforced at runtime rather than by leaving the feature unbuilt.
 */
export default function SignUpPage() {
  const google = googleAuthEnabled();

  return (
    <AuthLayout
      title="Create your account"
      lede="Join families building happier homes together."
      footer={{ prompt: "Already have an account?", href: "/sign-in", label: "Sign in" }}
      step={{ current: 1, total: 3 }}
      accent="A brighter tomorrow starts at home."
    >
      <div className="space-y-4">
        {google ? (
          <>
            <GoogleButton action={signInWithGoogle} label="Sign up with Google" next="/welcome" />
            <AuthDivider />
          </>
        ) : null}

        <AuthForm action={signUp} submitLabel="Create account" pendingLabel="Creating account…">
          <Field label="Full name" name="displayName" autoComplete="name" required placeholder="Kunal Chakraborty" hint="What your family calls you." />
          <Field label="Email address" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
          <PasswordField
            label="Password"
            name="password"
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
      </div>
    </AuthLayout>
  );
}
