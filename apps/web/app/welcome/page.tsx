import { redirect } from "next/navigation";

import { createClient, getVerifiedUser } from "@wonderhome/core/db/server";
import { listMemberships } from "@wonderhome/core/identity/households";
import { Field } from "@wonderhome/core/ui/field";

import { createHouseholdAction } from "../(auth)/actions";
import { AuthForm } from "../_components/auth-form";
import { AuthLayout } from "../_components/auth-layout";
import { visitorLocale } from "../_lib/entry-locale";

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
 * person its owner and Admin (story 01-001).
 *
 * The architecture stays locale-neutral: the time zone is the one household
 * setting that changes behaviour (routines, reminders, quiet hours), so it is
 * the one asked for. Currency and location live with the domains that use them.
 *
 * Nobody here has a household yet, so there is no member row to hold a
 * language: the screen is in the one their browser asks for.
 */
export default async function WelcomePage() {
  const [supabase, verified] = await Promise.all([createClient(), getVerifiedUser()]);
  if (!verified) redirect("/sign-in?next=%2Fwelcome");

  // The display name given at sign-up lives in user metadata, which the
  // token does not carry; this is the one screen that needs it.
  const [memberships, { data: userData }] = await Promise.all([listMemberships(supabase), supabase.auth.getUser()]);
  if (memberships.length > 0) redirect("/");

  const locale = await visitorLocale();
  const { t } = locale;
  const suggestedName =
    typeof userData.user?.user_metadata?.display_name === "string" ? userData.user.user_metadata.display_name : "";

  return (
    <AuthLayout
      locale={locale}
      title={t("entry.welcome.title")}
      lede={t("entry.welcome.lede")}
      step={{ current: 2, total: 3 }}
      accent={t("entry.welcome.accent")}
      promise={{
        headline: t("entry.welcome.accent"),
        points: [t("entry.welcome.point1"), t("entry.welcome.point2"), t("entry.welcome.point3")],
      }}
    >
      <AuthForm action={createHouseholdAction} submitLabel={t("entry.welcome.submit")} pendingLabel={t("entry.welcome.pending")}>
        <Field
          label={t("entry.welcome.householdName")}
          name="householdName"
          required
          placeholder={t("entry.welcome.householdPlaceholder")}
          hint={t("entry.welcome.householdHint")}
        />
        <Field label={t("entry.welcome.yourName")} name="displayName" required defaultValue={suggestedName} hint={t("entry.welcome.yourNameHint")} />
        <div className="space-y-1.5">
          <label htmlFor="timezone" className="block text-sm font-medium">{t("entry.welcome.timezone")}</label>
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
          <p className="text-xs text-[var(--wh-foreground-subtle)]">{t("entry.welcome.timezoneHint")}</p>
        </div>
      </AuthForm>
    </AuthLayout>
  );
}
