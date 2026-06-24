import test from "node:test";
import assert from "node:assert/strict";

import { parseViolations, buildLintCommand } from "../src/swiftFormat.js";
import { commentableLines } from "../src/diff.js";

test("parseViolations extracts diagnostics and normalises paths", () => {
  const cwd = "/home/runner/work/repo/repo";
  const output = [
    `${cwd}/Sources/App/Main.swift:12:1: warning: remove line break [LineLength]`,
    "Sources/App/Other.swift:3:5: error: bad indentation [Indentation]",
    "Sources/App/Other.swift:3:5: note: contextual detail",
    "not a diagnostic line",
  ].join("\n");

  const violations = parseViolations(output, cwd);

  assert.equal(violations.length, 2);
  assert.deepEqual(violations[0], {
    path: "Sources/App/Main.swift",
    line: 12,
    column: 1,
    severity: "warning",
    message: "remove line break [LineLength]",
  });
  assert.equal(violations[1].path, "Sources/App/Other.swift");
  assert.equal(violations[1].severity, "error");
});

test("buildLintCommand splits multi-word commands and adds flags", () => {
  const { executable, args } = buildLintCommand({
    command: "swift format",
    paths: ["Sources", "Tests"],
    configuration: ".swift-format",
    recursive: true,
    strict: true,
  });

  assert.equal(executable, "swift");
  assert.deepEqual(args, [
    "format",
    "lint",
    "--recursive",
    "--strict",
    "--configuration",
    ".swift-format",
    "Sources",
    "Tests",
  ]);
});

test("commentableLines returns addressable new-side lines", () => {
  const patch = [
    "@@ -1,3 +1,4 @@",
    " context line 1", // new line 1
    "-removed old",
    "+added new a", // new line 2
    "+added new b", // new line 3
    " context line 4", // new line 4
  ].join("\n");

  const lines = commentableLines(patch);
  assert.deepEqual([...lines].sort((a, b) => a - b), [1, 2, 3, 4]);
});
