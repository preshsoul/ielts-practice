import { defineConfig, loadEnv } from "vite";

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(chunks.length ? Buffer.concat(chunks) : undefined));
    req.on("error", reject);
  });
}

function toRequest(req, body) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost:5173"}`);
  return new Request(url, {
    method: req.method || "GET",
    headers: req.headers,
    body: body && !["GET", "HEAD"].includes(req.method || "GET") ? body : undefined,
  });
}

function writeResponse(res, response) {
  res.statusCode = response.status;

  const setCookies = response.headers.getSetCookie?.() || [];
  for (const [key, value] of response.headers.entries()) {
    if (key.toLowerCase() === "set-cookie") continue;
    res.setHeader(key, value);
  }

  if (setCookies.length) {
    res.setHeader("Set-Cookie", setCookies);
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL || "";
  const supabaseAnonKey = env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || "";

  if (supabaseUrl) {
    process.env.SUPABASE_URL = supabaseUrl;
    process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
    process.env.VITE_SUPABASE_URL = supabaseUrl;
  }

  if (supabaseAnonKey) {
    process.env.SUPABASE_ANON_KEY = supabaseAnonKey;
    process.env.SUPABASE_PUBLISHABLE_KEY = supabaseAnonKey;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = supabaseAnonKey;
    process.env.VITE_SUPABASE_ANON_KEY = supabaseAnonKey;
  }

  return {
    plugins: [
      {
        name: "auth-bridge-dev-middleware",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (!req.url?.startsWith("/api/auth")) {
              next();
              return;
          }

          const { createAuthBridgeResponse } = await import("./src/server/supabaseAuthBridge.js");
          const body = await readRequestBody(req);
          const request = toRequest(req, body);
          const response = await createAuthBridgeResponse(request, {
            supabaseUrl,
            supabaseAnonKey,
          });
          writeResponse(res, response);
          res.end(await response.text());
        });
      },
      },
    ],
  };
});
