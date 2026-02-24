import assert from "node:assert/strict";
import test from "node:test";
import { NotFoundException } from "@nestjs/common";
import type { TestContext } from "node:test";
import { closePool, getPool } from "../../../shared/db/pool";
import { encryptSecret } from "../../../shared/security/token-vault";
import { XIntegrationService } from "../x-integration.service";

type RevokeFixture = {
  pool: ReturnType<typeof getPool>;
  service: XIntegrationService;
  workspaceId: string;
  isolatedWorkspaceId: string;
  accountId: string;
  previousTokenKey: string | undefined;
};

async function insertWorkspace(pool: ReturnType<typeof getPool>, name: string) {
  const result = await pool.query<{ id: string }>(
    `
      INSERT INTO workspaces (name, plan_key)
      VALUES ($1, 'mvp0')
      RETURNING id;
    `,
    [name]
  );
  const row = result.rows[0];
  assert.ok(row, "workspace insert should return id");
  return row.id;
}

async function setupFixture(): Promise<RevokeFixture> {
  const previousTokenKey = process.env.TOKEN_ENCRYPTION_KEY;
  process.env.TOKEN_ENCRYPTION_KEY = previousTokenKey ?? "integration-test-token-key";

  const pool = getPool();
  const service = new XIntegrationService();
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const workspaceId = await insertWorkspace(pool, `x-revoke-${suffix}`);
  const isolatedWorkspaceId = await insertWorkspace(pool, `x-revoke-iso-${suffix}`);
  const accountResult = await pool.query<{ id: string }>(
    `
      INSERT INTO x_accounts (workspace_id, x_user_id, username, is_active)
      VALUES ($1, $2, $3, true)
      RETURNING id;
    `,
    [workspaceId, `x-user-${suffix}`, `x_user_${suffix}`]
  );
  const accountRow = accountResult.rows[0];
  assert.ok(accountRow, "account insert should return id");

  await pool.query(
    `
      INSERT INTO x_tokens (
        account_id,
        access_token_encrypted,
        refresh_token_encrypted,
        scopes,
        expires_at
      )
      VALUES ($1, $2, $3, $4, now() + interval '1 day');
    `,
    [
      accountRow.id,
      encryptSecret("access-token-1"),
      encryptSecret("refresh-token-1"),
      ["tweet.read", "tweet.write", "offline.access"]
    ]
  );

  return {
    pool,
    service,
    workspaceId,
    isolatedWorkspaceId,
    accountId: accountRow.id,
    previousTokenKey
  };
}

function registerCleanup(t: TestContext, fixture: RevokeFixture) {
  t.after(async () => {
    await fixture.pool.query("DELETE FROM workspaces WHERE id = ANY($1::uuid[])", [
      [fixture.workspaceId, fixture.isolatedWorkspaceId]
    ]);
    if (fixture.previousTokenKey === undefined) {
      delete process.env.TOKEN_ENCRYPTION_KEY;
    } else {
      process.env.TOKEN_ENCRYPTION_KEY = fixture.previousTokenKey;
    }
    await closePool();
  });
}

async function assertTokenState(
  pool: ReturnType<typeof getPool>,
  accountId: string,
  expectedActive: number
) {
  const activeTokens = await pool.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM x_tokens
      WHERE account_id = $1
        AND revoked_at IS NULL;
    `,
    [accountId]
  );
  assert.equal(Number(activeTokens.rows[0]?.count ?? 0), expectedActive);
}

test("x_integration.revokeAccount.integration", async (t) => {
  const fixture = await setupFixture();
  registerCleanup(t, fixture);

  await assertTokenState(fixture.pool, fixture.accountId, 1);

  const first = await fixture.service.revokeAccount(fixture.workspaceId, fixture.accountId);
  assert.equal(first.ok, true);
  assert.equal(first.revokedTokenCount, 1);
  assert.equal(first.accountDeactivated, true);
  await assertTokenState(fixture.pool, fixture.accountId, 0);

  const second = await fixture.service.revokeAccount(fixture.workspaceId, fixture.accountId);
  assert.equal(second.revokedTokenCount, 0);
  assert.equal(second.accountDeactivated, false);

  await assert.rejects(
    () => fixture.service.revokeAccount(fixture.isolatedWorkspaceId, fixture.accountId),
    (error) => error instanceof NotFoundException
  );

  const audits = await fixture.pool.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM audit_logs
      WHERE workspace_id = $1
        AND action = 'x.account_revoke'
        AND entity_id = $2;
    `,
    [fixture.workspaceId, fixture.accountId]
  );
  assert.equal(Number(audits.rows[0]?.count ?? 0), 2);
});
