/**
 * Parse a unified-diff patch (as returned by the GitHub "list pull request
 * files" API) into the set of line numbers on the new ("RIGHT") side of the
 * file. GitHub only accepts inline review comments on lines that appear in the
 * diff, so we use this to filter violations down to commentable lines.
 *
 * Both added (`+`) and unchanged context (` `) lines are addressable; removed
 * (`-`) lines exist only on the old side and are excluded.
 *
 * @param {string} patch - the per-file patch text
 * @returns {Set<number>} the set of new-file line numbers present in the diff
 */
export function commentableLines(patch) {
  const lines = new Set();
  if (!patch) return lines;

  const HUNK_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
  let newLine = 0;

  for (const row of patch.split("\n")) {
    const hunk = HUNK_RE.exec(row);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }

    // "\ No newline at end of file" markers carry no line of their own.
    if (row.startsWith("\\")) continue;

    const marker = row[0];
    if (marker === "+") {
      lines.add(newLine);
      newLine += 1;
    } else if (marker === " ") {
      lines.add(newLine);
      newLine += 1;
    } else if (marker === "-") {
      // removed line: advances only the old side
    }
  }

  return lines;
}

/**
 * Build a map of file path -> set of commentable new-side line numbers for
 * every file in a pull request.
 *
 * @param {Array<{ filename: string, patch?: string }>} files
 * @returns {Map<string, Set<number>>}
 */
export function buildCommentableMap(files) {
  const map = new Map();
  for (const file of files) {
    map.set(file.filename, commentableLines(file.patch));
  }
  return map;
}
