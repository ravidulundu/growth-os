const branch = process.env.BRANCH_NAME || process.env.GITHUB_HEAD_REF || process.argv[2] || "";
const regex = /^(feat|fix|chore|refactor|docs|test|ci|perf|build|release)\/[a-z0-9._-]+$/;

if (!branch) {
  console.error("[branch-check] Missing branch name. Provide BRANCH_NAME or pass as argument.");
  process.exit(1);
}

if (!regex.test(branch)) {
  console.error(
    `[branch-check] Invalid branch name '${branch}'. Expected format: <type>/<short-name> where type is feat|fix|chore|refactor|docs|test|ci|perf|build|release.`
  );
  process.exit(1);
}

console.log(`[branch-check] OK: ${branch}`);
