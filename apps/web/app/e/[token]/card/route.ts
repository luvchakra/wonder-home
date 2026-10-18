import { renderInvitation } from "../render-invitation";

/**
 * The invitation as a tall picture (1080×1350), shaped for a phone: what
 * "Share invitation" sends as an image, with the link beside it. The same
 * design, words and credential (the token) as the page.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return renderInvitation(token, "portrait");
}
