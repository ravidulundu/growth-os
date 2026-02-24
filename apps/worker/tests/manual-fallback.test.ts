import assert from "node:assert/strict";
import test, { after } from "node:test";
import { closeWorkerRuntimeResourcesForTests, requiresManualActionForErrorCode } from "../src/main";

after(async () => {
  await closeWorkerRuntimeResourcesForTests();
});

test("requiresManualActionForErrorCode matches fallback policy codes", () => {
  assert.equal(requiresManualActionForErrorCode("POLICY_REJECTED"), true);
  assert.equal(requiresManualActionForErrorCode("RATE_LIMIT"), true);
  assert.equal(requiresManualActionForErrorCode("AUTH_FAILED"), true);
  assert.equal(requiresManualActionForErrorCode("X_TEMPORARY_ERROR"), false);
  assert.equal(requiresManualActionForErrorCode(undefined), false);
});
