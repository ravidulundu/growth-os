import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";

function candidatePaths(startDir: string): string[] {
  const candidates: string[] = [];
  let current = startDir;

  while (true) {
    // Precedence is first-match-wins because dotenv is loaded with override:false.
    // That means child directories are checked before parents, and .env.local
    // in a directory wins over .env in the same directory.
    candidates.push(path.join(current, ".env.local"));
    candidates.push(path.join(current, ".env"));
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return candidates;
}

export function loadEnv() {
  for (const envPath of candidatePaths(process.cwd())) {
    if (fs.existsSync(envPath)) {
      config({ path: envPath, override: false });
    }
  }
}
