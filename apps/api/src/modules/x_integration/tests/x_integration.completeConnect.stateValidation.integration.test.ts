import assert from "node:assert/strict";
import test from "node:test";
import { closePool, getPool } from "../../../shared/db/pool";
import { XIntegrationService } from "../x-integration.service";

test("x_integration.completeConnect.state_validation.integration", async (t) => {
  const previousTokenKey = process.env.TOKEN_ENCRYPTION_KEY;
  process.env.TOKEN_ENCRYPTION_KEY = previousTokenKey ?? "integration-test-token-key";

  const pool = getPool();
  const service = new XIntegrationService();
  const workspaceName = `integration-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const workspaceResult = await pool.query<{ id: string }>(
    `
      INSERT INTO workspaces (name, plan_key)
      VALUES ($1, 'mvp0')
      RETURNING id;
    `,
    [workspaceName]
  );
  const workspaceId = workspaceResult.rows[0].id;

  t.after(async () => {
    await pool.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
    if (previousTokenKey === undefined) {
      delete process.env.TOKEN_ENCRYPTION_KEY;
    } else {
      process.env.TOKEN_ENCRYPTION_KEY = previousTokenKey;
    }
    await closePool();
  });

  const started = await service.startConnect(workspaceId);
  assert.match(started.authUrl, /code_challenge_method=S256/);

  await assert.rejects(
    () =>
      service.completeConnect({
        workspaceId,
        state: `${started.state}-tampered`,
        code: "mock-auth-code-bad-state"
      }),
    { name: "UnauthorizedException" }
  );

  const connected = await service.completeConnect({
    workspaceId,
    state: started.state,
    code: "mock-auth-code-ok"
  });

  assert.equal(connected.ok, true);
  assert.match(connected.accountId, /^[a-f0-9-]{36}$/);
  assert.match(connected.username, /^mock_/);

  const accounts = await service.listWorkspaceAccounts(workspaceId);
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].id, connected.accountId);

  const ingest = await service.ingestTimeline(workspaceId, connected.accountId, 3);
  assert.equal(ingest.ok, true);
  assert.equal(ingest.insertedCount, 3);

  const timelineRows = await pool.query<{ count: number }>(
    `
      SELECT COUNT(*)::int AS count
      FROM x_timeline_posts
      WHERE workspace_id = $1
        AND account_id = $2;
    `,
    [workspaceId, connected.accountId]
  );
  assert.equal(timelineRows.rows[0].count, 3);
});
