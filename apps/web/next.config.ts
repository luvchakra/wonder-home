import type { NextConfig } from "next";

import { securityHeaders } from "@wonderhome/core/security/headers";

const nextConfig: NextConfig = {
  transpilePackages: ["@wonderhome/core"],
  poweredByHeader: false,
  // The invitation postcard reads its fonts from disk at request time.
  outputFileTracingIncludes: { "/e/[token]/opengraph-image": ["./assets/invite/**"], "/e/[token]/card": ["./assets/invite/**"] },
  // Icon and primitive libraries are imported by name; this keeps each route's
  // bundle to the handful it actually renders.
  experimental: {
    optimizePackageImports: ["lucide-react", "radix-ui"],
    // HomeSend's upload forms post a photo, PDF or voice note to a Server
    // Action. Next's 1 MB default refused most phone photos outright; this
    // matches the 4 MB the upload forms promise (the hosting platform's own
    // request-body ceiling is 4.5 MB, so larger files need a direct upload).
    serverActions: { bodySizeLimit: "4.5mb" },
  },
  async headers() {
    // The user guide is for signed-in members: never stored by a shared
    // cache or the browser's back-forward cache, and never indexed.
    const membersOnly = [
      { key: "Cache-Control", value: "private, no-store, max-age=0" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ];
    return [
      { source: "/:path*", headers: securityHeaders() },
      { source: "/help", headers: membersOnly },
      { source: "/help/:path*", headers: membersOnly },
    ];
  },
};

export default nextConfig;
