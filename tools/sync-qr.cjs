#!/usr/bin/env node
/**
 * Sync creation.json URL + static qr.png (fallback).
 * Browser install.html generates QR live from creation.json — run this when
 * LAN IP/port changes or before sharing qr.png.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const os = require("os");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const CREATION = path.join(ROOT, "creation.json");
const QR_PNG = path.join(ROOT, "qr.png");
const PORT = Number(process.env.DR_PORT || 8790);
const PUBLIC = (process.env.DR_PUBLIC_BASE || "").replace(/\/$/, "");

function lanIp() {
  try {
    return execSync("ipconfig getifaddr en0", { encoding: "utf8" }).trim();
  } catch (_) {
    const nets = os.networkInterfaces();
    for (const list of Object.values(nets)) {
      for (const n of list || []) {
        if (n.family === "IPv4" && !n.internal) return n.address;
      }
    }
  }
  return "127.0.0.1";
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

async function main() {
  const prev = JSON.parse(fs.readFileSync(CREATION, "utf8"));
  const bust = Date.now().toString(36);
  const ip = lanIp();
  const base = PUBLIC || `http://${ip}:${PORT}`;
  const meta = {
    title: prev.title || "DeskRabbit",
    url: `${base}/?v=${bust}`,
    description:
      prev.description ||
      "Tamagotchi desk companion with customizable faces, presence cam, and idle chat",
    iconUrl: prev.iconUrl || "",
    themeColor: prev.themeColor || "#FE5000",
  };
  fs.writeFileSync(CREATION, JSON.stringify(meta, null, 2) + "\n");
  const png = await fetchPng(JSON.stringify(meta));
  fs.writeFileSync(QR_PNG, png);
  console.log(JSON.stringify({ ok: true, url: meta.url, qrBytes: png.length }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
