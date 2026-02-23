import assert from "node:assert/strict";
import test from "node:test";
import { HttpException } from "@nestjs/common";
import { closePool, getPool } from "../../../shared/db/pool";
import { BillingService } from "../billing.service";

test("billing.meteringAndLimit.integration", async (t) => {
  const pool = getPool();
  const service = new BillingService();
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;

  const workspaceResult = await pool.query<{ id: string }>(
    `
      INSERT INTO workspaces (name, plan_key)
      VALUES ($1, 'free')
      RETURNING id;
    `,
    [`billing-it-${suffix}`]
  );
  const workspaceId = workspaceResult.rows[0].id;

  await pool.query(
    `
      INSERT INTO usage_events (workspace_id, event_type, endpoint_key, units, occurred_at)
      SELECT $1, 'content.generate', 'generation.draft', 1, now() - interval '1 day'
      FROM generate_series(1, 30);
    `,
    [workspaceId]
  );

  t.after(async () => {
    await pool.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
    await closePool();
  });

  const metering = await service.getWorkspaceMetering(workspaceId);
  assert.equal(metering.planKey, "free");
  assert.equal(metering.monthlyGenerationLimit, 30);
  assert.equal(metering.usedUnits, 30);
  assert.equal(metering.remainingUnits, 0);

  const blockedClient = await pool.connect();
  try {
    await blockedClient.query("BEGIN");
    await assert.rejects(
      () =>
        service.enforceGenerationLimit(
          workspaceId,
          service.newTransactionExecutor(blockedClient),
          1
        ),
      (error) => error instanceof HttpException && error.getStatus() === 429
    );
    await blockedClient.query("ROLLBACK");
  } finally {
    blockedClient.release();
  }

  await pool.query(`UPDATE workspaces SET plan_key = 'mvp0' WHERE id = $1`, [workspaceId]);

  const allowedClient = await pool.connect();
  try {
    await allowedClient.query("BEGIN");
    const allowed = await service.enforceGenerationLimit(
      workspaceId,
      service.newTransactionExecutor(allowedClient),
      1
    );
    assert.equal(allowed.planKey, "mvp0");
    assert.equal(allowed.monthlyGenerationLimit, null);
    await allowedClient.query("ROLLBACK");
  } finally {
    allowedClient.release();
  }
});
