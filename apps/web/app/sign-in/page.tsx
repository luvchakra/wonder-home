import { Field } from "@wonderhome/core/ui/field";

import { signIn } from "../(auth)/actions";
import { AuthForm } from "../_components/auth-form";
import { AuthLayout } from "../_components/auth-layout";

export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;

  return (
    <AuthLayout
      title="Welcome back!"
      lede="Good to see you again."
      footer={{ prompt: "Don't have an account?", href: "/sign-up", label: "Sign up" }}
    >
      <AuthForm action={signIn} submitLabel="Sign in" pendingLabel="Signing in…">
        <input type="hidden" name="next" value={next ?? "/"} />
        <Field label="Email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
      </AuthForm>
    </AuthLayout>
  );
}
