import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    typedEnv: true,
    // Next 16.3's CLI bridge can emit an empty --showConfig result under
    // restricted/process-isolated builders; the compiler API is deterministic.
    useTypeScriptCli: false,
  },
};

export default nextConfig;
