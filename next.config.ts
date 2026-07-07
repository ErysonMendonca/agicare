import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @ts-ignore
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
