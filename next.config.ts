import type { NextConfig } from "next";

const allowedDevOrigins = [
  "127.0.0.1",
  "localhost",
  ...(process.env.DEV_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins,
  async rewrites() {
    return [{ source: "/game-worker/:path*", destination: "http://127.0.0.1:8787/:path*" }];
  },
  experimental: {
    typedEnv: true,
    // Next 16.3's CLI bridge can emit an empty --showConfig result under
    // restricted/process-isolated builders; the compiler API is deterministic.
    useTypeScriptCli: false,
  },
};

export default nextConfig;
