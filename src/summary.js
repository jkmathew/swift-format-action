// A hidden marker that lets us find and update the same comment on every run
// instead of posting a new one each time.
const MARKER = "<!-- swift-format-action:summary -->";

const SEVERITY_EMOJI = {
  error: "🛑",
  warning: "⚠️",
};

/**
 * Find the action's existing sticky summary comment on the pull request, if any.
 */
async function findSummaryComment(octokit, { owner, repo, pull_number }) {
  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number: pull_number,
    per_page: 100,
  });
  return comments.find((c) => c.body?.includes(MARKER)) ?? null;
}

/**
 * Render the markdown body for the summary comment from the violations that
 * could not be posted as inline comments.
 */
function renderBody(skipped) {
  const byFile = new Map();
  for (const v of skipped) {
    if (!byFile.has(v.path)) byFile.set(v.path, []);
    byFile.get(v.path).push(v);
  }

  const lines = [
    MARKER,
    "## swift-format",
    "",
    `${skipped.length} violation${skipped.length === 1 ? "" : "s"} could not be ` +
      `shown as inline comments because they fall outside this pull request's changes:`,
    "",
  ];

  for (const [path, items] of [...byFile.entries()].sort()) {
    items.sort((a, b) => a.line - b.line || a.column - b.column);
    lines.push(`<details><summary><code>${path}</code> (${items.length})</summary>`, "");
    for (const v of items) {
      const emoji = SEVERITY_EMOJI[v.severity] ?? "";
      lines.push(`- ${emoji} \`L${v.line}:${v.column}\` ${v.message}`);
    }
    lines.push("", "</details>", "");
  }

  return lines.join("\n");
}

/**
 * Create, update, or delete the sticky summary comment so that exactly one
 * comment exists per pull request and it always reflects the latest run.
 *
 * - violations outside the diff  -> create or update the comment
 * - none left                    -> delete a stale comment if present
 *
 * @returns {Promise<"created" | "updated" | "deleted" | "noop">}
 */
export async function upsertSummaryComment(octokit, context, skipped) {
  const { owner, repo, pull_number } = context;
  const existing = await findSummaryComment(octokit, { owner, repo, pull_number });

  if (skipped.length === 0) {
    if (existing) {
      await octokit.rest.issues.deleteComment({
        owner,
        repo,
        comment_id: existing.id,
      });
      return "deleted";
    }
    return "noop";
  }

  const body = renderBody(skipped);

  if (existing) {
    if (existing.body === body) return "noop";
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
    return "updated";
  }

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: pull_number,
    body,
  });
  return "created";
}
