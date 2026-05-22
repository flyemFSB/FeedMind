import type { NextConfig } from "next";

const backendApiUrl = process.env.BACKEND_API_URL ?? "http://localhost:8000";
const agentApiUrl = process.env.AGENT_API_URL ?? "http://localhost:2024";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/agent/:path*",
        destination: `${agentApiUrl}/:path*`,
      },
      {
        source: "/api/:path*",
        destination: `${backendApiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
