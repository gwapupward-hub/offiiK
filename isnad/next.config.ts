import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/mcp": ["./knowledge/*.md", "./LICENSE"],
  },
};

export default nextConfig;
