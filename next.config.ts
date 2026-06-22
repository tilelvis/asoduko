import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the dev server (HMR, assets) to be reached through ngrok tunnels.
  allowedDevOrigins: [
    "*.ngrok-free.app",
    "*.ngrok.app",
    "*.ngrok.dev",
    "*.ngrok.io",
  ],
};

export default nextConfig;
