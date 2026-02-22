import assert from "node:assert/strict";
import test from "node:test";
import { assertSupportedXClientMode, resolveXClientMode } from "../src/runtime-policy";

test("resolveXClientMode normalizes and defaults to mock", () => {
  assert.equal(resolveXClientMode(undefined), "mock");
  assert.equal(resolveXClientMode("  MOCK  "), "mock");
});

test("assertSupportedXClientMode rejects unsupported modes", () => {
  assert.throws(
    () => assertSupportedXClientMode({ nodeEnv: "development", mode: "live" }),
    /Unsupported worker X client mode/
  );
});

test("assertSupportedXClientMode allows real mode in production", () => {
  assert.doesNotThrow(() => assertSupportedXClientMode({ nodeEnv: "production", mode: "real" }));
});

test("assertSupportedXClientMode blocks mock mode in production", () => {
  assert.throws(
    () => assertSupportedXClientMode({ nodeEnv: "production", mode: "mock" }),
    /not allowed in production/
  );
});
