import type { NextConfig } from "next";

const thumbnailHosts = [
  "https://assets.st-note.com",
  "https://nonbirimaru.net",
  "https://liberty-note.com"
].join(" ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `img-src 'self' data: ${thumbnailHosts};`
          }
        ]
      }
    ];
  }
};

export default nextConfig;
