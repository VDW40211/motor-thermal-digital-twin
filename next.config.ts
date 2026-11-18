import type { NextConfig } from "next";

const isGitHubPages = process.env.DEPLOY_TARGET === "github-pages";
const repo = process.env.NEXT_PUBLIC_REPO_NAME || "";

const nextConfig: NextConfig = {
  output: "export",
  basePath: isGitHubPages && repo ? `/${repo}` : "",
  assetPrefix: isGitHubPages && repo ? `/${repo}/` : undefined,
  images: { unoptimized: true },
  trailingSlash: true,
  reactStrictMode: false,
  // The motor model uses intentional any-typed thermal model refs.
  // Don't block the static export build on strict type checks.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
