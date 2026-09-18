import { PasswordField } from "@wonderhome/core/ui/password-field";

import { resetPassword } from "../(auth)/actions";
import { AuthForm } from "../_components/auth-form";
import { AuthLayout } from "../_components/auth-layout";

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
 */
export default function ResetPasswordPage() {
  return (
    <AuthLayout
      title="Choose a new password"
      lede="Make it something you'll remember. At least 8 characters."
      accent="Almost there."
      promise={{
        headline: "One last step.",
        points: ["Only this link could get here", "It works once", "Then you're straight back in"],
      }}
    >
      <AuthForm action={resetPassword} submitLabel="Save new password" pendingLabel="Saving…">
        <PasswordField
          label="New password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          hint="At least 8 characters."
        />
        <PasswordField
          label="Confirm new password"
          name="confirm"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </AuthForm>
    </AuthLayout>
  );
}
