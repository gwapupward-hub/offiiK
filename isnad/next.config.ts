import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    // Stable external MCP path; the destination retains all existing release and security gates.
    return [{ source: "/mcp", destination: "/api/mcp" }];
  },
  outputFileTracingIncludes: {
    "/api/mcp": ["./knowledge/*.md", "./LICENSE"],
  },
};

export default nextConfig;
