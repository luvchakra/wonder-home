import { Field } from "@wonderhome/core/ui/field";

import { signUp } from "../(auth)/actions";
import { AuthForm } from "../_components/auth-form";
import { AuthLayout } from "../_components/auth-layout";

export const metadata = { title: "Create an account" };

export default function SignUpPage() {
  return (
    <AuthLayout
      title="Create your account"
      lede="A well-run home gives you more time for what matters."
      footer={{ prompt: "Already have an account?", href: "/sign-in", label: "Sign in" }}
    >
      <AuthForm action={signUp} submitLabel="Create account" pendingLabel="Creating account…">
        <Field
          label="Your name"
          name="displayName"
          autoComplete="name"
          required
          hint="What your family calls you."
        />
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          hint="At least 8 characters."
        />
      </AuthForm>
    </AuthLayout>
  );
}
