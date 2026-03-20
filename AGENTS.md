# AGENTS.md — Coding Guidelines for draft-release

This file provides guidance for agentic coding agents working in this repository.
`draft-release` is a **GitHub Action** written in TypeScript. The compiled bundle
(`dist/index.js`) is committed to the repository and must be rebuilt after source changes.

---

## Project Structure

```bash
src/              # TypeScript source (entry: index.ts → main.ts)
__tests__/        # Jest test files (<module>.test.ts)
__fixtures__/     # ESM-compatible mock modules for tests
dist/             # Compiled Rollup bundle (committed, do not edit manually)
.github/          # Workflows, release category config
action.yml        # GitHub Action definition
rollup.config.ts  # Bundler config
eslint.config.mjs # ESLint flat config
```

---

## Commands

### Install dependencies

```bash
yarn install
```

### Build (required after source changes)

```bash
yarn build
```

### Run all tests

```bash
yarn test
# Expands to: NODE_OPTIONS=--experimental-vm-modules NODE_NO_WARNINGS=1 npx jest
```

### Run a single test file

```bash
NODE_OPTIONS=--experimental-vm-modules NODE_NO_WARNINGS=1 npx jest __tests__/notes.test.ts
```

### Run a single test by name

```bash
NODE_OPTIONS=--experimental-vm-modules NODE_NO_WARNINGS=1 npx jest --testNamePattern "groups renovate dependency"
```

### Lint TypeScript (check only)

```bash
yarn lint
# Runs: prettier --check && eslint --max-warnings=0
```

### Format TypeScript (auto-fix)

```bash
yarn format
# Runs: prettier --write && eslint --fix
```

### Lint YAML files

```bash
yamllint .
# Config: .yamllint.yaml (extends default, 120-char line limit, ignores .gitignore'd paths)
```

### Lint Markdown files

```bash
markdownlint-cli2 "**/*.md"
# Config: .markdownlint-cli2.yaml (ignores .github/** and node_modules/**)
# To auto-fix: markdownlint-cli2 --fix "**/*.md"
```

### Build + test + format all at once

```bash
yarn all
```

> **Note:** `--experimental-vm-modules` is mandatory because the project uses
> `"type": "module"` and Jest requires this flag for ESM support.
>
> **Note:** `yamllint` and `markdownlint-cli2` are managed via mise (`.mise.toml`).
> Run `mise install` to ensure they are available locally.

---

## TypeScript Configuration

- Target: **ES2022**, module system: **NodeNext** (full ESM)
- `strict: true`, `noImplicitAny: true`, `strictNullChecks: true`
- `noUnusedLocals: true` — unused local variables are a compile error
- `isolatedModules: true`
- Source in `src/`; `__tests__/` and `__fixtures__/` are excluded from `tsc`
  but included in the ESLint project service

---

## Code Style

### Formatting (Prettier)

- **No semicolons**
- **Single quotes** for strings
- **2-space indentation**, no tabs
- **Trailing commas** everywhere (`"trailingComma": "all"`)
- **140-character** line width
- **No spaces** inside object braces: `{key: value}` not `{ key: value }`
- Arrow function parens always: `(x) => x`
- Prettier only formats `.ts` files; JSON/YAML/Markdown are not Prettier-managed

### Imports

- **Always use `.js` extension** for relative imports (NodeNext resolution requirement),
  even when the source file is `.ts`:

  ```ts
  import {Inputs} from './context.js'
  import {getCategories} from './category.js'
  ```

- Group order (no blank lines between groups):
  1. `@actions/*` packages
  2. Other third-party packages (`semver`, `handlebars`, `js-yaml`)
  3. Internal relative imports
- Use **namespace imports** (`* as name`) for `@actions/*` and `semver`;
  use **named imports** for internal modules
- Use `import type` for type-only imports

### Naming Conventions

- **Variables and functions:** `camelCase` — `releaseData`, `getVersionIncrease`
- **Interfaces and type aliases:** `PascalCase` — `Inputs`, `ReleaseData`, `Category`
- **Source files:** lowercase single-word — `notes.ts`, `release.ts`, `version.ts`
- **Test files:** `<module>.test.ts` mirroring the source module — `notes.test.ts`
- **Fixture files:** `<packageName>.ts` — `github.ts`, `core.ts`
- Boolean action inputs use descriptive names without `is` prefix: `dryRun`, `publish`,
  `groupDependencies`, `removeConventionalPrefixes`

### Types

- Prefer explicit interface/type declarations over inline types in function signatures
- Use non-null assertion (`!`) only when type narrowing already guarantees non-null
- Avoid `any`; if unavoidable in tests, add `// eslint-disable-next-line @typescript-eslint/no-explicit-any`
- `camelcase` ESLint rule is disabled — snake_case from GitHub API responses is acceptable

### Error Handling

Top-level orchestration catches all errors and calls `core.setFailed()`:

```ts
try {
  // main work
} catch (error) {
  if (error instanceof Error) core.setFailed(error.message)
}
```

Inner utility functions use `core.error()` for non-fatal errors and `core.debug()` for
recoverable/expected errors:

```ts
} catch (e) {
  core.error(`Error while generating release notes: ${e}`)
}
} catch (err) {
  core.debug(`Version comparison error: ${err}`)
  return fallbackValue
}
```

Use optional chaining defensively for API responses: `response?.data?.html_url`.

### Comments and Documentation

- All exported public functions must have a **JSDoc comment** with `@param` and `@returns`:

  ```ts
  /**
   * Generates release notes for the given tag range.
   * @param inputs - Parsed action inputs
   * @param releaseData - Current release metadata
   * @returns Markdown-formatted release notes string
   */
  ```

- Use `//` inline comments for non-obvious logic, regex explanations, and algorithmic phases
- Use section comments for major phases in complex functions:
  `// First pass: gather update information`
- Use `/* istanbul ignore next */` to exclude unreachable branches from coverage

---

## Testing Patterns

### ESM Mock Setup

Jest ESM requires `jest.unstable_mockModule()` called **before** any dynamic imports.
All tests follow this structure:

```ts
import {jest, describe, expect, test, beforeEach} from '@jest/globals'
import type {MyType} from '../src/myModule.js'

// 1. Import fixtures
import * as githubfix from '../__fixtures__/github.js'
import * as corefix from '../__fixtures__/core.js'

// 2. Register mocks before dynamic imports
jest.unstable_mockModule('@actions/github', () => githubfix)
jest.unstable_mockModule('@actions/core', () => corefix)

// 3. Dynamically import after mocks are registered
const github = await import('@actions/github')
const {myFunction} = await import('../src/myModule.js')
```

### Test Structure

- `describe()` blocks group tests by exported function name
- `it()` and `test()` are used interchangeably
- Use `beforeEach()` to reset mock state: `jest.clearAllMocks()`
- Use `jest.spyOn(gh.rest.repos, 'method').mockResolvedValue(mockResponse)` for API mocking
- Large markdown fixture strings are defined at module scope and reused across test cases
- Test data objects are typically defined inline per test (not shared fixtures)

---

## Key Dependencies

| Package | Purpose |
| --------- | --------- |
| `@actions/core` | Inputs, outputs, logging (`core.info`, `core.setFailed`, etc.) |
| `@actions/github` | Octokit GitHub API client and Action context |
| `@docker/actions-toolkit` | `Util.getInputList` for multi-value inputs |
| `semver` | Semantic version parsing and comparison |
| `handlebars` | Template interpolation for header/footer strings |
| `js-yaml` | Parses `.github/release.yml` for release categories |

---

## Important Notes

- **Always rebuild `dist/` after changing source files** — GitHub Actions runs the
  committed `dist/index.js`, not the TypeScript sources directly.
- **Node.js 24.14.0** is the pinned runtime (`.nvmrc`, `.mise.toml`).
- **Yarn 4 (Berry)** is the package manager; do not use `npm` or `pnpm`.
- The `dist/` directory is committed and must be kept in sync with `src/`. CI has a
  `check-dist` workflow that fails if `dist/` is out of date.
- ESLint is configured with `--max-warnings=0` — all lint warnings are treated as errors.
- `camelcase` lint rule is disabled to allow snake_case from GitHub API responses.
