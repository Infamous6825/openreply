import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Dashboard is reached through the ngrok tunnel in local dev, so the dev
  // server must accept dev-asset requests (HMR, fonts) from that host too.
  // Dev-only; the production build has no dev endpoints to guard.
  allowedDevOrigins: ["uncommon-famished-partner.ngrok-free.dev"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
