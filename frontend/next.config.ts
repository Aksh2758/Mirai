import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Keep Turbopack scoped to this app when a parent directory has another lockfile.
  turbopack: {
    root: process.cwd(),
  },
  experimental: {
    cpus: 1,
  },
  async headers() {
    return [
      {
        source: "/studio/:path*",
        headers: [
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ]
  },
};

export default nextConfig;
