import type { NextConfig } from "next";

const githubPagesBasePath = "/pokemon-team-helper";

export function createNextConfig(isGitHubPagesBuild: boolean): NextConfig {
  return isGitHubPagesBuild
    ? {
        output: "export",
        basePath: githubPagesBasePath,
        trailingSlash: true
      }
    : {};
}

const nextConfig = createNextConfig(
  process.env.GITHUB_PAGES === "true"
);

export default nextConfig;
