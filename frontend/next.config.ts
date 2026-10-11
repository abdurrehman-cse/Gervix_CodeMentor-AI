import type { NextConfig } from "next";
const config: NextConfig = {
  async headers() { return [{ source: "/:path*", headers: [{ key: "Cross-Origin-Opener-Policy", value: "same-origin" }, { key: "Cross-Origin-Embedder-Policy", value: "credentialless" }] }, { source: "/ide/assets/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] }]; },
  async rewrites() { return ["analyze", "health"].map(path => ({ source: `/api/${path}`, destination: `${process.env.API_URL || "http://127.0.0.1:8080"}/api/${path}` })); },
};
export default config;
