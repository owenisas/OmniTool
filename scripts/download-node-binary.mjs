/**
 * Downloads the platform-specific Node.js binary for the Tauri sidecar.
 *
 * Tauri externalBin naming convention:
 *   binaries/<name>-<target_triple>[.exe]
 *
 * Usage:
 *   node scripts/download-node-binary.mjs [--target <triple>]
 *
 * If no --target is given, detects the current platform.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const binDir = path.join(root, "apps/desktop/src-tauri/binaries");

const NODE_VERSION = "22.11.0"; // LTS

// Map platform/arch to Node.js download names and Tauri target triples
const TARGETS = {
  "darwin-arm64": {
    nodeArch: "darwin-arm64",
    tauriTriple: "aarch64-apple-darwin",
  },
  "darwin-x64": {
    nodeArch: "darwin-x64",
    tauriTriple: "x86_64-apple-darwin",
  },
  "linux-x64": {
    nodeArch: "linux-x64",
    tauriTriple: "x86_64-unknown-linux-gnu",
  },
  "linux-arm64": {
    nodeArch: "linux-arm64",
    tauriTriple: "aarch64-unknown-linux-gnu",
  },
  "win32-x64": {
    nodeArch: "win-x64",
    tauriTriple: "x86_64-pc-windows-msvc",
    ext: ".exe",
  },
};

function getCurrentTarget() {
  const key = `${process.platform}-${process.arch}`;
  const target = TARGETS[key];
  if (!target) {
    console.error(`Unsupported platform: ${key}`);
    console.error(`Supported: ${Object.keys(TARGETS).join(", ")}`);
    process.exit(1);
  }
  return target;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--target");
  if (idx !== -1 && args[idx + 1]) {
    const triple = args[idx + 1];
    const match = Object.values(TARGETS).find((t) => t.tauriTriple === triple);
    if (!match) {
      console.error(`Unknown target triple: ${triple}`);
      process.exit(1);
    }
    return match;
  }
  return getCurrentTarget();
}

function downloadFile(url, maxRedirects = 5) {
  if (maxRedirects <= 0) {
    return Promise.reject(new Error("Too many redirects"));
  }
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return downloadFile(res.headers.location, maxRedirects - 1).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        resolve(res);
      })
      .on("error", reject);
  });
}

async function main() {
  const target = parseArgs();
  const ext = target.ext || "";
  const outName = `node-${target.tauriTriple}${ext}`;
  const outPath = path.join(binDir, outName);

  if (fs.existsSync(outPath)) {
    console.log(`Already exists: ${outName}`);
    return;
  }

  fs.mkdirSync(binDir, { recursive: true });

  const isWindows = target.ext === ".exe";
  const archiveName = isWindows
    ? `node-v${NODE_VERSION}-${target.nodeArch}.zip`
    : `node-v${NODE_VERSION}-${target.nodeArch}.tar.gz`;
  const url = `https://nodejs.org/dist/v${NODE_VERSION}/${archiveName}`;

  console.log(`Downloading Node.js v${NODE_VERSION} for ${target.tauriTriple}...`);
  console.log(`  URL: ${url}`);

  if (isWindows) {
    // For Windows, download zip and extract node.exe
    const zipPath = path.join(binDir, archiveName);
    const stream = await downloadFile(url);
    await pipeline(stream, createWriteStream(zipPath));
    // Extract using system unzip or PowerShell
    const nodeExePath = `node-v${NODE_VERSION}-${target.nodeArch}/node.exe`;
    execSync(
      `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${binDir}' -Force"`,
      { stdio: "inherit" }
    );
    fs.renameSync(path.join(binDir, nodeExePath), outPath);
    // Cleanup
    fs.rmSync(path.join(binDir, `node-v${NODE_VERSION}-${target.nodeArch}`), { recursive: true, force: true });
    fs.rmSync(zipPath, { force: true });
  } else {
    // For Unix, download tar.gz and extract the node binary
    const tarPath = path.join(binDir, archiveName);
    const stream = await downloadFile(url);
    await pipeline(stream, createWriteStream(tarPath));
    // Extract just the node binary
    const nodeRelPath = `node-v${NODE_VERSION}-${target.nodeArch}/bin/node`;
    execSync(`tar -xzf "${tarPath}" -C "${binDir}" "${nodeRelPath}"`, {
      stdio: "inherit",
    });
    fs.renameSync(path.join(binDir, nodeRelPath), outPath);
    fs.chmodSync(outPath, 0o755);
    // Cleanup
    fs.rmSync(path.join(binDir, `node-v${NODE_VERSION}-${target.nodeArch}`), { recursive: true, force: true });
    fs.rmSync(tarPath, { force: true });
  }

  console.log(`Done: ${outPath} (${(fs.statSync(outPath).size / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
