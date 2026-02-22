import assert from "node:assert/strict";
import test from "node:test";
import { classNames } from "../src";

test("classNames joins truthy class names", () => {
  assert.equal(classNames("btn", undefined, false, "active"), "btn active");
});
