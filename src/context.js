import { readFileSync } from "node:fs";

/**
 * Read the GitHub Actions event payload and runner environment to derive the
 * repository / pull request context the action operates on.
 *
 * @returns {{ owner: string, repo: string, pull_number: number|null, commit_id: string|null, eventName: string }}
 */
export function loadContext(env = process.env) {
  const [owner, repo] = (env.GITHUB_REPOSITORY ?? "/").split("/");
  const eventName = env.GITHUB_EVENT_NAME ?? "";

  let payload = {};
  if (env.GITHUB_EVENT_PATH) {
    try {
      payload = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
    } catch {
      payload = {};
    }
  }

  const pr = payload.pull_request;
  return {
    owner,
    repo,
    eventName,
    pull_number: pr?.number ?? null,
    // Comment against the PR head commit so line numbers match the latest diff.
    commit_id: pr?.head?.sha ?? env.GITHUB_SHA ?? null,
  };
}
