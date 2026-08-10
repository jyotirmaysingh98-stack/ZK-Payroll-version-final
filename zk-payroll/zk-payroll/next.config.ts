import type { NextConfig } from "next";

/**
 * NOTE on the two flags below: they stop TypeScript/ESLint errors from
 * failing a Vercel build, which is useful to avoid a red CI pipeline while
 * iterating. The tradeoff is real: type errors and lint errors can then
 * ship to production silently. For a payroll app moving real funds, the
 * safer long-term setup is to fix errors locally (`npm run build` catches
 * the same errors before you push) and only lean on these flags temporarily.
 */
const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  reactStrictMode: true,
};

export default nextConfig;
