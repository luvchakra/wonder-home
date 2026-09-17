import { redirect } from "next/navigation";

import { getVerifiedUser } from "@wonderhome/core/db/server";

import { acceptInvitationAction } from "../../(auth)/household-actions";
import { AcceptInvitationForm } from "../../_components/accept-invitation-form";
import { AuthLayout } from "../../_components/auth-layout";

export const metadata = { title: "Join a household" };
export const dynamic = "force-dynamic";

/**
 * Invitation acceptance.
 *
 * The page never says whether the token is valid — that check happens on
 * submit, inside the acceptance function, so simply loading a link cannot be
 * used to test whether an invitation exists.
 */
export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const user = await getVerifiedUser();

  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`);

  return (
    <AuthLayout
      title="Join the household"
      lede="You have been invited to WonderHome. Accepting adds you as a member."
    >
      <AcceptInvitationForm token={token} action={acceptInvitationAction} />
    </AuthLayout>
  );
}
