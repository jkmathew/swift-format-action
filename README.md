# swift-format-action

A reusable GitHub Action that runs [Apple's `swift-format`](https://github.com/swiftlang/swift-format)
in **lint** mode and reports each violation as an **inline pull request review
comment**. It is a JavaScript action (Node 20) and talks to the GitHub API with
[octokit.js](https://github.com/octokit/octokit.js).

## What it does

1. Runs `swift-format lint` over the paths you specify.
2. Parses the diagnostics it emits.
3. Posts violations that fall on changed lines as inline review comments.
4. Emits workflow annotations for every violation (visible even on `push`).
5. Optionally fails the job when violations are found.

## Usage

```yaml
name: Swift Format
on: pull_request

permissions:
  contents: read
  pull-requests: write # needed to post inline review comments

jobs:
  lint:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4
      - uses: jkmathew/swift-format-action@v1
        with:
          swift-format-command: "swift format" # toolchain subcommand
          paths: |
            Sources
            Tests
          configuration: .swift-format
```

A full example lives in [`examples/swift-format.yml`](examples/swift-format.yml).

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `token` | `${{ github.token }}` | Token used to post review comments. |
| `swift-format-command` | `swift format` | Executable to invoke. Omit the input for the toolchain subcommand. |
| `paths` | `.` | Newline/space-separated files or directories to lint. |
| `configuration` | _(empty)_ | Path to a `.swift-format` config file. |
| `recursive` | `true` | Recurse into directories. |
| `strict` | `false` | Pass `--strict` to swift-format. |
| `fail-on-violations` | `true` | Fail the job when violations are found. |

Reviews are always submitted as `COMMENT`, so the action never approves or
blocks a pull request on its own.

## Outputs

| Output | Description |
| --- | --- |
| `violation-count` | Total number of violations reported. |

## Notes

- Inline comments can only be placed on lines that appear in the PR diff.
  Violations outside the diff are still emitted as annotations and logged.
- The runner must have `swift-format` available. The `macos-14` image bundles it
  with the Swift toolchain (`swift format`); on Linux, install `swift-format`
  separately and set `swift-format-command` accordingly.

## Development

```bash
npm install
npm test          # unit tests for parsing & diff logic
npm run build     # bundles src/ into dist/index.js (committed)
```

The bundled `dist/` directory **must** be committed — GitHub runs the action
straight from it.
