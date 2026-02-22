function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main() {
  const environment = process.argv[2]?.trim() || "staging";
  const deployHookUrl = requiredEnv("DEPLOY_HOOK_URL");

  const response = await fetch(deployHookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      environment,
      sha: process.env.GITHUB_SHA ?? null,
      ref: process.env.GITHUB_REF ?? null,
      repository: process.env.GITHUB_REPOSITORY ?? null,
      actor: process.env.GITHUB_ACTOR ?? null,
      triggeredAt: new Date().toISOString()
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Deploy hook failed (${response.status}): ${body}`);
  }

  console.log(`[deploy] ${environment} deploy hook triggered successfully.`);
}

main().catch((error) => {
  console.error("[deploy] hook trigger failed", error);
  process.exit(1);
});
