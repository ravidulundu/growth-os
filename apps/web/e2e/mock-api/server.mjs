import { createServer } from "node:http";
import { URL } from "node:url";

const port = Number(process.env.MOCK_API_PORT ?? 4100);
const sessionCookieName = "session_token";
const validMagicToken = "valid-token";
const validSessionToken = "valid-session";
const userId = "11111111-1111-4111-8111-111111111111";

function sendJson(res, statusCode, payload, headers = {}) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers
  });
  res.end(JSON.stringify(payload));
}

function parseCookies(rawCookieHeader) {
  if (!rawCookieHeader) {
    return {};
  }

  return rawCookieHeader
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .reduce((acc, pair) => {
      const separator = pair.indexOf("=");
      if (separator <= 0) {
        return acc;
      }

      const key = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      return { ...acc, [key]: value };
    }, {});
}

function hasValidSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[sessionCookieName] === validSessionToken;
}

function collectJsonBody(req) {
  return new Promise((resolve, reject) => {
    let rawBody = "";
    req.on("data", (chunk) => {
      rawBody += chunk;
    });
    req.on("end", () => {
      if (!rawBody) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(rawBody));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

createServer(async (req, res) => {
  if (!req.url || !req.method) {
    sendJson(res, 400, { message: "Invalid request" });
    return;
  }

  const parsed = new URL(req.url, `http://127.0.0.1:${port}`);
  const path = parsed.pathname;
  const method = req.method.toUpperCase();

  if (method === "POST" && path === "/__test/reset") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (method === "GET" && path === "/health") {
    sendJson(res, 200, {
      status: "ok",
      service: "mock-api",
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (method === "GET" && path === "/auth/session") {
    if (!hasValidSession(req)) {
      sendJson(res, 401, { message: "Unauthorized" });
      return;
    }

    sendJson(res, 200, { ok: true, userId, sessionId: "mock-session-id" });
    return;
  }

  if (method === "POST" && path === "/auth/sign-in/magic-link") {
    try {
      const body = await collectJsonBody(req);
      const email = typeof body.email === "string" ? body.email.trim() : "";
      if (!email || !email.includes("@")) {
        sendJson(res, 400, { message: "Email is required" });
        return;
      }

      sendJson(res, 200, {
        ok: true,
        message: "Magic link gönderildi. E-postadaki linke tıklayın, otomatik giriş yapılacak."
      });
      return;
    } catch {
      sendJson(res, 400, { message: "Invalid JSON body" });
      return;
    }
  }

  if (method === "GET" && path === "/auth/magic-link/verify") {
    const token = parsed.searchParams.get("token");
    if (token !== validMagicToken) {
      sendJson(res, 401, { message: "Invalid or expired magic link token" });
      return;
    }

    sendJson(
      res,
      200,
      {
        ok: true,
        userId
      },
      {
        "set-cookie": `${sessionCookieName}=${validSessionToken}; Path=/; HttpOnly; SameSite=Lax`
      }
    );
    return;
  }

  sendJson(res, 404, { message: "Not Found" });
})
  .listen(port, "127.0.0.1", () => {
    process.stdout.write(`mock-api listening on ${port}\n`);
  })
  .on("error", (error) => {
    process.stderr.write(`mock-api failed: ${error.message}\n`);
    process.exit(1);
  });
