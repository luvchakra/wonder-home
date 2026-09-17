import { redirect } from "next/navigation";

import { createClient } from "@wonderhome/core/db/server";
import { listMemberships } from "@wonderhome/core/identity/households";
import { Field } from "@wonderhome/core/ui/field";

import { createHouseholdAction } from "../(auth)/actions";
import { AuthForm } from "../_components/auth-form";
import { AuthLayout } from "../_components/auth-layout";

export const metadata = { title: "Create your household" };
export const dynamic = "force-dynamic";

/**
 * Onboarding: the first household. Creating it makes this person its Head of
 * Family (story 01-001).
 *
 * Someone who already belongs to a household does not need this screen, so they
 * go Home rather than being invited to create a second one by accident.
 */
export default async function WelcomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in?next=%2Fwelcome");

  const memberships = await listMemberships(supabase);
  if (memberships.length > 0) redirect("/");

  const suggestedName =
    typeof user.user_metadata?.display_name === "string" ? user.user_metadata.display_name : "";

  return (
    <AuthLayout
      title="Create your household"
      lede="WonderHome manages the outcomes. You get the time back."
    >
      <AuthForm
        action={createHouseholdAction}
        submitLabel="Create household"
        pendingLabel="Creating household…"
      >
        <Field
          label="Household name"
          name="householdName"
          required
          placeholder="Chakraborty Home"
          hint="What your family calls home."
        />
        <Field
          label="Your name"
          name="displayName"
          required
          defaultValue={suggestedName}
          hint="You will be the Head of Family and can invite others next."
        />
        <Field
          label="Time zone"
          name="timezone"
          defaultValue="Asia/Kolkata"
          hint="Used for routines, reminders and quiet hours."
        />
      </AuthForm>
    </AuthLayout>
  );
}
