import { Field } from "@wonderhome/core/ui/field";

import { signIn } from "../(auth)/actions";
import { AuthForm } from "../_components/auth-form";
import { AuthLayout } from "../_components/auth-layout";

export const metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <AuthLayout
      title="Welcome back"
      lede="Less mental load. More family time."
      footer={{ prompt: "New to WonderHome?", href: "/sign-up", label: "Create an account" }}
    >
      <AuthForm action={signIn} submitLabel="Sign in" pendingLabel="Signing in…">
        <input type="hidden" name="next" value={next ?? "/"} />
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </AuthForm>
    </AuthLayout>
  );
}
