import { redirect } from "next/navigation";

import { createClient, getVerifiedUser } from "@wonderhome/core/db/server";
import { listMemberships } from "@wonderhome/core/identity/households";

import { acceptInvitationAction } from "../../(auth)/household-actions";
import { AcceptInvitationForm } from "../../_components/accept-invitation-form";
import { AuthLayout } from "../../_components/auth-layout";
import { memberLocale, visitorLocale } from "../../_lib/entry-locale";

export const metadata = { title: "Join a household" };
export const dynamic = "force-dynamic";

/**
 * Invitation acceptance.
 *
 * The page never says whether the token is valid — that check happens on
 * submit, inside the acceptance function, so simply loading a link cannot be
 * used to test whether an invitation exists.
 *
 * Somebody already in another household reads it in their own language;
 * anybody else in the language their browser asks for.
 */
export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const user = await getVerifiedUser();

  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`);

  const membership = (await listMemberships(await createClient()).catch(() => []))[0];
  const locale = membership ? await memberLocale(membership) : await visitorLocale();
  const { t } = locale;

  return (
    <AuthLayout locale={locale} title={t("entry.invite.title")} lede={t("entry.invite.lede")}>
      <AcceptInvitationForm
        token={token}
        action={acceptInvitationAction}
        labels={{ accept: t("entry.invite.accept"), pending: t("entry.invite.pending") }}
      />
    </AuthLayout>
  );
}
