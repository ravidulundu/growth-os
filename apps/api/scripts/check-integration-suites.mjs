import fs from "node:fs";
import path from "node:path";

function walk(dir, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, output);
    } else if (entry.isFile() && entry.name.endsWith(".integration.test.ts")) {
      output.push(fullPath);
    }
  }
  return output;
}

const root = path.resolve(process.cwd(), "src", "modules");
const suites = fs.existsSync(root) ? walk(root) : [];

if (suites.length < 1) {
  console.error(
    "Integration test gate failed: expected at least 1 suite under src/modules/<module>/tests/*.integration.test.ts"
  );
  process.exit(1);
}

console.log(`Integration test suites found: ${suites.length}`);
