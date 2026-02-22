import fs from "node:fs";
import path from "node:path";

export function findRepoRoot(startDir = process.cwd()): string {
  let current = path.resolve(startDir);

  while (true) {
    const strictCandidate = path.join(current, "packages", "db", "migrations");
    if (fs.existsSync(strictCandidate)) {
      return current;
    }

    // Backward compatibility for older layout.
    const legacyCandidate = path.join(current, "db", "migrations");
    if (fs.existsSync(legacyCandidate)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("Could not find repo root containing packages/db/migrations");
    }

    current = parent;
  }
}
