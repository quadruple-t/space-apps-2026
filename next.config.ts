import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  // The surface drive and approach planner moved into Freeplay; keep old links (and their query) working.
  async redirects() {
    return [
      { source: "/explore", destination: "/freeplay/drive", permanent: false },
      { source: "/explore/approach", destination: "/freeplay/approach", permanent: false },
    ];
  },
};

export default nextConfig;
