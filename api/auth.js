import { createAuthBridgeResponse } from "../src/server/supabaseAuthBridge.js";

async function requestFromNode(req) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  return new Request(url, {
    method: req.method,
    headers: req.headers,
    body: body && !["GET", "HEAD"].includes(req.method) ? body : undefined,
  });
}

export default async function handler(req, res) {
  const request = await requestFromNode(req);
  const response = await createAuthBridgeResponse(request);
  const headers = Object.fromEntries(response.headers.entries());
  const setCookies = response.headers.getSetCookie?.() || [];

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "set-cookie") continue;
    res.setHeader(key, value);
  }

  if (setCookies.length) {
    res.setHeader("Set-Cookie", setCookies);
  }

  res.statusCode = response.status;
  res.end(await response.text());
}
