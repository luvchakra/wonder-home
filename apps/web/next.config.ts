import type { NextConfig } from "next";

import { securityHeaders } from "@wonderhome/core/security/headers";

const nextConfig: NextConfig = {
  transpilePackages: ["@wonderhome/core"],
  poweredByHeader: false,
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
    return [{ source: "/:path*", headers: securityHeaders() }];
  },
};

export default nextConfig;
