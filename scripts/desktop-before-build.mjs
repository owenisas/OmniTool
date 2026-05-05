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
  <title>OmniTool</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #0a0a0b;
      color: #e4e4e7;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      overflow: hidden;
    }
    .splash {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
    }
    .logo {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #fff;
    }
    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid rgba(255,255,255,0.15);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .status {
      font-size: 14px;
      color: #a1a1aa;
      min-height: 20px;
    }
    .error { display: none; text-align: center; }
    .error.visible { display: flex; flex-direction: column; align-items: center; gap: 16px; }
    .error p { font-size: 14px; color: #ef4444; }
    .retry-btn {
      padding: 8px 20px;
      font-size: 14px;
      font-weight: 500;
      color: #fff;
      background: #27272a;
      border: 1px solid #3f3f46;
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .retry-btn:hover { background: #3f3f46; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="splash" id="splash">
    <div class="logo">OmniTool</div>
    <div class="spinner" id="spinner"></div>
    <div class="status" id="status">Connecting&hellip;</div>
  </div>
  <div class="error" id="error">
    <div class="logo">OmniTool</div>
    <p>Server unreachable &mdash; unable to connect.</p>
    <button class="retry-btn" id="retryBtn">Try Again</button>
  </div>
  <script>
    const TARGET_URL = "${safe}";
    const TIMEOUT_MS = 5000;

    async function tryConnect() {
      document.getElementById("splash").classList.remove("hidden");
      document.getElementById("error").classList.remove("visible");
      document.getElementById("status").textContent = "Connecting\\u2026";

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        await fetch(TARGET_URL, { mode: "no-cors", signal: controller.signal });
        clearTimeout(timer);
        document.getElementById("status").textContent = "Loading\\u2026";
        window.location.replace(TARGET_URL);
      } catch {
        clearTimeout(timer);
        document.getElementById("splash").classList.add("hidden");
        document.getElementById("error").classList.add("visible");
      }
    }

    document.getElementById("retryBtn").addEventListener("click", tryConnect);
    tryConnect();
  </script>
</body>
</html>
`,
);

execSync("pnpm --filter @omnitool/web build", { stdio: "inherit" });
