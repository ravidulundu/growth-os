import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { closePool, getPool } from "../../../shared/db/pool";
import { BillingService } from "../../billing/billing.service";
import { GenerationService } from "../generation.service";

type RepurposeFixture = {
  previousProvider: string | undefined;
  previousOpenRouterKey: string | undefined;
  pool: ReturnType<typeof getPool>;
  service: GenerationService;
  workspaceId: string;
  sourceContentId: string;
};

async function insertRepurposeFixture(pool: ReturnType<typeof getPool>, suffix: string) {
  const workspaceResult = await pool.query<{ id: string }>(
    `
      INSERT INTO workspaces (name, plan_key)
      VALUES ($1, 'mvp0')
      RETURNING id;
    `,
    [`generation-repurpose-it-${suffix}`]
  );
  const workspaceRow = workspaceResult.rows[0];
  assert.ok(workspaceRow, "workspace insert should return id");

  const accountResult = await pool.query<{ id: string }>(
    `
      INSERT INTO x_accounts (workspace_id, x_user_id, username, is_active)
      VALUES ($1, $2, $3, true)
      RETURNING id;
    `,
    [workspaceRow.id, `repurpose-user-${suffix}`, `repurpose_${suffix}`]
  );
  const accountRow = accountResult.rows[0];
  assert.ok(accountRow, "account insert should return id");

  const sourceContentResult = await pool.query<{ id: string }>(
    `
      INSERT INTO contents (
        workspace_id,
        account_id,
        type,
        status,
        topic,
        prompt_input,
        current_text
      )
      VALUES ($1, $2, 'tweet', 'draft', $3, $4, $5)
      RETURNING id;
    `,
    [
      workspaceRow.id,
      accountRow.id,
      `Source repurpose topic ${suffix}`,
      "source prompt",
      "Source content text to repurpose."
    ]
  );
  const sourceContentRow = sourceContentResult.rows[0];
  assert.ok(sourceContentRow, "source content insert should return id");

  return { workspaceId: workspaceRow.id, sourceContentId: sourceContentRow.id };
}

async function setupRepurposeFixture(): Promise<RepurposeFixture> {
  const previousProvider = process.env.LLM_PROVIDER;
  const previousOpenRouterKey = process.env.OPENROUTER_API_KEY;
  process.env.LLM_PROVIDER = "stub";
  delete process.env.OPENROUTER_API_KEY;

  const pool = getPool();
  const service = new GenerationService(new BillingService());
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const { workspaceId, sourceContentId } = await insertRepurposeFixture(pool, suffix);

  return { previousProvider, previousOpenRouterKey, pool, service, workspaceId, sourceContentId };
}

function registerRepurposeCleanup(t: TestContext, fixture: RepurposeFixture) {
  t.after(async () => {
    await fixture.pool.query("DELETE FROM workspaces WHERE id = $1", [fixture.workspaceId]);
    if (fixture.previousProvider === undefined) {
      delete process.env.LLM_PROVIDER;
    } else {
      process.env.LLM_PROVIDER = fixture.previousProvider;
    }
    if (fixture.previousOpenRouterKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = fixture.previousOpenRouterKey;
    }
    await closePool();
  });
}

async function assertRepurposeSuccess(fixture: RepurposeFixture) {
  const result = await fixture.service.repurposeContent({
    workspaceId: fixture.workspaceId,
    sourceContentId: fixture.sourceContentId,
    targetType: "thread"
  });

  assert.equal(result.ok, true);
  assert.match(result.repurposeRunId, /^[a-f0-9-]{36}$/i);
  assert.match(result.contentId, /^[a-f0-9-]{36}$/i);
  assert.equal(result.sourceContentId, fixture.sourceContentId);
  assert.ok(result.text.trim().length > 0);
  return result;
}

async function assertRepurposeRunStored(
  fixture: RepurposeFixture,
  runId: string,
  generatedContentId: string
) {
  const runResult = await fixture.pool.query<{ status: string; metadata: Record<string, unknown> }>(
    `
      SELECT status, metadata
      FROM repurpose_runs
      WHERE id = $1
      LIMIT 1;
    `,
    [runId]
  );
  const runRow = runResult.rows[0];
  assert.ok(runRow, "repurpose run row should exist");
  assert.equal(runRow.status, "completed");
  assert.equal(runRow.metadata?.generatedContentId, generatedContentId);
  assert.equal(runRow.metadata?.generatedType, "thread");
}

async function assertGeneratedContentStored(fixture: RepurposeFixture, generatedContentId: string) {
  const contentResult = await fixture.pool.query<{ type: string; status: string }>(
    `
      SELECT type, status
      FROM contents
      WHERE id = $1
      LIMIT 1;
    `,
    [generatedContentId]
  );
  const row = contentResult.rows[0];
  assert.ok(row, "generated content row should exist");
  assert.equal(row.type, "thread");
  assert.equal(row.status, "draft");
}

test("generation.repurpose.integration", async (t) => {
  const fixture = await setupRepurposeFixture();
  registerRepurposeCleanup(t, fixture);

  const repurpose = await assertRepurposeSuccess(fixture);
  await assertRepurposeRunStored(fixture, repurpose.repurposeRunId, repurpose.contentId);
  await assertGeneratedContentStored(fixture, repurpose.contentId);
});
