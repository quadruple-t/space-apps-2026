import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  // Keep the former explore entry point working.
  async redirects() {
    return [
      { source: "/explore", destination: "/freeplay/drive", permanent: false },
    ];
  },
};

export default nextConfig;
