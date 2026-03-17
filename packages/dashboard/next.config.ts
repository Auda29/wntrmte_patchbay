import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost", "patchbay.local"],
  devIndicators: {
    position: "bottom-right",
  },
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
};

export default nextConfig;
