import { INVITATION_SIZES, renderInvitation } from "./render-invitation";

/**
 * The link preview (story 26-009): what WhatsApp, Messages or Telegram show,
 * large, when the event's link is sent — the landscape shape, since a chat
 * app only shows a wide picture large. The invitation itself, shaped for a
 * phone, is `card` beside this file. Always rendered fresh, so a new design,
 * a moved time or a turned-off link is what the next share shows (a chat app
 * keeps its own copy of what it already fetched).
 */
export const alt = "An invitation";
export const size = INVITATION_SIZES.landscape;
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function InvitationImage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return renderInvitation(token, "landscape");
}
