import assert from "node:assert/strict";
import test from "node:test";
import { HttpException } from "@nestjs/common";
import { closePool, getPool } from "../../../shared/db/pool";
import { BillingService } from "../../billing/billing.service";
import { GenerationService } from "../generation.service";

test("generation.createDraft.limitPrecheck.integration", async (t) => {
  const previousProvider = process.env.LLM_PROVIDER;
  const previousOpenRouterKey = process.env.OPENROUTER_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.LLM_PROVIDER = "openrouter";
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";

  let fetchCalls = 0;
  const mockedFetch: typeof fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch should not be called for over-limit requests");
  };
  globalThis.fetch = mockedFetch;

  const pool = getPool();
  const service = new GenerationService(new BillingService());
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;

  const workspaceResult = await pool.query<{ id: string }>(
    `
      INSERT INTO workspaces (name, plan_key)
      VALUES ($1, 'free')
      RETURNING id;
    `,
    [`generation-limit-it-${suffix}`]
  );
  const workspaceId = workspaceResult.rows[0].id;

  const accountResult = await pool.query<{ id: string }>(
    `
      INSERT INTO x_accounts (workspace_id, x_user_id, username, is_active)
      VALUES ($1, $2, $3, true)
      RETURNING id;
    `,
    [workspaceId, `generation-limit-user-${suffix}`, `gen_limit_${suffix}`]
  );
  const accountId = accountResult.rows[0].id;

  await pool.query(
    `
      INSERT INTO usage_events (workspace_id, account_id, event_type, endpoint_key, units, occurred_at)
      VALUES ($1, $2, 'content.generate', 'generation.draft', 30, now() - interval '1 hour');
    `,
    [workspaceId, accountId]
  );

  t.after(async () => {
    await pool.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
    globalThis.fetch = previousFetch;
    if (previousProvider === undefined) {
      delete process.env.LLM_PROVIDER;
    } else {
      process.env.LLM_PROVIDER = previousProvider;
    }
    if (previousOpenRouterKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = previousOpenRouterKey;
    }
    await closePool();
  });

  await assert.rejects(
    () =>
      service.createDraft({
        workspaceId,
        accountId,
        topic: "Bu istek kotayi asmali",
        type: "tweet",
        promptInput: "Kisa yaz."
      }),
    (error) => error instanceof HttpException && error.getStatus() === 429
  );

  assert.equal(fetchCalls, 0);
});
