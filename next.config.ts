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
  experimental: {
    typedEnv: true,
    // Next 16.3's CLI bridge can emit an empty --showConfig result under
    // restricted/process-isolated builders; the compiler API is deterministic.
    useTypeScriptCli: false,
  },
};

export default nextConfig;
