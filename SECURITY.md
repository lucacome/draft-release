# Security Policy

## Supported Versions

Only the latest `v2` release of the action is supported with security updates.
If you are using an older major version, please upgrade before reporting an issue.

| Version | Supported          |
| ------- | ------------------ |
| v2.x    | :white_check_mark: |
| < v2.0  | :x:                |

## Reporting a Vulnerability

Please **do not** report security vulnerabilities through public GitHub issues,
discussions, or pull requests.

Instead, use GitHub's private vulnerability reporting:

1. Go to the [Security Advisories](https://github.com/lucacome/draft-release/security/advisories) page.
2. Click **Report a vulnerability**.
3. Describe the issue, including the affected version, a minimal reproduction (workflow file, inputs, and logs with secrets redacted), and the potential impact.

What to expect:

- An initial acknowledgement within **7 days**.
- An assessment and, where applicable, a remediation plan and timeline.
- Credit in the published advisory once a fix is available, unless you request otherwise.

Please allow a reasonable amount of time for a fix to be released before disclosing
the issue publicly.

## Scope

This policy covers the action itself: its source in `src/` and the committed bundle
in `dist/`. Vulnerabilities in third-party dependencies should be reported to the
respective upstream project; if a dependency issue affects this action, report it
here as well so the dependency can be updated or pinned.

## Security Practices

This repository uses the following measures:

- [CodeQL](.github/workflows/codeql.yml) analysis for code scanning
- [OpenSSF Scorecard](.github/workflows/scorecards.yml) for supply chain checks
- [Dependency Review](.github/workflows/dependency-review.yml) on pull requests
- Renovate for automated dependency updates
- Minimal `GITHUB_TOKEN` permissions in workflows
