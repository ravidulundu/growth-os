#!/usr/bin/env node

import { execFileSync } from "node:child_process";

function writeLine(message) {
  process.stderr.write(`${message}\n`);
}

function run(command, args) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function tryRun(command, args) {
  try {
    return run(command, args);
  } catch {
    return null;
  }
}

function parseRepoFromOrigin(originUrl) {
  const sshMatch = originUrl.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  const httpsMatch = originUrl.match(/^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }

  return null;
}

if ((process.env.SKIP_PR_REVIEW_CHECK ?? "").trim().toLowerCase() === "true") {
  process.exit(0);
}

if (!tryRun("gh", ["auth", "status"])) {
  writeLine("[pr:review-check] gh auth is unavailable, skipping unresolved-thread guard.");
  process.exit(0);
}

const prNumber = tryRun("gh", ["pr", "view", "--json", "number", "--jq", ".number"]);
if (!prNumber) {
  process.exit(0);
}

const originUrl = tryRun("git", ["remote", "get-url", "origin"]);
if (!originUrl) {
  writeLine("[pr:review-check] Cannot read git origin remote.");
  process.exit(1);
}

const repo = parseRepoFromOrigin(originUrl);
if (!repo) {
  writeLine(`[pr:review-check] Unsupported origin URL format: ${originUrl}`);
  process.exit(1);
}

const query = `
  query($owner:String!, $repo:String!, $number:Int!) {
    repository(owner:$owner, name:$repo) {
      pullRequest(number:$number) {
        reviewThreads(first:100) {
          nodes {
            isResolved
            path
            line
            comments(first:1) {
              nodes {
                url
              }
            }
          }
        }
      }
    }
  }
`;

const responseJson = tryRun("gh", [
  "api",
  "graphql",
  "-f",
  `query=${query}`,
  "-F",
  `owner=${repo.owner}`,
  "-F",
  `repo=${repo.repo}`,
  "-F",
  `number=${prNumber}`
]);

if (!responseJson) {
  writeLine("[pr:review-check] Failed to fetch review threads via gh api.");
  process.exit(1);
}

const response = JSON.parse(responseJson);
const threads = response?.data?.repository?.pullRequest?.reviewThreads?.nodes ?? [];
const unresolved = threads.filter((thread) => thread && thread.isResolved === false);

if (unresolved.length === 0) {
  process.exit(0);
}

writeLine(
  `[pr:review-check] Commit blocked: ${unresolved.length} unresolved PR review thread(s) found.`
);
for (const thread of unresolved.slice(0, 20)) {
  const reference =
    typeof thread.path === "string" && typeof thread.line === "number"
      ? `${thread.path}:${thread.line}`
      : (thread.path ?? "unknown");
  const url = thread?.comments?.nodes?.[0]?.url;
  writeLine(`- ${reference}${typeof url === "string" ? ` (${url})` : ""}`);
}
writeLine("[pr:review-check] Resolve or question these threads before committing.");
writeLine(
  "[pr:review-check] Temporary bypass (not recommended): SKIP_PR_REVIEW_CHECK=true git commit ..."
);
process.exit(1);
