import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { NotFoundException } from "@nestjs/common";
import { closePool, getPool } from "../../../shared/db/pool";
import { BillingService } from "../../billing/billing.service";
import { GenerationService } from "../generation.service";

type GenerationFixture = {
  previousProvider: string | undefined;
  previousOpenRouterKey: string | undefined;
  pool: ReturnType<typeof getPool>;
  service: GenerationService;
  workspaceId: string;
  accountId: string;
};

type DraftSeed = {
  contentId: string;
  text: string;
};

async function setupGenerationFixture(): Promise<GenerationFixture> {
  const previousProvider = process.env.LLM_PROVIDER;
  const previousOpenRouterKey = process.env.OPENROUTER_API_KEY;
  process.env.LLM_PROVIDER = "stub";
  delete process.env.OPENROUTER_API_KEY;

  const pool = getPool();
  const service = new GenerationService(new BillingService());
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;

  const workspaceResult = await pool.query<{ id: string }>(
    `
      INSERT INTO workspaces (name, plan_key)
      VALUES ($1, 'mvp0')
      RETURNING id;
    `,
    [`generation-it-${suffix}`]
  );
  const workspaceRow = workspaceResult.rows[0];
  assert.ok(workspaceRow, "workspace insert should return id");
  const workspaceId = workspaceRow.id;

  const accountResult = await pool.query<{ id: string }>(
    `
      INSERT INTO x_accounts (workspace_id, x_user_id, username, is_active)
      VALUES ($1, $2, $3, true)
      RETURNING id;
    `,
    [workspaceId, `generation-user-${suffix}`, `gen_${suffix}`]
  );
  const accountRow = accountResult.rows[0];
  assert.ok(accountRow, "account insert should return id");
  const accountId = accountRow.id;

  return {
    previousProvider,
    previousOpenRouterKey,
    pool,
    service,
    workspaceId,
    accountId
  };
}

function registerGenerationCleanup(t: TestContext, fixture: GenerationFixture): void {
  const { pool, workspaceId, previousProvider, previousOpenRouterKey } = fixture;

  t.after(async () => {
    await pool.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
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
}

async function assertDraftCreationAndTemplates(
  service: GenerationService,
  workspaceId: string,
  accountId: string
): Promise<DraftSeed> {
  const draft = await service.createDraft({
    workspaceId,
    accountId,
    topic: "TTFV optimizasyonu",
    type: "tweet",
    promptInput: "Kisa ve net ol."
  });

  assert.equal(draft.ok, true);
  assert.match(draft.contentId, /^[a-f0-9-]{36}$/i);
  assert.ok(draft.text.includes("TTFV optimizasyonu"));

  const customTemplate = await service.upsertPromptTemplate({
    workspaceId,
    name: "reply-coach",
    contentType: "reply",
    systemPrompt: "Write calm and practical Turkish replies with one recommendation.",
    userPromptTemplate:
      "Reply üret. Konu: {{topic}}. Ek talimat: {{prompt_input}}. Stil: {{style}}.",
    promptConfig: { tone: "coach" },
    isActive: true
  });
  assert.equal(customTemplate.name, "reply-coach");

  const listedTemplates = await service.listPromptTemplates(workspaceId, "reply");
  assert.ok(listedTemplates.some((item) => item.name === "reply-coach"));

  const replyDraft = await service.createDraft({
    workspaceId,
    accountId,
    topic: "Bu yaklaşımda en kritik trade-off ne?",
    type: "reply",
    promptInput: "Nazik ve çözüm odaklı ol.",
    templateName: "reply-coach"
  });
  assert.equal(replyDraft.ok, true);
  assert.match(replyDraft.text, /Yanıt/i);

  const quoteDraft = await service.createDraft({
    workspaceId,
    accountId,
    topic: "Hızlı büyüme için önce süreç sadeliği gerekir.",
    type: "quote",
    promptInput: "Tek içgörü + tek aksiyon önerisi ver."
  });
  assert.equal(quoteDraft.ok, true);
  assert.match(quoteDraft.text, /Quote yorumu/i);

  return { contentId: draft.contentId, text: draft.text };
}

async function assertVersionFlow(
  service: GenerationService,
  workspaceId: string,
  draftSeed: DraftSeed
): Promise<void> {
  const newVersionText = `${draftSeed.text} Revizyon-1`;
  const version = await service.createVersion({
    workspaceId,
    contentId: draftSeed.contentId,
    textBody: newVersionText
  });
  assert.equal(version.ok, true);
  assert.equal(version.versionNo, 2);

  const versions = await service.listContentVersions(workspaceId, draftSeed.contentId);
  assert.equal(versions.length, 2);
  const [firstVersion, secondVersion] = versions;
  assert.ok(firstVersion, "first version should exist");
  assert.ok(secondVersion, "second version should exist");
  assert.equal(firstVersion.version_no, 1);
  assert.equal(secondVersion.version_no, 2);
  assert.equal(secondVersion.text_body, newVersionText);
}

async function assertMissingVersionTargetFails(
  service: GenerationService,
  workspaceId: string
): Promise<void> {
  await assert.rejects(
    () =>
      service.createVersion({
        workspaceId,
        contentId: "00000000-0000-4000-8000-000000000000",
        textBody: "missing"
      }),
    (error) => error instanceof NotFoundException
  );
}

test("generation.createDraftVersion.integration", async (t) => {
  const fixture = await setupGenerationFixture();
  registerGenerationCleanup(t, fixture);

  const draftSeed = await assertDraftCreationAndTemplates(
    fixture.service,
    fixture.workspaceId,
    fixture.accountId
  );
  await assertVersionFlow(fixture.service, fixture.workspaceId, draftSeed);
  await assertMissingVersionTargetFails(fixture.service, fixture.workspaceId);
});
