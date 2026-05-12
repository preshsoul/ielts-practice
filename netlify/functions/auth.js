import { createAuthBridgeResponse } from "../../src/server/supabaseAuthBridge.js";

function toRequest(event) {
  const url = event.rawUrl || `${event.headers?.x-forwarded-proto || "https"}://${event.headers?.host}${event.path || "/"}`;
  const body = event.isBase64Encoded && event.body
    ? Buffer.from(event.body, "base64")
    : event.body;
  return new Request(url, {
    method: event.httpMethod || "GET",
    headers: event.headers,
    body: event.httpMethod && !["GET", "HEAD"].includes(event.httpMethod) ? body : undefined,
  });
}

function toResponse(response) {
  const headers = {};
  const multiValueHeaders = {};
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      multiValueHeaders["Set-Cookie"] = response.headers.getSetCookie?.() || [value];
    } else {
      headers[key] = value;
    }
  });

  return response.text().then((body) => ({
    statusCode: response.status,
    headers,
    multiValueHeaders: Object.keys(multiValueHeaders).length ? multiValueHeaders : undefined,
    body,
  }));
}

export async function handler(event) {
  const request = toRequest(event);
  const response = await createAuthBridgeResponse(request);
  return toResponse(response);
}
