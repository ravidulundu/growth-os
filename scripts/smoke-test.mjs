function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function assertJson(url, init) {
  const response = await fetch(url, init);
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Request failed ${response.status} ${response.statusText}: ${body}`);
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`Response is not valid JSON: ${body}`);
  }
}

async function main() {
  const baseUrl = requiredEnv("SMOKE_BASE_URL").replace(/\/$/, "");

  const health = await assertJson(`${baseUrl}/health`, {
    method: "GET",
    headers: { accept: "application/json" }
  });
  if (health.status !== "ok") {
    throw new Error(`Healthcheck did not return status=ok: ${JSON.stringify(health)}`);
  }

  const email = `smoke+${Date.now()}@example.com`;
  const magicLink = await assertJson(`${baseUrl}/auth/magic-link/request`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json"
    },
    body: JSON.stringify({ email })
  });

  if (magicLink.ok !== true) {
    throw new Error(`Magic link request did not return ok=true: ${JSON.stringify(magicLink)}`);
  }

  console.log("[smoke] healthcheck + magic-link request passed");
}

main().catch((error) => {
  console.error("[smoke] failed", error);
  process.exit(1);
});
