import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import withSerwistInit from "@serwist/next";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === "production";
const isTauri = process.env.TAURI_ENV === "1";
const internalHost = process.env.TAURI_DEV_HOST || "localhost";
const standalone = process.env.NEXT_OUTPUT === "standalone";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' https://*.supabase.co https://api.notion.com https://api.github.com https://api.linear.app https://slack.com https://integrate.api.nvidia.com https://api.anthropic.com wss:",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self' https://*.supabase.co https://github.com https://accounts.google.com https://api.notion.com",
    ].join("; "),
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Monorepo: trace from workspace root so Prisma engine binaries are included
  outputFileTracingRoot: resolve(__dirname, "../../"),
  outputFileTracingIncludes: {
    "/*": ["./node_modules/.prisma/**/*", "../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/**/*"],
  },
  ...(!isTauri && standalone && { output: "standalone" }),
  ...(isTauri &&
    !isProd && {
      assetPrefix: `http://${internalHost}:3000`,
    }),
  images: {
    unoptimized: true,
  },
  transpilePackages: [
    "@omnitool/ui",
    "@omnitool/shared",
    "@omnitool/ai",
    "@omnitool/database",
    "@omnitool/integrations",
    "@omnitool/sync",
    "@blocknote/core",
    "@blocknote/react",
  ],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default withSerwist(nextConfig);
