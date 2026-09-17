import { redirect } from "next/navigation";

import { createClient, getVerifiedUser } from "@wonderhome/core/db/server";
import { listMemberships } from "@wonderhome/core/identity/households";
import { Field } from "@wonderhome/core/ui/field";

import { createHouseholdAction } from "../(auth)/actions";
import { AuthForm } from "../_components/auth-form";
import { AuthLayout } from "../_components/auth-layout";

export const metadata = { title: "Set up your household" };
export const dynamic = "force-dynamic";

const COMMON_ZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney",
];

/**
 * Household setup (requirements §8), step 2 of 3. Creating it makes this
 * person its Head of Family (story 01-001).
 *
 * The architecture stays locale-neutral: the time zone is the one household
 * setting that changes behaviour (routines, reminders, quiet hours), so it is
 * the one asked for. Currency and location live with the domains that use them.
 */
export default async function WelcomePage() {
  const [supabase, verified] = await Promise.all([createClient(), getVerifiedUser()]);
  if (!verified) redirect("/sign-in?next=%2Fwelcome");

  // The display name given at sign-up lives in user metadata, which the
  // token does not carry; this is the one screen that needs it.
  const [memberships, { data: userData }] = await Promise.all([listMemberships(supabase), supabase.auth.getUser()]);
  if (memberships.length > 0) redirect("/");

  const suggestedName =
    typeof userData.user?.user_metadata?.display_name === "string" ? userData.user.user_metadata.display_name : "";

  return (
    <AuthLayout
      title="Set up your household"
      lede="Create a space for the people, pets and plans you care about."
      step={{ current: 2, total: 3 }}
      promise={{
        headline: "Let's build a happier home together.",
        points: ["You become Head of Family", "Invite everyone next", "WonderHome starts learning your rhythm"],
      }}
    >
      <AuthForm action={createHouseholdAction} submitLabel="Create household" pendingLabel="Creating household…">
        <Field label="Household name" name="householdName" required placeholder="Chakraborty Family" hint="What your family calls home." />
        <Field label="Your name" name="displayName" required defaultValue={suggestedName} hint="You will be the Head of Family." />
        <div className="space-y-1.5">
          <label htmlFor="timezone" className="block text-sm font-medium">Time zone</label>
          <input
            id="timezone"
            name="timezone"
            list="wh-zones"
            defaultValue="Asia/Kolkata"
            className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
          />
          <datalist id="wh-zones">
            {COMMON_ZONES.map((zone) => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
          <p className="text-xs text-[var(--wh-foreground-subtle)]">Used for routines, reminders and quiet hours.</p>
        </div>
      </AuthForm>
    </AuthLayout>
  );
}
