import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @plotguard/rules ships TypeScript source rather than a build artifact, so
  // the app and the backend compile the same files and neither can drift onto
  // a stale dist. Next has to be told to run it through its own pipeline.
  transpilePackages: ["@plotguard/rules"],
};

export default nextConfig;
