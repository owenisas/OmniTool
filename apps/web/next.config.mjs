const isProd = process.env.NODE_ENV === "production";
const isTauri = process.env.TAURI_ENV === "1";
const internalHost = process.env.TAURI_DEV_HOST || "localhost";
const standalone = process.env.NEXT_OUTPUT === "standalone";

/** @type {import('next').NextConfig} */
const nextConfig = {
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
};

export default nextConfig;
