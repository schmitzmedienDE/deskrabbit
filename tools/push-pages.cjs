#!/usr/bin/env node
/**
 * Stamp push time, bust caches, commit, push to origin (GitHub Pages).
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const PAGES = "https://schmitzmediende.github.io/deskrabbit/";

function berlinStamp(d) {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
}

function bustAssets(html, tag) {
  return html
    .replace(/(href=")(css\/[^"]+\.css)(\?v=[^"]*)?(")/g, `$1$2?v=${tag}$4`)
    .replace(/(src=")(js\/[^"]+\.js)(\?v=[^"]*)?(")/g, `$1$2?v=${tag}$4`);
}

function fetchPng(payload) {
  return new Promise((resolve, reject) => {
    const enc = encodeURIComponent(payload);
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&ecc=M&data=${enc}`;
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error("qr http " + res.statusCode));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });
}

function git(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8" }).trim();
}

async function main() {
  const now = new Date();
  const tag = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  let commit = "pending";
  try {
    commit = git("git rev-parse --short HEAD");
  } catch (_) {}

  const version = {
    pushedAtISO: now.toISOString(),
    pushedAtLocal: berlinStamp(now),
    commit,
    cache: tag,
  };
  fs.writeFileSync(path.join(ROOT, "version.json"), JSON.stringify(version, null, 2) + "\n");

  const creationPath = path.join(ROOT, "creation.json");
  const meta = JSON.parse(fs.readFileSync(creationPath, "utf8"));
  meta.url = `${PAGES}?v=${tag}`;
  fs.writeFileSync(creationPath, JSON.stringify(meta, null, 2) + "\n");

  const indexPath = path.join(ROOT, "index.html");
  fs.writeFileSync(indexPath, bustAssets(fs.readFileSync(indexPath, "utf8"), tag));

  try {
    const png = await fetchPng(JSON.stringify(meta));
    fs.writeFileSync(path.join(ROOT, "qr.png"), png);
  } catch (e) {
    console.warn("qr skip", e.message);
  }

  git("git add -A");
  const staged = git("git diff --cached --name-only");
  if (staged) {
    git(`git commit -m ${JSON.stringify("DeskRabbit " + version.pushedAtLocal)}`);
  }
  version.commit = git("git rev-parse --short HEAD");
  fs.writeFileSync(path.join(ROOT, "version.json"), JSON.stringify(version, null, 2) + "\n");
  git("git add version.json");
  const verStaged = git("git diff --cached --name-only");
  if (verStaged) {
    git(`git commit -m ${JSON.stringify("Stamp commit " + version.commit)}`);
  }
  git("git push origin HEAD");
  console.log(JSON.stringify({ ok: true, url: meta.url, version }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
