import type { NextConfig } from "next";

/**
 * Primary deploy region is Singapore (sin1), set in vercel.json `regions`.
 * Hot API routes also export `preferredRegion = ["sin1"]` for Fluid/edge affinity.
 */
const nextConfig: NextConfig = {
  serverExternalPackages: ["dns"],
};

export default nextConfig;
