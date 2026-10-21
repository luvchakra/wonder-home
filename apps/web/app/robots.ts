import type { MetadataRoute } from "next";

import { robotsRules } from "@wonderhome/core/security/exposure";

/**
 * robots.txt: the landing page and the legal page for search engines, invite
 * links for chat link previews, and nothing at all for AI crawlers
 * (`security/exposure.ts`).
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: robotsRules() };
}
