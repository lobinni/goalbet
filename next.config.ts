import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow external images from logo CDNs
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "crests.football-data.org",
      },
      {
        protocol: "https",
        hostname: "flagcdn.com",
      },
    ],
  },
};

export default nextConfig;
