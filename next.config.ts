import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  // Keep former entry points working: Open Exploration used to live at /freeplay,
  // and the separate /compare page is now the comparison tab inside Open Exploration.
  async redirects() {
    return [
      { source: "/explore", destination: "/open-exploration", permanent: false },
      { source: "/freeplay", destination: "/open-exploration", permanent: false },
      { source: "/freeplay/:path*", destination: "/open-exploration/:path*", permanent: false },
      { source: "/compare", destination: "/open-exploration", permanent: false },
    ];
  },
};

export default nextConfig;
