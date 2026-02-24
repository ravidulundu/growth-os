import assert from "node:assert/strict";
import test, { after } from "node:test";
import type { PoolClient } from "pg";
import {
  closeWorkerRuntimeResourcesForTests,
  enqueueSeriesNextItemAfterPublishWithOverrides,
  EvergreenEnqueueOverrides,
  PostCommitMetricsPayload,
  resolveEvergreenRunAt,
  evergreenSeriesDedupeKey
} from "../src/main";

after(async () => {
  await closeWorkerRuntimeResourcesForTests();
});

test("resolveEvergreenRunAt respects cadence and fallback", () => {
  const previousNow = Date.now;
  try {
    Date.now = () => 1_000_000;
    const hourly = resolveEvergreenRunAt("hourly");
    assert.equal(hourly.getTime(), 1_000_000 + 60 * 60_000);

    const fallback = resolveEvergreenRunAt("missing");
    assert.equal(fallback.getTime(), 1_000_000 + 24 * 60 * 60_000);
  } finally {
    Date.now = previousNow;
  }
});

test("evergreenSeriesDedupeKey stays stable per minute slot", () => {
  const baseTime = new Date("2024-01-01T00:00:00.000Z");
  const sameSlot = new Date(baseTime.getTime() + 30_000);
  const nextSlot = new Date(baseTime.getTime() + 61_000);

  const first = evergreenSeriesDedupeKey("series", "item", baseTime);
  const same = evergreenSeriesDedupeKey("series", "item", sameSlot);
  const next = evergreenSeriesDedupeKey("series", "item", nextSlot);

  assert.equal(first, same);
  assert.notEqual(next, first);
});

function createStubClient() {
  return {
    query: async () => ({ rows: [] }),
    release: () => {}
  } as unknown as PoolClient;
}

test("evergreen enqueue skips queue when insert dedupes", async () => {
  const payload: PostCommitMetricsPayload = {
    workspaceId: "ws",
    accountId: "acc",
    contentId: "content-1",
    publishedPostId: "published-1",
    xPostId: "x-post-1"
  };

  const context = {
    series_id: "series-1",
    series_workspace_id: "ws",
    series_account_id: "acc",
    cadence: "daily",
    is_active: true,
    enqueue_next_on_publish: true,
    current_item_id: "item-1",
    current_position: 1
  };

  const nextItem = {
    id: "item-2",
    content_id: "content-2",
    position: 2
  };

  let queueCalled = false;
  let persistSuccessCalled = false;
  let dedupeLogged = false;

  const overrides: EvergreenEnqueueOverrides = {
    connectClient: async () => createStubClient(),
    loadSeriesContextForPublishedContent: async () => context,
    markSeriesItemPublished: async () => {},
    resolveNextSeriesItem: async () => nextItem,
    insertSeriesPublishJob: async () => null,
    persistSeriesEnqueueSuccess: async () => {
      persistSuccessCalled = true;
    },
    enqueueSeriesQueueJob: async () => {
      queueCalled = true;
    },
    resolveEvergreenRunAt: () => new Date("2024-01-01T00:00:00.000Z"),
    logger: {
      info: () => {
        dedupeLogged = true;
      },
      warn: () => {},
      error: () => {}
    }
  };

  await enqueueSeriesNextItemAfterPublishWithOverrides(payload, overrides);

  assert.equal(queueCalled, false);
  assert.equal(persistSuccessCalled, false);
  assert.equal(dedupeLogged, true);
});

test("evergreen enqueue persists and queues when insert returns job", async () => {
  const payload: PostCommitMetricsPayload = {
    workspaceId: "ws",
    accountId: "acc",
    contentId: "content-1",
    publishedPostId: "published-1",
    xPostId: "x-post-1"
  };

  const context = {
    series_id: "series-1",
    series_workspace_id: "ws",
    series_account_id: "acc",
    cadence: "daily",
    is_active: true,
    enqueue_next_on_publish: true,
    current_item_id: "item-1",
    current_position: 1
  };

  const nextItem = {
    id: "item-2",
    content_id: "content-2",
    position: 2
  };

  let queueCalled = false;
  let persistSuccessCalled = false;
  let insertCalled = false;
  let insertedRunAt: Date | undefined;

  const overrides: EvergreenEnqueueOverrides = {
    connectClient: async () => createStubClient(),
    loadSeriesContextForPublishedContent: async () => context,
    markSeriesItemPublished: async () => {},
    resolveNextSeriesItem: async () => nextItem,
    insertSeriesPublishJob: async (params) => {
      insertCalled = true;
      insertedRunAt = params.runAt;
      return "next-job";
    },
    persistSeriesEnqueueSuccess: async () => {
      persistSuccessCalled = true;
    },
    enqueueSeriesQueueJob: async (jobId, itemId, runAt) => {
      queueCalled = true;
      assert.equal(jobId, "next-job");
      assert.equal(itemId, nextItem.id);
      assert.equal(runAt, insertedRunAt);
    },
    resolveEvergreenRunAt: () => new Date(1_000),
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {}
    }
  };

  await enqueueSeriesNextItemAfterPublishWithOverrides(payload, overrides);

  assert.equal(insertCalled, true);
  assert.equal(persistSuccessCalled, true);
  assert.equal(queueCalled, true);
});
