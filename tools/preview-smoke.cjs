#!/usr/bin/env node
/**
 * DeskRabbit preview smoke — gateway LLM + static asset checks.
 * Does not replace device QA; blocks deploy suggestions if this fails.
 */
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const BASES = ["https://localhost:14001/v1", "http://127.0.0.1:4001/v1"];
const MODEL = "mac/cursor/cursor-chat";

function reqJson(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const body = opts.body ? JSON.stringify(opts.body) : null;
    const r = lib.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: opts.method || "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sk-deskrabbit-preview",
          ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
        },
        rejectUnauthorized: false,
        timeout: 60000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode >= 400) {
            reject(new Error(url + " → " + res.statusCode + " " + data.slice(0, 200)));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    r.on("error", reject);
    r.on("timeout", () => {
      r.destroy();
      reject(new Error("timeout " + url));
    });
    if (body) r.write(body);
    r.end();
  });
}

async function chat(base) {
  const data = await reqJson(base + "/chat/completions", {
    method: "POST",
    body: {
      model: MODEL,
      stream: false,
      max_tokens: 60,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are DeskRabbit. Reply in ONE short sentence only. No tools. No markdown.",
        },
        { role: "user", content: "Say a friendly hello in German, max 8 words." },
      ],
    },
  });
  const msg = data.choices && data.choices[0] && data.choices[0].message;
  const text = (msg && (msg.content || msg.reasoning_content)) || "";
  if (!String(text).trim()) throw new Error("empty completion from " + base);
  return { base, text: String(text).trim().slice(0, 200) };
}

function checkFiles() {
  const need = [
    "index.html",
    "css/styles.css",
    "css/faces.css",
    "js/sdk.js",
    "js/chat.js",
    "js/app.js",
    "js/face.js",
    "js/settings.js",
    "js/tools.js",
    "js/motion.js",
  ];
  for (const f of need) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) throw new Error("missing " + f);
  }
  const sdk = fs.readFileSync(path.join(ROOT, "js/sdk.js"), "utf8");
  if (!sdk.includes("localhost:14001")) throw new Error("sdk missing preview gateway");
  if (!sdk.includes("mac/cursor/cursor-chat")) throw new Error("sdk missing model id");
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  if (!html.includes("settings-log")) throw new Error("html missing settings-log");
  if (html.includes("face-hint")) throw new Error("html still has face-hint");
}

async function main() {
  console.log("== DeskRabbit preview smoke ==");
  checkFiles();
  console.log("files: ok");

  let ok = null;
  let err = null;
  for (const base of BASES) {
    try {
      ok = await chat(base);
      break;
    } catch (e) {
      err = e;
      console.warn("fail", base, e.message);
    }
  }
  if (!ok) throw err || new Error("no gateway");
  console.log("llm:", ok.base);
  console.log("reply:", ok.text);
  console.log("SMOKE_OK");
}

main().catch((e) => {
  console.error("SMOKE_FAIL", e.message || e);
  process.exit(1);
});
