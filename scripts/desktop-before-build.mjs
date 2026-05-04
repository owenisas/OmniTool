/**
 * Tauri production bundles cannot embed a full Next.js server. The desktop shell
 * loads the hosted web app in a generated static HTML redirect (see tauri.conf.json).
 * This script runs `next build` (CI/typecheck of the app) and writes `app-shell/index.html`.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

const url =
  process.env.OMNITOOL_DESKTOP_URL ||
  process.env.NEXT_PUBLIC_OMNITOOL_WEB_URL ||
  process.env.AUTH_URL ||
  "http://127.0.0.1:3000";

const safe = String(url).replaceAll('"', "&quot;");
const target = path.join(root, "apps/desktop/app-shell/index.html");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(
  target,
  `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="refresh" content="0;url=${safe}" />
  <title>OmniTool</title>
</head>
<body>
  <p>Opening OmniTool at <a href="${safe}">${safe}</a>…</p>
</body>
</html>
`,
);

execSync("pnpm --filter @omnitool/web build", { stdio: "inherit" });
