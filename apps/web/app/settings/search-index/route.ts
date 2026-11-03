import { NextResponse } from "next/server";

import { developerApiEnabled } from "@wonderhome/core/developer/keys";
import { translator } from "@wonderhome/core/i18n/translate";
import { en } from "@wonderhome/core/i18n/messages/en";
import { buildSettingsIndex } from "@wonderhome/core/settings-search/build";

import { optionalSession } from "../../_lib/session";

export const dynamic = "force-dynamic";

/**
 * The settings search index for the signed-in person: labels, breadcrumbs and synonyms in
 * their language (English alongside), only for settings they may use. Fetched the first time
 * the search box is used, so no page carries it. Labels only, never household data, and never
 * stored by a shared cache (`security/cache-policy.ts`).
 */
export async function GET() {
  const headers = { "cache-control": "private, no-store" };
  const session = await optionalSession();
  if (!session) return NextResponse.json({ error: "sign_in_required" }, { status: 401, headers });

  const { view, membership, locale } = session;
  const items = buildSettingsIndex(
    {
      isAdmin: view.permissions.includes("household.manage"),
      memberType: membership.memberType,
      canManageIntegrations: view.permissions.includes("integrations.manage"),
      developerAccess: developerApiEnabled(),
    },
    locale.t,
    translator("en", en),
  );
  return NextResponse.json({ items }, { headers });
}
