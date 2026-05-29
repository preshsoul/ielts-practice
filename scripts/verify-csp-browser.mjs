import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const root = process.cwd();
const distDir = path.join(root, "dist");
const vercelConfig = JSON.parse(await readFile(path.join(root, "vercel.json"), "utf8"));
const globalHeaders = Object.fromEntries(
  (vercelConfig.headers?.find((entry) => entry.source === "/(.*)")?.headers || []).map((header) => [header.key, header.value])
);
const runtimeEnvHeaders = Object.fromEntries(
  (vercelConfig.headers?.find((entry) => entry.source === "/runtime-env.js")?.headers || []).map((header) => [header.key, header.value])
);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

function resolveFilePath(urlPathname) {
  const normalized = decodeURIComponent(urlPathname.split("?")[0]);
  if (normalized === "/" || !path.extname(normalized)) {
    return path.join(distDir, "index.html");
  }
  return path.join(distDir, normalized.replace(/^\/+/, ""));
}

async function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const filePath = resolveFilePath(url.pathname);
      const body = await readFile(filePath);
      const headers = {
        ...globalHeaders,
        ...(url.pathname === "/runtime-env.js" ? runtimeEnvHeaders : {}),
        "Content-Type": contentTypeFor(filePath),
      };
      Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
      res.statusCode = 200;
      res.end(body);
    } catch (error) {
      res.statusCode = 404;
      res.end("Not Found");
    }
  });

  await new Promise((resolve) => server.listen(4174, "127.0.0.1", resolve));
  return server;
}

async function main() {
  const server = await startServer();
  const probe = await fetch("http://127.0.0.1:4174/");
  if (!probe.ok) {
    server.close();
    throw new Error(`Local CSP verification server returned ${probe.status} for / before browser launch.`);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleMessages = [];
  const pageErrors = [];
  const responseLog = [];

  page.on("console", (message) => {
    consoleMessages.push(message.text());
  });
  page.on("pageerror", (error) => {
    pageErrors.push(String(error));
  });
  page.on("response", (response) => {
    responseLog.push({
      url: response.url(),
      status: response.status(),
    });
  });

  const response = await page.goto("http://127.0.0.1:4174/", { waitUntil: "networkidle" });
  if (!response?.ok()) {
    throw new Error(`Initial page load failed with status ${response?.status()}`);
  }

  const cspHeader = response.headers()["content-security-policy"] || "";
  if (!cspHeader.includes("script-src 'self'")) {
    throw new Error("CSP header is missing the expected script-src restriction.");
  }

  const runtimeLoaded = await page.evaluate(() => {
    return Boolean(
      window.__LOCI_ENV__ &&
      typeof window.__LOCI_ENV__ === "object" &&
      Object.prototype.hasOwnProperty.call(window.__LOCI_ENV__, "VITE_SUPABASE_URL")
    );
  });
  if (!runtimeLoaded) {
    throw new Error(`runtime-env.js did not populate window.__LOCI_ENV__. Responses seen: ${JSON.stringify(responseLog)}`);
  }

  const rootExists = await page.locator("#root").count();
  if (!rootExists) {
    throw new Error("The app root container did not render.");
  }

  const violations = [...consoleMessages, ...pageErrors].filter((message) =>
    /content security policy|csp|refused to load|refused to execute/i.test(message)
  );

  await browser.close();
  server.close();

  if (violations.length) {
    throw new Error(`Browser verification found CSP/runtime violations:\n${violations.join("\n")}`);
  }

  console.log("CSP browser verification passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
