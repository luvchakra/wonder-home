import type { NextConfig } from "next";

import { securityHeaders } from "@wonderhome/core/security/headers";

const nextConfig: NextConfig = {
  transpilePackages: ["@wonderhome/core"],
  poweredByHeader: false,
  // Icon and primitive libraries are imported by name; this keeps each route's
  // bundle to the handful it actually renders.
  experimental: { optimizePackageImports: ["lucide-react", "radix-ui"] },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders() }];
  },
};

export default nextConfig;
