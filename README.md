# swift-format-action

A reusable GitHub Action that runs [Apple's `swift-format`](https://github.com/swiftlang/swift-format)
in **lint** mode and reports each violation as an **inline pull request review
comment**. It is a JavaScript action (Node 20) and talks to the GitHub API with
[octokit.js](https://github.com/octokit/octokit.js).

## What it does

1. Runs `swift-format lint` over the paths you specify.
2. Parses the diagnostics it emits.
3. Posts violations that fall on **changed lines** as inline review comments.
4. Collects every other violation (in files/lines not part of the diff) into a
   single **sticky summary comment** that is updated in place on each run — it
   is never duplicated.
5. Emits workflow annotations for every violation (visible even on `push`).
6. Optionally fails the job when violations are found.

Re-running the action on the same PR will not pile up duplicate comments:
inline comments are de-duplicated, and the summary comment is edited in place
(and removed automatically once there are no remaining off-diff violations).

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

## Troubleshooting

### `Failed to post review comments: Resource not accessible by integration`

The `GITHUB_TOKEN` doesn't have permission to post pull request reviews. Two
things to check:

1. **Grant the permission.** The default token is read-only for PR resources.
   Add this to the workflow (or job):

   ```yaml
   permissions:
     contents: read
     pull-requests: write
   ```

2. **Fork pull requests.** On the `pull_request` event, PRs opened from forks
   always receive a read-only token — the `permissions:` block above cannot
   override this. Options:
   - Use [`pull_request_target`](https://docs.github.com/actions/using-workflows/events-that-trigger-workflows#pull_request_target)
     instead (understand the security implications — it runs with the base
     repo's secrets), or
   - Keep `pull_request` and accept that fork PRs only get inline annotations
     (still visible on the "Files changed" tab) rather than review comments.

## Development

```bash
npm install
npm test          # unit tests for parsing & diff logic
npm run build     # bundles src/ into dist/index.js (committed)
```

The bundled `dist/` directory **must** be committed — GitHub runs the action
straight from it.
