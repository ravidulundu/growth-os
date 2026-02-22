import assert from "node:assert/strict";
import test from "node:test";
import { HttpException, InternalServerErrorException } from "@nestjs/common";
import { mapBetterAuthError } from "../../src/modules/auth/auth.controller";

test("mapBetterAuthError remaps redirect status codes to 401", () => {
  const mapped = mapBetterAuthError({ statusCode: 302, message: "redirect" });
  assert.equal(mapped.getStatus(), 401);
  assert.equal(mapped.message, "redirect");
});

test("mapBetterAuthError normalizes non-error status codes to 500", () => {
  const mapped = mapBetterAuthError({ statusCode: 200, message: "bad upstream status" });
  assert.ok(mapped instanceof InternalServerErrorException);
  assert.equal(mapped.getStatus(), 500);
  assert.equal(mapped.message, "bad upstream status");
});

test("mapBetterAuthError keeps valid 4xx/5xx status codes", () => {
  const mapped = mapBetterAuthError({ statusCode: 429, message: "rate limited" });
  assert.ok(mapped instanceof HttpException);
  assert.equal(mapped.getStatus(), 429);
  assert.equal(mapped.message, "rate limited");
});
