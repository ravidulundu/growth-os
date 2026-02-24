import { createServer } from "node:http";
import { URL } from "node:url";

const port = Number(process.env.MOCK_API_PORT ?? 4100);
const sessionCookieName = "session_token";
const validMagicToken = "valid-token";
const validSessionToken = "valid-session";
const userId = "11111111-1111-4111-8111-111111111111";
const waitlistEmails = new Set();
const onboardingStateByUser = new Map();

function defaultOnboardingState() {
  return {
    workspaceId: null,
    steps: {
      workspaceValidated: false,
      xConnected: false,
      timelineIngested: false,
      styleExtracted: false,
      draftGenerated: false
    },
    completedAt: null,
    updatedAt: null
  };
}

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

function routeKey(method, path) {
  return `${method} ${path}`;
}

function handleReset({ res }) {
  waitlistEmails.clear();
  onboardingStateByUser.clear();
  sendJson(res, 200, { ok: true });
}

function handleHealth({ res }) {
  sendJson(res, 200, {
    status: "ok",
    service: "mock-api",
    timestamp: new Date().toISOString()
  });
}

function handleSession({ req, res }) {
  if (!hasValidSession(req)) {
    sendJson(res, 401, { message: "Unauthorized" });
    return;
  }

  sendJson(res, 200, { ok: true, userId, sessionId: "mock-session-id" });
}

async function handleSignInMagicLink({ req, res }) {
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
  } catch {
    sendJson(res, 400, { message: "Invalid JSON body" });
  }
}

async function handleWaitlist({ req, res }) {
  try {
    const body = await collectJsonBody(req);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || !email.includes("@")) {
      sendJson(res, 400, { message: "Email is required" });
      return;
    }

    const alreadyJoined = waitlistEmails.has(email);
    waitlistEmails.add(email);
    sendJson(res, 200, {
      ok: true,
      alreadyJoined,
      message: alreadyJoined
        ? "You are already on the waitlist."
        : "You have been added to the waitlist."
    });
  } catch {
    sendJson(res, 400, { message: "Invalid JSON body" });
  }
}

function handleVerifyMagicLink({ parsed, res }) {
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
}

function resolveOnboardingState() {
  return onboardingStateByUser.get(userId) ?? defaultOnboardingState();
}

function handleGetSessionState({ req, res }) {
  if (!hasValidSession(req)) {
    sendJson(res, 401, { message: "Unauthorized" });
    return;
  }

  sendJson(res, 200, { ok: true, onboarding: resolveOnboardingState() });
}

function normalizePatchedSteps(rawSteps) {
  const source = rawSteps && typeof rawSteps === "object" ? rawSteps : {};
  return {
    workspaceValidated: source.workspaceValidated === true,
    xConnected: source.xConnected === true,
    timelineIngested: source.timelineIngested === true,
    styleExtracted: source.styleExtracted === true,
    draftGenerated: source.draftGenerated === true
  };
}

async function handlePatchSessionState({ req, res }) {
  if (!hasValidSession(req)) {
    sendJson(res, 401, { message: "Unauthorized" });
    return;
  }

  try {
    const body = await collectJsonBody(req);
    const previous = resolveOnboardingState();
    const steps = {
      ...previous.steps,
      ...normalizePatchedSteps(body.steps)
    };
    const nextState = {
      workspaceId:
        typeof body.workspaceId === "string" && body.workspaceId.trim().length > 0
          ? body.workspaceId.trim()
          : previous.workspaceId,
      steps,
      completedAt:
        typeof body.completedAt === "string"
          ? body.completedAt
          : Object.values(steps).every(Boolean)
            ? previous.completedAt || new Date().toISOString()
            : null,
      updatedAt: new Date().toISOString()
    };

    onboardingStateByUser.set(userId, nextState);
    sendJson(res, 200, { ok: true, onboarding: nextState });
  } catch {
    sendJson(res, 400, { message: "Invalid JSON body" });
  }
}

const routeHandlers = {
  [routeKey("POST", "/__test/reset")]: handleReset,
  [routeKey("GET", "/health")]: handleHealth,
  [routeKey("GET", "/auth/session")]: handleSession,
  [routeKey("GET", "/auth/session/state")]: handleGetSessionState,
  [routeKey("PATCH", "/auth/session/state")]: handlePatchSessionState,
  [routeKey("POST", "/auth/sign-in/magic-link")]: handleSignInMagicLink,
  [routeKey("POST", "/auth/waitlist")]: handleWaitlist,
  [routeKey("GET", "/auth/magic-link/verify")]: handleVerifyMagicLink
};

async function dispatchRoute(req, res, parsed) {
  const key = routeKey(req.method.toUpperCase(), parsed.pathname);
  const handler = routeHandlers[key];
  if (!handler) {
    return false;
  }

  await handler({ req, res, parsed });
  return true;
}

createServer(async (req, res) => {
  if (!req.url || !req.method) {
    sendJson(res, 400, { message: "Invalid request" });
    return;
  }

  const parsed = new URL(req.url, `http://127.0.0.1:${port}`);
  const handled = await dispatchRoute(req, res, parsed);
  if (!handled) {
    sendJson(res, 404, { message: "Not Found" });
  }
})
  .listen(port, "127.0.0.1", () => {
    process.stdout.write(`mock-api listening on ${port}\n`);
  })
  .on("error", (error) => {
    process.stderr.write(`mock-api failed: ${error.message}\n`);
    process.exit(1);
  });
