import { writeReport } from "./report-writer.mjs";

const primaryUrl = normalizeOrigin(
  process.env.LOCI_PRODUCTION_URL
    || process.env.PRODUCTION_URL
    || "https://loci-project.vercel.app",
);
const vercelUrl = normalizeOrigin(
  process.env.LOCI_VERCEL_URL
    || process.env.VERCEL_PROJECT_URL
    || "https://loci-project.vercel.app",
);

const checks = [];

function normalizeOrigin(value) {
  const text = String(value || "").trim().replace(/\/+$/, "");
  if (!text) return "";
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
}

async function fetchText(url, { expectOk = true } = {}) {
  let response;
  try {
    response = await fetch(url, { redirect: "manual" });
  } catch (error) {
    const cause = error?.cause?.code || error?.cause?.message || error?.message || String(error);
    throw new Error(`${url} fetch failed: ${cause}`);
  }
  const text = await response.text().catch(() => "");
  if (expectOk && !response.ok) {
    throw new Error(`${url} returned ${response.status}: ${text.slice(0, 180)}`);
  }
  return {
    ok: response.ok,
    status: response.status,
    url,
    contentType: response.headers.get("content-type") || "",
    cacheControl: response.headers.get("cache-control") || "",
    location: response.headers.get("location") || "",
    text,
  };
}

async function runCheck(id, label, fn) {
  const startedAt = Date.now();
  try {
    const detail = await fn();
    checks.push({ id, label, ok: true, safety: "read-only", evidence: "production-smoke", ms: Date.now() - startedAt, detail });
  } catch (error) {
    checks.push({
      id,
      label,
      ok: false,
      safety: "read-only",
      evidence: "production-smoke",
      ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function assertNotParked(label, html) {
  const body = String(html || "").toLowerCase();
  const markers = [
    "window.lander_system",
    "parking-lander",
    "img1.wsimg.com/parking",
    "window.location.href=\"/lander",
  ];
  const hit = markers.find((marker) => body.includes(marker));
  if (hit) {
    throw new Error(`${label} is serving a parked/lander page (${hit}), not the Loci app.`);
  }
}

function assertLociHtml(label, html) {
  assertNotParked(label, html);
  if (!String(html || "").includes("Loci") || !String(html || "").includes("/assets/index.js")) {
    throw new Error(`${label} did not serve the built Loci SPA shell.`);
  }
}

await runCheck("vercel-app-shell", "Vercel project domain serves the Loci app shell", async () => {
  const response = await fetchText(`${vercelUrl}/`);
  assertLociHtml(vercelUrl, response.text);
  return {
    status: response.status,
    contentType: response.contentType,
  };
});

await runCheck("vercel-runtime-env", "Vercel project domain serves runtime-env.js as JavaScript", async () => {
  const response = await fetchText(`${vercelUrl}/runtime-env.js`);
  if (!response.contentType.includes("javascript")) {
    throw new Error(`runtime-env.js content-type is ${response.contentType || "missing"}`);
  }
  if (!response.text.includes("window.__LOCI_ENV__") || !response.text.includes("VITE_SUPABASE_URL")) {
    throw new Error("runtime-env.js is missing Loci public env keys.");
  }
  return {
    status: response.status,
    contentType: response.contentType,
    cacheControl: response.cacheControl,
  };
});

await runCheck("vercel-health", "Vercel project health endpoint is live", async () => {
  const response = await fetchText(`${vercelUrl}/api/health`);
  let json = null;
  try {
    json = JSON.parse(response.text);
  } catch {
    throw new Error(`health endpoint did not return JSON: ${response.text.slice(0, 180)}`);
  }
  if (!json?.ok) {
    throw new Error(`health endpoint returned ok=false: ${response.text.slice(0, 180)}`);
  }
  return json;
});

await runCheck("primary-domain-app-shell", "Primary production domain serves the Loci app shell", async () => {
  const response = await fetchText(`${primaryUrl}/`);
  assertLociHtml(primaryUrl, response.text);
  return {
    status: response.status,
    contentType: response.contentType,
  };
});

await runCheck("primary-domain-runtime-env", "Primary production domain serves runtime-env.js as JavaScript", async () => {
  const response = await fetchText(`${primaryUrl}/runtime-env.js`);
  assertNotParked(`${primaryUrl}/runtime-env.js`, response.text);
  if (!response.contentType.includes("javascript")) {
    throw new Error(`runtime-env.js content-type is ${response.contentType || "missing"}`);
  }
  if (!response.text.includes("window.__LOCI_ENV__")) {
    throw new Error("runtime-env.js is not the Loci runtime env script.");
  }
  return {
    status: response.status,
    contentType: response.contentType,
    cacheControl: response.cacheControl,
  };
});

await runCheck("primary-domain-auth-callback-shell", "Primary production OAuth callback path serves the SPA", async () => {
  const response = await fetchText(`${primaryUrl}/auth/callback?code=diagnostic`, { expectOk: false });
  if (!response.ok) {
    throw new Error(`/auth/callback returned ${response.status}${response.location ? ` -> ${response.location}` : ""}`);
  }
  assertLociHtml(`${primaryUrl}/auth/callback`, response.text);
  return {
    status: response.status,
    contentType: response.contentType,
  };
});

const failedChecks = checks.filter((item) => !item.ok).map((item) => item.id);
const summary = {
  primaryUrl,
  vercelUrl,
  checks,
  passed: failedChecks.length === 0,
  failedChecks,
};

console.log(JSON.stringify(summary, null, 2));
await writeReport("production-deployment-latest", summary);

if (failedChecks.length) {
  process.exit(1);
}
