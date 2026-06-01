/**
 * Tauri desktop production build script.
 *
 * Builds the Next.js standalone server and copies it into the Tauri resources
 * directory so it can be bundled as a sidecar. Also generates a splash screen
 * that polls the local server and navigates to it once ready.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

const DESKTOP_PORT = 19283;
const resourceDir = path.join(root, "apps/desktop/src-tauri/resources/server");
const appShellDir = path.join(root, "apps/desktop/app-shell");
const webNextDir = path.join(root, "apps/web/.next");

// ── Step 1: Build Next.js standalone ────────────────────────────────────────
console.log("[desktop-build] Building Next.js standalone server...");
// The desktop build can run after a normal web build in the same Turbo graph.
// Clean generated Next types/output first so the standalone pass cannot read
// stale .next/type roots from a prior build mode.
fs.rmSync(webNextDir, { recursive: true, force: true });
execSync("pnpm --filter @omnitool/web build", {
  stdio: "inherit",
  env: { ...process.env, NEXT_OUTPUT: "standalone" },
});

// ── Step 2: Copy standalone output to Tauri resources ───────────────────────
console.log("[desktop-build] Copying standalone output to resources/server...");

// Clean previous output
if (fs.existsSync(resourceDir)) {
  fs.rmSync(resourceDir, { recursive: true });
}
fs.mkdirSync(resourceDir, { recursive: true });

const standaloneDir = path.join(root, "apps/web/.next/standalone");
const staticDir = path.join(root, "apps/web/.next/static");
const publicDir = path.join(root, "apps/web/public");

if (!fs.existsSync(standaloneDir)) {
  console.error(
    "[desktop-build] ERROR: standalone output not found at",
    standaloneDir,
  );
  console.error(
    "  Make sure NEXT_OUTPUT=standalone is effective in next.config.mjs",
  );
  process.exit(1);
}

// Copy standalone output with symlinks dereferenced. Tauri's bundler strips
// symlinks from resources, so we must resolve them ourselves.
// rsync --copy-links dereferences symlinks while preserving directory structure.
execSync(`rsync -a --copy-links "${standaloneDir}/" "${resourceDir}/"`, {
  stdio: "inherit",
});

// Copy static assets into the correct location
const destStatic = path.join(resourceDir, "apps/web/.next/static");
fs.mkdirSync(path.dirname(destStatic), { recursive: true });
execSync(`rsync -a --copy-links "${staticDir}/" "${destStatic}/"`, {
  stdio: "inherit",
});

// Copy public assets
const destPublic = path.join(resourceDir, "apps/web/public");
fs.mkdirSync(path.dirname(destPublic), { recursive: true });
execSync(`rsync -a --copy-links "${publicDir}/" "${destPublic}/"`, {
  stdio: "inherit",
});

// ── Step 2b: Fix pnpm module resolution for bundled environment ─────────────
// pnpm relies on symlinks for dependency resolution. Since Tauri strips symlinks,
// we hoist all packages from .pnpm virtual stores to their expected locations.
console.log("[desktop-build] Hoisting pnpm dependencies...");
hoistPnpmDeps(resourceDir);

// ── Step 2b.5: Wrap node binary so the Dock doesn't show / bounce a Node icon
// On macOS, place node inside a NodeSidecar.app/Contents/MacOS/ structure with
// LSUIElement+LSBackgroundOnly Info.plist. On Linux/Windows, just copy to
// resources/server/bin/node[.exe]. The Rust resolver looks at both layouts.
console.log("[desktop-build] Wrapping node sidecar...");
wrapNodeSidecar(resourceDir);

// ── Step 2c: Remove .env files from standalone output ─────────────────────
// Next.js standalone copies .env files from the project. These contain web/dev
// credentials that conflict with the desktop server.env values passed via
// Rust process env. Remove them so server.env takes precedence.
const envFiles = [
  path.join(resourceDir, ".env"),
  path.join(resourceDir, ".env.local"),
  path.join(resourceDir, ".env.production"),
  path.join(resourceDir, "apps/web/.env"),
  path.join(resourceDir, "apps/web/.env.local"),
  path.join(resourceDir, "apps/web/.env.production"),
];
for (const envFile of envFiles) {
  if (fs.existsSync(envFile)) {
    fs.rmSync(envFile);
    console.log(
      `[desktop-build] Removed ${path.relative(resourceDir, envFile)}`,
    );
  }
}

// ── Step 2d: Verify server.env is NOT inside the bundled subtree ──────────
// `tauri.conf.json` bundles only `resources/server/` (not the parent
// `resources/` dir). That keeps `apps/desktop/src-tauri/resources/server.env`
// — which contains real secrets (INTEGRATION_ENCRYPTION_KEY, AUTH_SECRET,
// GITHUB_CLIENT_SECRET, DATABASE_URL) — outside the DMG. Production secrets
// must be provisioned per-machine into
// `~/Library/Application Support/dev.omnitool.app/server.env`
// via `scripts/desktop-install-env.sh`.
//
// The check below catches accidental drift if anyone moves server.env into
// the bundled subtree or relaxes the `resources` glob in tauri.conf.json.
const accidentallyBundled = [
  path.join(resourceDir, "server.env"),
  path.join(resourceDir, ".env"),
  path.join(resourceDir, ".env.local"),
  path.join(resourceDir, ".env.production"),
];
for (const f of accidentallyBundled) {
  if (fs.existsSync(f)) {
    console.error(
      `[desktop-build] FATAL: ${path.relative(root, f)} is inside the bundle — secrets would ship in the DMG. Move it out of resources/server/.`,
    );
    process.exit(1);
  }
}

console.log("[desktop-build] Server resources ready.");

// ── Step 3: Ensure Node.js binary exists for current platform ───────────────
const binDir = path.join(root, "apps/desktop/src-tauri/binaries");
const existingBins = fs.existsSync(binDir)
  ? fs.readdirSync(binDir).filter((f) => f.startsWith("node-"))
  : [];

if (existingBins.length === 0) {
  console.log("[desktop-build] Downloading Node.js binary for sidecar...");
  execSync("node scripts/download-node-binary.mjs", {
    stdio: "inherit",
    cwd: root,
  });
} else {
  console.log(`[desktop-build] Node.js binary found: ${existingBins[0]}`);
}

// ── Step 4: Generate splash screen ──────────────────────────────────────────
console.log("[desktop-build] Generating splash screen...");
fs.mkdirSync(appShellDir, { recursive: true });
fs.copyFileSync(
  path.join(publicDir, "brand/omnitool-logo-dark.png"),
  path.join(appShellDir, "omnitool-logo-dark.png"),
);
fs.writeFileSync(
  path.join(appShellDir, "index.html"),
  generateSplashHtml(DESKTOP_PORT),
);

console.log("[desktop-build] Done.");

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Place the prebuilt node binary into a tiny `.app` wrapper (macOS) or a
 * plain `bin/` directory (Linux/Windows) inside the bundled `resources/server/`
 * tree, so it ships with the Tauri app and the Rust resolver can find it.
 *
 * On macOS the wrapper carries `LSUIElement=1` + `LSBackgroundOnly=1` in its
 * Info.plist, which Launch Services reads when spawning the binary —
 * suppressing the Dock icon and the bouncing-on-launch animation.
 */
function wrapNodeSidecar(serverDir) {
  const triple = nodeTargetTriple();
  const ext = process.platform === "win32" ? ".exe" : "";
  const srcBin = path.join(
    root,
    "apps/desktop/src-tauri/binaries",
    `node-${triple}${ext}`,
  );

  if (!fs.existsSync(srcBin)) {
    console.error(
      `[desktop-build] ERROR: node binary not found at ${srcBin}. Run: node scripts/download-node-binary.mjs`,
    );
    process.exit(1);
  }

  if (process.platform === "darwin") {
    const wrapperApp = path.join(serverDir, "NodeSidecar.app");
    const macosDir = path.join(wrapperApp, "Contents/MacOS");
    fs.mkdirSync(macosDir, { recursive: true });

    const destBin = path.join(macosDir, "node");
    // -p preserves perms (the +x bit set by download-node-binary.mjs).
    execSync(`cp -p "${srcBin}" "${destBin}"`, { stdio: "pipe" });
    fs.chmodSync(destBin, 0o755);

    const plistPath = path.join(wrapperApp, "Contents/Info.plist");
    fs.writeFileSync(plistPath, nodeSidecarInfoPlist(), "utf8");

    console.log(
      `[desktop-build] Wrote NodeSidecar.app (LSUIElement=1) at ${path.relative(root, wrapperApp)}`,
    );
  } else {
    // Linux / Windows: no Dock; just copy the binary into a predictable location.
    const binDir = path.join(serverDir, "bin");
    fs.mkdirSync(binDir, { recursive: true });
    const destBin = path.join(binDir, `node${ext}`);
    execSync(`cp -p "${srcBin}" "${destBin}"`, { stdio: "pipe" });
    fs.chmodSync(destBin, 0o755);
    console.log(
      `[desktop-build] Copied node sidecar to ${path.relative(root, destBin)}`,
    );
  }
}

function nodeTargetTriple() {
  const key = `${process.platform}-${process.arch}`;
  const map = {
    "darwin-arm64": "aarch64-apple-darwin",
    "darwin-x64": "x86_64-apple-darwin",
    "linux-x64": "x86_64-unknown-linux-gnu",
    "linux-arm64": "aarch64-unknown-linux-gnu",
    "win32-x64": "x86_64-pc-windows-msvc",
  };
  const t = map[key];
  if (!t) {
    console.error(
      `[desktop-build] Unsupported platform for sidecar wrap: ${key}`,
    );
    process.exit(1);
  }
  return t;
}

function nodeSidecarInfoPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>CFBundleIdentifier</key>
\t<string>dev.omnitool.app.node-sidecar</string>
\t<key>CFBundleName</key>
\t<string>OmniTool Server</string>
\t<key>CFBundleExecutable</key>
\t<string>node</string>
\t<key>CFBundlePackageType</key>
\t<string>APPL</string>
\t<key>CFBundleVersion</key>
\t<string>22.11.0</string>
\t<key>CFBundleShortVersionString</key>
\t<string>22.11.0</string>
\t<key>LSUIElement</key>
\t<true/>
\t<key>LSBackgroundOnly</key>
\t<true/>
\t<key>NSHumanReadableCopyright</key>
\t<string>Bundled Node.js runtime for OmniTool</string>
</dict>
</plist>
`;
}

// Hoist pnpm .pnpm packages to top-level node_modules for symlink-free environments.
// Walks all node_modules/.pnpm/{pkg}/node_modules/{dep} and creates copies at the
// parent node_modules level so standard Node.js resolution works.
function hoistPnpmDeps(serverDir) {
  const nodeModulesDirs = findNodeModulesDirs(serverDir);

  for (const nmDir of nodeModulesDirs) {
    const pnpmDir = path.join(nmDir, ".pnpm");
    if (!fs.existsSync(pnpmDir)) continue;

    // Collect all packages from .pnpm virtual store
    const entries = fs.readdirSync(pnpmDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === "node_modules") continue;
      const innerNm = path.join(pnpmDir, entry.name, "node_modules");
      if (!fs.existsSync(innerNm)) continue;

      const packages = fs.readdirSync(innerNm, { withFileTypes: true });
      for (const pkg of packages) {
        // Skip .pnpm and already-existing entries
        if (pkg.name.startsWith(".")) continue;
        const targetPath = path.join(nmDir, pkg.name);
        if (fs.existsSync(targetPath)) continue;

        const srcPath = path.join(innerNm, pkg.name);
        // Handle scoped packages (@org/package)
        if (pkg.name.startsWith("@") && pkg.isDirectory()) {
          const scopeEntries = fs.readdirSync(srcPath, { withFileTypes: true });
          fs.mkdirSync(targetPath, { recursive: true });
          for (const scopeEntry of scopeEntries) {
            const scopeTarget = path.join(targetPath, scopeEntry.name);
            if (fs.existsSync(scopeTarget)) continue;
            const scopeSrc = path.join(srcPath, scopeEntry.name);
            if (scopeEntry.isDirectory()) {
              execSync(`cp -R "${scopeSrc}" "${scopeTarget}"`, {
                stdio: "pipe",
              });
            }
          }
        } else if (pkg.isDirectory()) {
          execSync(`cp -R "${srcPath}" "${targetPath}"`, { stdio: "pipe" });
        }
      }
    }
  }
}

/**
 * Find all node_modules directories in the server output.
 */
function findNodeModulesDirs(dir) {
  const result = [];
  const candidates = [
    path.join(dir, "node_modules"),
    path.join(dir, "apps/web/node_modules"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) result.push(c);
  }
  return result;
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else if (entry.isSymbolicLink()) {
      // Always dereference symlinks for portability in bundled resources
      try {
        const realPath = fs.realpathSync(srcPath);
        const stat = fs.statSync(realPath);
        if (stat.isDirectory()) {
          copyRecursive(realPath, destPath);
        } else {
          fs.copyFileSync(realPath, destPath);
        }
      } catch {
        // Broken symlink — skip
      }
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function generateSplashHtml(port) {
  return `<!DOCTYPE html>
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
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }
    .brand-mark {
      width: 96px;
      height: 96px;
      object-fit: contain;
      border-radius: 18px;
    }
    .logo-text {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: 0;
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
    <div class="logo" aria-label="OmniTool">
      <img class="brand-mark" src="./omnitool-logo-dark.png" alt="" />
      <div class="logo-text">OmniTool</div>
    </div>
    <div class="spinner" id="spinner"></div>
    <div class="status" id="status">Starting server&hellip;</div>
  </div>
  <div class="error" id="error">
    <div class="logo" aria-label="OmniTool">
      <img class="brand-mark" src="./omnitool-logo-dark.png" alt="" />
      <div class="logo-text">OmniTool</div>
    </div>
    <p>Server failed to start.</p>
    <button class="retry-btn" id="retryBtn">Try Again</button>
  </div>
  <script>
    const PORT = ${port};
    const TARGET_URL = "http://localhost:" + PORT;
    const READY_URL = TARGET_URL + "/api/ready";
    const TIMEOUT_MS = 15000;
    const POLL_INTERVAL_MS = 300;

    async function waitForServer() {
      document.getElementById("splash").classList.remove("hidden");
      document.getElementById("error").classList.remove("visible");
      document.getElementById("status").textContent = "Starting server\\u2026";

      const deadline = Date.now() + TIMEOUT_MS;
      let attempt = 0;

      while (Date.now() < deadline) {
        attempt++;
        try {
          // Use no-cors: splash is served from tauri:// origin, server is http://
          // Any response (even opaque) means the server is up and ready.
          await fetch(READY_URL, { mode: "no-cors" });
          document.getElementById("status").textContent = "Loading\\u2026";
          window.location.replace(TARGET_URL);
          return;
        } catch {
          // Server not ready yet — fetch throws on network error
        }
        if (attempt === 5) {
          document.getElementById("status").textContent = "Warming up\\u2026";
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }

      // Timeout — show error
      document.getElementById("splash").classList.add("hidden");
      document.getElementById("error").classList.add("visible");
    }

    document.getElementById("retryBtn").addEventListener("click", waitForServer);
    waitForServer();
  </script>
</body>
</html>
`;
}
