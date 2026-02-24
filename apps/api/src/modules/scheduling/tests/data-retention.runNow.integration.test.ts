import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { closeSchedulingQueues, getMaintenanceQueue } from "../queue";
import { closePool, getPool } from "../../../shared/db/pool";
import { DataRetentionService } from "../../../shared/retention/data-retention.service";

type RetentionFixture = {
  pool: ReturnType<typeof getPool>;
  service: DataRetentionService;
  workspaceId: string;
  ownerId: string;
  editorId: string;
};

async function insertWorkspace(pool: ReturnType<typeof getPool>, suffix: string) {
  const result = await pool.query<{ id: string }>(
    `
      INSERT INTO workspaces (name, plan_key)
      VALUES ($1, 'mvp0')
      RETURNING id;
    `,
    [`retention-it-${suffix}`]
  );
  const row = result.rows[0];
  assert.ok(row, "workspace insert should return id");
  return row.id;
}

async function insertUser(pool: ReturnType<typeof getPool>, email: string) {
  const result = await pool.query<{ id: string }>(
    `
      INSERT INTO users (email, email_hash, display_name)
      VALUES ($1, $2, $3)
      RETURNING id;
    `,
    [email, `hash:${email}`, email.split("@")[0]]
  );
  const row = result.rows[0];
  assert.ok(row, "user insert should return id");
  return row.id;
}

async function setupFixture(): Promise<RetentionFixture> {
  const pool = getPool();
  const service = new DataRetentionService();
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const workspaceId = await insertWorkspace(pool, suffix);
  const ownerId = await insertUser(pool, `owner-${suffix}@example.com`);
  const editorId = await insertUser(pool, `editor-${suffix}@example.com`);

  await pool.query(
    `
      INSERT INTO workspace_members (workspace_id, user_id, role)
      VALUES
        ($1, $2, 'owner'),
        ($1, $3, 'editor');
    `,
    [workspaceId, ownerId, editorId]
  );

  return { pool, service, workspaceId, ownerId, editorId };
}

function registerCleanup(t: TestContext, fixture: RetentionFixture) {
  t.after(async () => {
    await closeSchedulingQueues();
    await fixture.pool.query("DELETE FROM workspaces WHERE id = $1", [fixture.workspaceId]);
    await fixture.pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [
      [fixture.ownerId, fixture.editorId]
    ]);
    await closePool();
  });
}

async function assertRunNowAudit(
  pool: ReturnType<typeof getPool>,
  workspaceId: string,
  actorUserId: string
) {
  const result = await pool.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM audit_logs
      WHERE workspace_id = $1
        AND actor_user_id = $2
        AND action = 'data_retention.run_now_requested';
    `,
    [workspaceId, actorUserId]
  );
  assert.equal(Number(result.rows[0]?.count ?? 0), 1);
}

test("data_retention.run_now.integration", async (t) => {
  const fixture = await setupFixture();
  registerCleanup(t, fixture);

  const run = await fixture.service.runNow({
    workspaceId: fixture.workspaceId,
    userId: fixture.ownerId
  });
  assert.equal(run.ok, true);

  const queuedJob = await getMaintenanceQueue().getJob(run.jobId);
  assert.ok(queuedJob, "maintenance queue job should exist");
  assert.equal(String(queuedJob?.data.workspaceId ?? ""), fixture.workspaceId);
  assert.equal(String(queuedJob?.data.requestedBy ?? ""), fixture.ownerId);

  await assertRunNowAudit(fixture.pool, fixture.workspaceId, fixture.ownerId);

  await assert.rejects(
    () =>
      fixture.service.runNow({
        workspaceId: fixture.workspaceId,
        userId: fixture.editorId
      }),
    (error) => error instanceof ForbiddenException
  );
});
