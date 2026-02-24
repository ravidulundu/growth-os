import assert from "node:assert/strict";
import test from "node:test";
import { HttpException } from "@nestjs/common";
import type { Pool } from "pg";
import { closePool, getPool } from "../../../shared/db/pool";
import { BillingService } from "../billing.service";

async function createWorkspace(pool: Pool, suffix: string) {
  const workspaceResult = await pool.query<{ id: string }>(
    `
      INSERT INTO workspaces (name, plan_key)
      VALUES ($1, 'free')
      RETURNING id;
    `,
    [`billing-it-${suffix}`]
  );
  const workspaceRow = workspaceResult.rows[0];
  assert.ok(workspaceRow, "workspace insert should return id");
  return workspaceRow.id;
}

async function seedUsageEvents(pool: Pool, workspaceId: string) {
  await pool.query(
    `
      INSERT INTO usage_events (workspace_id, event_type, endpoint_key, units, occurred_at)
      SELECT $1, 'content.generate', 'generation.draft', 1, now() - interval '1 day'
      FROM generate_series(1, 30);
    `,
    [workspaceId]
  );
}

async function assertFreePlanMetering(service: BillingService, workspaceId: string) {
  const metering = await service.getWorkspaceMetering(workspaceId);
  assert.equal(metering.planKey, "free");
  assert.equal(metering.monthlyGenerationLimit, 30);
  assert.equal(metering.usedUnits, 30);
  assert.equal(metering.remainingUnits, 0);
}

async function assertSubscriptionOverride(params: {
  pool: Pool;
  service: BillingService;
  workspaceId: string;
  suffix: string;
  creatorPriceId: string;
}) {
  await params.pool.query(
    `
      INSERT INTO billing_subscriptions (
        workspace_id,
        provider,
        provider_customer_id,
        provider_subscription_id,
        provider_price_id,
        status
      )
      VALUES ($1, 'stripe', $2, $3, $4, 'active');
    `,
    [params.workspaceId, `cus_${params.suffix}`, `sub_${params.suffix}`, params.creatorPriceId]
  );

  const metering = await params.service.getWorkspaceMetering(params.workspaceId);
  assert.equal(metering.planKey, "creator");
  assert.equal(metering.monthlyGenerationLimit, 300);
  assert.equal(metering.remainingUnits, 270);
}

async function assertCanceledSubscriptionFallback(
  pool: Pool,
  service: BillingService,
  workspaceId: string
) {
  await pool.query(
    `
      UPDATE billing_subscriptions
      SET status = 'canceled',
          updated_at = now()
      WHERE workspace_id = $1
        AND provider = 'stripe';
    `,
    [workspaceId]
  );

  const metering = await service.getWorkspaceMetering(workspaceId);
  assert.equal(metering.planKey, "free");
  assert.equal(metering.monthlyGenerationLimit, 30);
}

async function assertGenerationLimitBlocked(
  pool: Pool,
  service: BillingService,
  workspaceId: string
) {
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
}

async function assertMvp0BypassesLimit(pool: Pool, service: BillingService, workspaceId: string) {
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
}

test("billing.meteringAndLimit.integration", async (t) => {
  const pool = getPool();
  const service = new BillingService();
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const creatorPriceId = `price_creator_${suffix}`;
  process.env.STRIPE_PRICE_ID_CREATOR = creatorPriceId;
  const workspaceId = await createWorkspace(pool, suffix);
  await seedUsageEvents(pool, workspaceId);

  t.after(async () => {
    await pool.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
    await closePool();
  });

  await assertFreePlanMetering(service, workspaceId);
  await assertSubscriptionOverride({ pool, service, workspaceId, suffix, creatorPriceId });
  await assertCanceledSubscriptionFallback(pool, service, workspaceId);
  await assertGenerationLimitBlocked(pool, service, workspaceId);
  await assertMvp0BypassesLimit(pool, service, workspaceId);
});
