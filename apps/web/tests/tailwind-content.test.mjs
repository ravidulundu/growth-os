import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("tailwind content includes app and components directories", () => {
  const configPath = path.join(__dirname, "..", "tailwind.config.ts");
  const configText = fs.readFileSync(configPath, "utf8");

  assert.match(configText, /"\.\/app\/\*\*\/\*\.\{ts,tsx\}"/);
  assert.match(configText, /"\.\/components\/\*\*\/\*\.\{ts,tsx\}"/);
});
