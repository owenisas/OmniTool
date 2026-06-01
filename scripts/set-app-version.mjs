#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

const [, , rawVersion, ...flags] = process.argv;
const checkOnly = flags.includes("--check");

function usage() {
  console.error("Usage: node scripts/set-app-version.mjs <semver> [--check]");
}

function normalizeVersion(value) {
  const version = value?.trim().replace(/^v/, "");
  if (
    !version ||
    !/^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(
      version,
    )
  ) {
    usage();
    process.exit(1);
  }
  return version;
}

const version = normalizeVersion(rawVersion);
const tag = `v${version}`;
const mismatches = [];

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function updateJsonVersion(file) {
  const data = readJson(file);
  if (checkOnly) {
    if (data.version !== version) {
      mismatches.push(`${file}: ${data.version || "missing"}`);
    }
    return;
  }

  data.version = version;
  writeJson(file, data);
}

function updateCargoToml(file) {
  const text = readFileSync(file, "utf8");
  const match = text.match(/^version = "([^"]+)"/m);

  if (checkOnly) {
    if (match?.[1] !== version) {
      mismatches.push(`${file}: ${match?.[1] || "missing"}`);
    }
    return;
  }

  writeFileSync(
    file,
    text.replace(/^version = "[^"]+"/m, `version = "${version}"`),
  );
}

function updateCargoLock(file) {
  const text = readFileSync(file, "utf8");
  const match = text.match(
    /\[\[package\]\]\nname = "omnitool-desktop"\nversion = "([^"]+)"/,
  );

  if (checkOnly) {
    if (match?.[1] !== version) {
      mismatches.push(`${file}: ${match?.[1] || "missing"}`);
    }
    return;
  }

  writeFileSync(
    file,
    text.replace(
      /(\[\[package\]\]\nname = "omnitool-desktop"\nversion = ")[^"]+(")/,
      `$1${version}$2`,
    ),
  );
}

function checkReleaseNotice(file) {
  const notices = readJson(file);
  const notice = notices.find(
    (entry) => entry.version === version || entry.tag === tag,
  );

  if (!notice) {
    if (!checkOnly) {
      console.warn(`Warning: ${file} does not contain ${tag} yet.`);
      return;
    }
    mismatches.push(`${file}: missing ${tag}`);
  }
}

updateJsonVersion("apps/web/package.json");
updateJsonVersion("apps/desktop/package.json");
updateJsonVersion("apps/desktop/src-tauri/tauri.conf.json");
updateCargoToml("apps/desktop/src-tauri/Cargo.toml");
updateCargoLock("apps/desktop/src-tauri/Cargo.lock");
checkReleaseNotice("apps/web/lib/release-notices.json");

if (mismatches.length > 0) {
  console.error(`App version is not ready for ${tag}:`);
  for (const mismatch of mismatches) {
    console.error(`- ${mismatch}`);
  }
  console.error(
    `Run "pnpm version:app ${version}", update apps/web/lib/release-notices.json, commit the changes, then create the tag.`,
  );
  process.exit(1);
}

console.log(
  checkOnly
    ? `App version files and release notice match ${tag}`
    : `Updated app version files to ${tag}`,
);
