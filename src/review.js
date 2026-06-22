import { buildCommentableMap } from "./diff.js";

const SEVERITY_EMOJI = {
  error: "🛑",
  warning: "⚠️",
};

/**
 * Fetch every file in the pull request, paginating through the API.
 */
async function listPullRequestFiles(octokit, { owner, repo, pull_number }) {
  return octokit.paginate(octokit.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number,
    per_page: 100,
  });
}

/**
 * Collect the bodies of review comments this action already posted, so that
 * re-runs on the same commit don't pile up duplicate comments.
 */
async function existingCommentKeys(octokit, { owner, repo, pull_number }) {
  const comments = await octokit.paginate(
    octokit.rest.pulls.listReviewComments,
    { owner, repo, pull_number, per_page: 100 },
  );
  return new Set(comments.map((c) => `${c.path}:${c.line}:${c.body}`));
}

function formatBody({ severity, message }) {
  const emoji = SEVERITY_EMOJI[severity] ?? "";
  return `${emoji} **swift-format (${severity})**\n\n${message}`;
}

/**
 * Post swift-format violations as inline review comments on a pull request.
 *
 * Reviews are always submitted as `COMMENT` so the action never approves or
 * blocks a pull request on its own. Violations that fall outside the PR diff
 * (lines GitHub won't accept inline comments for) are returned so the caller
 * can surface them another way.
 *
 * @returns {Promise<{ posted: number, skipped: Array }>}
 */
export async function postReview(octokit, context, violations) {
  const { owner, repo, pull_number, commit_id } = context;

  const files = await listPullRequestFiles(octokit, {
    owner,
    repo,
    pull_number,
  });
  const commentable = buildCommentableMap(files);
  const seen = await existingCommentKeys(octokit, { owner, repo, pull_number });

  const comments = [];
  const skipped = [];

  for (const violation of violations) {
    const lines = commentable.get(violation.path);
    if (!lines || !lines.has(violation.line)) {
      skipped.push(violation);
      continue;
    }

    const body = formatBody(violation);
    const key = `${violation.path}:${violation.line}:${body}`;
    if (seen.has(key)) continue;
    seen.add(key);

    comments.push({
      path: violation.path,
      line: violation.line,
      side: "RIGHT",
      body,
    });
  }

  if (comments.length === 0) {
    return { posted: 0, skipped };
  }

  // GitHub limits the number of comments per review request; chunk to be safe.
  const CHUNK = 30;
  let posted = 0;
  for (let i = 0; i < comments.length; i += CHUNK) {
    const batch = comments.slice(i, i + CHUNK);
    const isLast = i + CHUNK >= comments.length;
    await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number,
      commit_id,
      event: "COMMENT",
      body: isLast ? summaryBody(violations.length, skipped.length) : undefined,
      comments: batch,
    });
    posted += batch.length;
  }

  return { posted, skipped };
}

function summaryBody(total, skippedCount) {
  let body = `swift-format reported **${total}** violation${total === 1 ? "" : "s"}.`;
  if (skippedCount > 0) {
    body +=
      `\n\n${skippedCount} violation${skippedCount === 1 ? "" : "s"} ` +
      `fell outside the pull request diff and are listed in the workflow logs.`;
  }
  return body;
}
