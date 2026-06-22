import { spawn } from "node:child_process";

/**
 * swift-format lint emits diagnostics to stderr in the form:
 *   <path>:<line>:<column>: <severity>: <message>
 * for example:
 *   Sources/App/Main.swift:12:1: warning: remove line break [LineLength]
 *
 * The leading path may be absolute or relative to the working directory.
 */
const DIAGNOSTIC_RE =
  /^(?<path>.+?):(?<line>\d+):(?<column>\d+):\s*(?<severity>warning|error|note):\s*(?<message>.*)$/;

/**
 * Build the argv for `swift-format lint`.
 *
 * `command` may be a multi-word command such as "swift format", which we split
 * so the first token becomes the executable and the rest become leading args.
 *
 * @returns {{ executable: string, args: string[] }}
 */
export function buildLintCommand({
  command,
  paths,
  configuration,
  recursive,
  strict,
}) {
  const [executable, ...prefixArgs] = command.trim().split(/\s+/);
  const args = [...prefixArgs, "lint"];

  if (recursive) args.push("--recursive");
  if (strict) args.push("--strict");
  if (configuration) args.push("--configuration", configuration);

  args.push(...paths);
  return { executable, args };
}

/**
 * Run swift-format lint and collect raw stdout/stderr plus the exit code.
 *
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
export function runLint({ executable, args, cwd }) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));

    child.on("error", (err) => {
      if (err.code === "ENOENT") {
        reject(
          new Error(
            `Could not find swift-format executable "${executable}". ` +
              `Ensure a Swift toolchain is installed or set the "swift-format-command" input.`,
          ),
        );
        return;
      }
      reject(err);
    });

    child.on("close", (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
}

/**
 * Parse swift-format lint diagnostics from combined output.
 *
 * Paths are normalised to be relative to `cwd` (the repository root) so they
 * line up with the paths GitHub uses in pull request diffs.
 *
 * @returns {Array<{ path: string, line: number, column: number, severity: string, message: string }>}
 */
export function parseViolations(output, cwd) {
  const violations = [];
  const prefix = cwd.endsWith("/") ? cwd : `${cwd}/`;

  for (const rawLine of output.split(/\r?\n/)) {
    const match = DIAGNOSTIC_RE.exec(rawLine.trim());
    if (!match) continue;

    // `note:` lines elaborate on the preceding diagnostic; skip them as
    // standalone comments to avoid noisy duplicate annotations.
    if (match.groups.severity === "note") continue;

    let path = match.groups.path;
    if (path.startsWith(prefix)) path = path.slice(prefix.length);
    path = path.replace(/^\.\//, "");

    violations.push({
      path,
      line: Number(match.groups.line),
      column: Number(match.groups.column),
      severity: match.groups.severity,
      message: match.groups.message.trim(),
    });
  }

  return violations;
}
