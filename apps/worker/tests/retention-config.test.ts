import assert from "node:assert/strict";
import test from "node:test";
import { closeWorkerRuntimeResourcesForTests, resolveRetentionConfigForTests } from "../src/main";

test("worker retention config defaults and overrides", async (t) => {
  const previousRaw = process.env.RAW_POST_RETENTION_DAYS;
  const previousAnalytics = process.env.ANALYTICS_RETENTION_DAYS;
  const previousRotation = process.env.TOKEN_ROTATION_DAYS;

  t.after(async () => {
    if (previousRaw === undefined) {
      delete process.env.RAW_POST_RETENTION_DAYS;
    } else {
      process.env.RAW_POST_RETENTION_DAYS = previousRaw;
    }
    if (previousAnalytics === undefined) {
      delete process.env.ANALYTICS_RETENTION_DAYS;
    } else {
      process.env.ANALYTICS_RETENTION_DAYS = previousAnalytics;
    }
    if (previousRotation === undefined) {
      delete process.env.TOKEN_ROTATION_DAYS;
    } else {
      process.env.TOKEN_ROTATION_DAYS = previousRotation;
    }
    await closeWorkerRuntimeResourcesForTests();
  });

  delete process.env.RAW_POST_RETENTION_DAYS;
  delete process.env.ANALYTICS_RETENTION_DAYS;
  delete process.env.TOKEN_ROTATION_DAYS;
  const defaults = resolveRetentionConfigForTests();
  assert.deepEqual(defaults, {
    rawPostRetentionDays: 90,
    analyticsRetentionDays: 365,
    tokenRotationDays: 30
  });

  process.env.RAW_POST_RETENTION_DAYS = "120";
  process.env.ANALYTICS_RETENTION_DAYS = "400";
  process.env.TOKEN_ROTATION_DAYS = "45";
  const overrides = resolveRetentionConfigForTests();
  assert.deepEqual(overrides, {
    rawPostRetentionDays: 120,
    analyticsRetentionDays: 400,
    tokenRotationDays: 45
  });
});
