function writeStdout(message) {
  process.stdout.write(`${message}\n`);
}

function writeStderr(message) {
  process.stderr.write(`${message}\n`);
}

const branch = process.env.BRANCH_NAME || process.env.GITHUB_HEAD_REF || process.argv[2] || "";
const regex = /^(feat|fix|chore|refactor|docs|test|ci|perf|build|release)\/[a-z0-9._-]+$/;

if (!branch) {
  writeStderr("[branch-check] Missing branch name. Provide BRANCH_NAME or pass as argument.");
  process.exit(1);
}

if (!regex.test(branch)) {
  writeStderr(
    `[branch-check] Invalid branch name '${branch}'. Expected format: <type>/<short-name> where type is feat|fix|chore|refactor|docs|test|ci|perf|build|release.`
  );
  process.exit(1);
}

writeStdout(`[branch-check] OK: ${branch}`);
