import type { NextConfig } from "next";

/**
 * Next.js configuration — optimized for GitHub Pages / static export.
 *
 * If deploying to GitHub Pages under a project subpath
 * (https://<user>.github.io/<repo>/), set the NEXT_PUBLIC_BASE_PATH
 * env var to "/<repo>".
 */
const isGitHubPages = process.env.DEPLOY_TARGET === "github-pages";
const repo = process.env.NEXT_PUBLIC_REPO_NAME || "";

const nextConfig: NextConfig = {
  // Static HTML export — runs 100% client-side, no Node server needed.
  output: "export",

  // GitHub Pages serves from a subpath; configure basePath + assetPrefix.
  basePath: isGitHubPages && repo ? `/${repo}` : "",
  assetPrefix: isGitHubPages && repo ? `/${repo}/` : undefined,

  // Required for static export (no Next.js image optimizer on static hosts).
  images: {
    unoptimized: true,
  },

  // Trailing slash on directories so relative asset URLs resolve on Pages.
  trailingSlash: true,

  reactStrictMode: false,
};

export default nextConfig;
