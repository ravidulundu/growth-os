import assert from "node:assert/strict";
import test from "node:test";
import { closePool, getPool } from "../../../shared/db/pool";
import { encryptSecret } from "../../../shared/security/token-vault";
import { XIntegrationService } from "../../x_integration/x-integration.service";
import { AnalyticsService } from "../analytics.service";

type CompetitorFixture = {
  previousTokenKey: string | undefined;
  previousClientMode: string | undefined;
  pool: ReturnType<typeof getPool>;
  service: AnalyticsService;
  workspaceId: string;
  isolatedWorkspaceId: string;
};

async function insertWorkspace(pool: ReturnType<typeof getPool>, suffix: string) {
  const result = await pool.query<{ id: string }>(
    `
      INSERT INTO workspaces (name, plan_key)
      VALUES ($1, 'mvp0')
      RETURNING id;
    `,
    [`competitor-it-${suffix}`]
  );
  const row = result.rows[0];
  assert.ok(row, "workspace insert should return id");
  return row.id;
}

async function seedWorkspaceXAccount(params: {
  pool: ReturnType<typeof getPool>;
  workspaceId: string;
  suffix: string;
}) {
  const accountResult = await params.pool.query<{ id: string }>(
    `
      INSERT INTO x_accounts (workspace_id, x_user_id, username, is_active)
      VALUES ($1, $2, $3, true)
      RETURNING id;
    `,
    [params.workspaceId, `comp-user-${params.suffix}`, `comp_${params.suffix}`]
  );
  const accountRow = accountResult.rows[0];
  assert.ok(accountRow, "x account insert should return id");

  await params.pool.query(
    `
      INSERT INTO x_tokens (
        account_id,
        access_token_encrypted,
        refresh_token_encrypted,
        scopes,
        expires_at
      )
      VALUES ($1, $2, $3, $4, now() + interval '2 hours');
    `,
    [
      accountRow.id,
      encryptSecret(`access-token-${params.suffix}`),
      encryptSecret(`refresh-token-${params.suffix}`),
      ["tweet.read", "users.read"]
    ]
  );
}

async function setupFixture(): Promise<CompetitorFixture> {
  const previousTokenKey = process.env.TOKEN_ENCRYPTION_KEY;
  const previousClientMode = process.env.X_CLIENT_MODE;
  process.env.TOKEN_ENCRYPTION_KEY = previousTokenKey ?? "integration-test-token-key";
  process.env.X_CLIENT_MODE = "mock";

  const pool = getPool();
  const xIntegrationService = new XIntegrationService();
  const service = new AnalyticsService(xIntegrationService);
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const workspaceId = await insertWorkspace(pool, `${suffix}-primary`);
  const isolatedWorkspaceId = await insertWorkspace(pool, `${suffix}-isolated`);

  await seedWorkspaceXAccount({ pool, workspaceId, suffix });
  await seedWorkspaceXAccount({ pool, workspaceId: isolatedWorkspaceId, suffix: `${suffix}-iso` });

  return {
    previousTokenKey,
    previousClientMode,
    pool,
    service,
    workspaceId,
    isolatedWorkspaceId
  };
}

async function cleanupFixture(fixture: CompetitorFixture) {
  await fixture.pool.query("DELETE FROM workspaces WHERE id = ANY($1::uuid[])", [
    [fixture.workspaceId, fixture.isolatedWorkspaceId]
  ]);
  if (fixture.previousTokenKey === undefined) {
    delete process.env.TOKEN_ENCRYPTION_KEY;
  } else {
    process.env.TOKEN_ENCRYPTION_KEY = fixture.previousTokenKey;
  }
  if (fixture.previousClientMode === undefined) {
    delete process.env.X_CLIENT_MODE;
  } else {
    process.env.X_CLIENT_MODE = fixture.previousClientMode;
  }
  await closePool();
}

test("analytics.competitors.integration", async () => {
  const fixture = await setupFixture();
  try {
    const addResult = await fixture.service.addCompetitorAccount({
      workspaceId: fixture.workspaceId,
      handle: "@AcmeAI",
      platform: "x",
      limit: 6
    });

    assert.equal(addResult.ok, true);
    assert.equal(addResult.platform, "x");
    assert.equal(addResult.handle, "acmeai");
    assert.ok(addResult.ingestedCount > 0);

    const overview = await fixture.service.getCompetitorOverview(fixture.workspaceId);
    assert.equal(overview.workspaceId, fixture.workspaceId);
    assert.equal(overview.summary.competitorCount, 1);
    assert.ok(overview.summary.totalPosts > 0);
    assert.ok(overview.topHookTypes.length > 0);
    assert.ok(overview.postingWindows.length > 0);
    assert.ok(overview.bestPerformingPosts.length > 0);
    assert.equal(overview.competitors[0]?.handle, "acmeai");

    const isolatedOverview = await fixture.service.getCompetitorOverview(
      fixture.isolatedWorkspaceId
    );
    assert.equal(isolatedOverview.summary.competitorCount, 0);
    assert.equal(isolatedOverview.summary.totalPosts, 0);
    assert.equal(isolatedOverview.bestPerformingPosts.length, 0);
  } finally {
    await cleanupFixture(fixture);
  }
});
