import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { requireUuidParam } from "../../src/modules/analytics/analytics.controller";

test("analytics.requireUuidParam rejects invalid values with 400", () => {
  assert.equal(
    requireUuidParam("00000000-0000-4000-8000-000000000000", "workspaceId"),
    "00000000-0000-4000-8000-000000000000"
  );

  assert.throws(
    () => requireUuidParam("not-a-uuid", "workspaceId"),
    (error) =>
      error instanceof BadRequestException &&
      error.message.includes("workspaceId must be a valid UUID")
  );
});
