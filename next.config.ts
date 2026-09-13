import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @plotguard/rules ships TypeScript source rather than a build artifact, so
  // the app and the backend compile the same files and neither can drift onto
  // a stale dist. Next has to be told to run it through its own pipeline.
  transpilePackages: ["@plotguard/rules"],
  async rewrites() {
    return process.env.NEXT_PUBLIC_API_MOCKING === "disabled"
      ? [
          {
            source: "/api/:path*",
            destination: "http://localhost:3001/api/:path*", // Proxy to NestJS backend
          },
        ]
      : [];
  },
};

export default nextConfig;
