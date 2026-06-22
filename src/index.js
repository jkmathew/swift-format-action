import * as core from "@actions/core";
import { Octokit } from "octokit";

import { loadContext } from "./context.js";
import { buildLintCommand, runLint, parseViolations } from "./swiftFormat.js";
import { postReview } from "./review.js";

function getList(name) {
  return core
    .getInput(name)
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Emit a `::error file=...,line=...::` annotation for a violation. */
function annotate(violation) {
  const fn = violation.severity === "error" ? core.error : core.warning;
  fn(violation.message, {
    title: "swift-format",
    file: violation.path,
    startLine: violation.line,
    startColumn: violation.column,
  });
}

async function run() {
  const token = core.getInput("token");
  const command = core.getInput("swift-format-command") || "swift format";
  const paths = getList("paths");
  const configuration = core.getInput("configuration");
  const recursive = core.getBooleanInput("recursive");
  const strict = core.getBooleanInput("strict");
  const failOnViolations = core.getBooleanInput("fail-on-violations");

  const cwd = process.env.GITHUB_WORKSPACE || process.cwd();

  const { executable, args } = buildLintCommand({
    command,
    paths: paths.length ? paths : ["."],
    configuration,
    recursive,
    strict,
  });

  core.info(`Running: ${executable} ${args.join(" ")}`);
  const { code, stdout, stderr } = await runLint({ executable, args, cwd });

  // swift-format writes diagnostics to stderr; include stdout for safety.
  const violations = parseViolations(`${stderr}\n${stdout}`, cwd);
  core.info(`swift-format found ${violations.length} violation(s).`);
  core.setOutput("violation-count", violations.length);

  if (violations.length === 0) {
    core.info("No swift-format violations. ✅");
  }

  // Always emit annotations — these show up inline on the "Files changed" tab
  // and in the run summary even outside of pull requests.
  for (const violation of violations) annotate(violation);

  const context = loadContext();
  if (context.pull_number && token) {
    try {
      const octokit = new Octokit({ auth: token });
      const review = await postReview(octokit, context, violations);
      core.info(
        `Posted ${review.posted} inline comment(s); ` +
          `${review.skipped.length} violation(s) outside the diff.`,
      );
      for (const v of review.skipped) {
        core.info(`(outside diff) ${v.path}:${v.line}:${v.column}: ${v.message}`);
      }
    } catch (err) {
      core.warning(`Failed to post review comments: ${err.message}`);
    }
  } else if (context.eventName === "pull_request" && !token) {
    core.warning("No token provided; skipping inline review comments.");
  } else if (!context.pull_number) {
    core.info("Not a pull request event; reported violations as annotations only.");
  }

  if (code !== 0 && violations.length === 0) {
    // swift-format failed for a reason other than lint findings (bad config,
    // parse error, etc.). Surface its output and fail.
    core.setFailed(
      `swift-format exited with code ${code}.\n${stderr.trim() || stdout.trim()}`,
    );
    return;
  }

  if (violations.length > 0 && failOnViolations) {
    core.setFailed(`swift-format reported ${violations.length} violation(s).`);
  }
}

run().catch((err) => {
  core.setFailed(err.stack || err.message);
});
