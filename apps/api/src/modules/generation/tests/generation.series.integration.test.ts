import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { closePool, getPool } from "../../../shared/db/pool";
import { BillingService } from "../../billing/billing.service";
import { GenerationService } from "../generation.service";

type SeriesFixture = {
  previousProvider: string | undefined;
  previousOpenRouterKey: string | undefined;
  pool: ReturnType<typeof getPool>;
  service: GenerationService;
  workspaceId: string;
  accountId: string;
  contentIds: string[];
};

async function insertWorkspaceAndAccount(pool: ReturnType<typeof getPool>, suffix: string) {
  const workspaceResult = await pool.query<{ id: string }>(
    `
      INSERT INTO workspaces (name, plan_key)
      VALUES ($1, 'mvp0')
      RETURNING id;
    `,
    [`generation-series-it-${suffix}`]
  );
  const workspaceRow = workspaceResult.rows[0];
  assert.ok(workspaceRow, "workspace insert should return id");

  const accountResult = await pool.query<{ id: string }>(
    `
      INSERT INTO x_accounts (workspace_id, x_user_id, username, is_active)
      VALUES ($1, $2, $3, true)
      RETURNING id;
    `,
    [workspaceRow.id, `series-user-${suffix}`, `series_${suffix}`]
  );
  const accountRow = accountResult.rows[0];
  assert.ok(accountRow, "account insert should return id");

  return { workspaceId: workspaceRow.id, accountId: accountRow.id };
}

async function insertSeriesContents(params: {
  pool: ReturnType<typeof getPool>;
  workspaceId: string;
  accountId: string;
  suffix: string;
}) {
  const topics = [`Series topic A ${params.suffix}`, `Series topic B ${params.suffix}`];
  const ids: string[] = [];
  for (const [index, topic] of topics.entries()) {
    const result = await params.pool.query<{ id: string }>(
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
        params.workspaceId,
        params.accountId,
        topic,
        `prompt-${index + 1}`,
        `draft-${index + 1}-${params.suffix}`
      ]
    );
    const row = result.rows[0];
    assert.ok(row, "content insert should return id");
    ids.push(row.id);
  }
  return ids;
}

async function setupSeriesFixture(): Promise<SeriesFixture> {
  const previousProvider = process.env.LLM_PROVIDER;
  const previousOpenRouterKey = process.env.OPENROUTER_API_KEY;
  process.env.LLM_PROVIDER = "stub";
  delete process.env.OPENROUTER_API_KEY;

  const pool = getPool();
  const service = new GenerationService(new BillingService());
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const { workspaceId, accountId } = await insertWorkspaceAndAccount(pool, suffix);
  const contentIds = await insertSeriesContents({ pool, workspaceId, accountId, suffix });

  return {
    previousProvider,
    previousOpenRouterKey,
    pool,
    service,
    workspaceId,
    accountId,
    contentIds
  };
}

function registerSeriesCleanup(t: TestContext, fixture: SeriesFixture) {
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

async function assertCreateSeries(fixture: SeriesFixture) {
  const response = await fixture.service.createSeries({
    workspaceId: fixture.workspaceId,
    accountId: fixture.accountId,
    name: "Evergreen Integration Series",
    cadence: "weekly",
    isActive: true,
    enqueueNextOnPublish: true,
    contentIds: fixture.contentIds
  });

  assert.equal(response.ok, true);
  assert.equal(response.itemCount, fixture.contentIds.length);
  assert.equal(response.isActive, true);
  assert.equal(response.enqueueNextOnPublish, true);
  assert.match(response.seriesId, /^[a-f0-9-]{36}$/i);
  return response.seriesId;
}

async function assertSeriesPersistence(fixture: SeriesFixture, seriesId: string) {
  const storedSeries = await fixture.pool.query<{ cadence: string; is_active: boolean }>(
    `
      SELECT cadence, is_active
      FROM content_series
      WHERE id = $1
      LIMIT 1;
    `,
    [seriesId]
  );
  assert.equal(storedSeries.rows[0]?.cadence, "weekly");
  assert.equal(storedSeries.rows[0]?.is_active, true);

  const storedItems = await fixture.pool.query<{ position: number; state: string }>(
    `
      SELECT position, state
      FROM content_series_items
      WHERE series_id = $1
      ORDER BY position ASC;
    `,
    [seriesId]
  );
  assert.equal(storedItems.rows.length, fixture.contentIds.length);
  assert.equal(storedItems.rows[0]?.position, 1);
  assert.equal(storedItems.rows[0]?.state, "pending");
}

async function assertListSeries(fixture: SeriesFixture, seriesId: string) {
  const list = await fixture.service.listSeries(fixture.workspaceId, fixture.accountId);
  const series = list.find((row) => row.id === seriesId);
  assert.ok(series, "created series should be listed");
  assert.equal(series?.items.length, fixture.contentIds.length);
  assert.equal(series?.nextItem?.position, 1);
  assert.ok(series?.items[0]?.contentTopic?.includes("Series topic A"));
}

test("generation.series.integration", async (t) => {
  const fixture = await setupSeriesFixture();
  registerSeriesCleanup(t, fixture);

  const seriesId = await assertCreateSeries(fixture);
  await assertSeriesPersistence(fixture, seriesId);
  await assertListSeries(fixture, seriesId);
});
