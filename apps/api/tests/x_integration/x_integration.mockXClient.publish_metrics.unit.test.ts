import assert from "node:assert/strict";
import test from "node:test";
import { MockXClient } from "../../src/modules/x_integration/x-client";

test("x_integration.mockXClient.publish_metrics.unit", async () => {
  const client = new MockXClient();
  const token = await client.exchangeCodeForToken("sample-auth-code");
  const profile = await client.getProfile(token.accessToken);
  const timeline = await client.fetchTimeline(token.accessToken, 3);

  assert.match(profile.username, /^mock_/);
  assert.equal(timeline.length, 3);

  const publish = await client.publishPost(token.accessToken, "publish worker smoke content");
  assert.match(publish.externalPostId, /^mock_post_/);

  const metrics = await client.fetchPostMetrics(token.accessToken, publish.externalPostId);
  assert.ok(metrics.impressions > 0);
  assert.ok(metrics.likes >= 0);
});
