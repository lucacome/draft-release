import {jest, describe, expect, test, it, beforeEach} from '@jest/globals'

import * as githubfix from '../__fixtures__/github.js'
import * as corefix from '../__fixtures__/core.js'

jest.unstable_mockModule('@actions/github', () => githubfix)
jest.unstable_mockModule('@actions/core', () => corefix)

const github = await import('@actions/github')
await import('@actions/core')

const {parseNotes, generateReleaseNotes, splitMarkdownSections, groupDependencyUpdates, removeConventionalPrefixes} =
  await import('../src/notes.js')

let gh: ReturnType<typeof github.getOctokit>

describe('parseNotes', () => {
  test('should return patch for bug fixes and empty labels', () => {
    const version = parseNotes('### 🐛 Bug Fixes', '', '')
    expect(version).toEqual('patch')
  })
  test('should return patch for features and empty labels', () => {
    const version = parseNotes('### 🚀 Features', '', '')
    expect(version).toEqual('patch')
  })
  test('should return patch if minor and major are not in notes', () => {
    const version = parseNotes('### 🚀 Features', '💣 Breaking Changes', '🐛 Bug Fixes')
    expect(version).toEqual('patch')
  })
  test('should return minor', () => {
    const version = parseNotes(
      `
            ### 🚀 Features
            some feaures
            ### 🐛 Bug Fixes
            some bug fixes

        `,
      '💣 Breaking Change',
      '🐛 Bug Fixes',
    )
    expect(version).toEqual('minor')
  })
  test('should return minor if major is empty', () => {
    const version = parseNotes(
      `
            ### 💣 Breaking Changes
            some breaking changes
            ### 🐛 Bug Fixes
            some bug fixes

        `,
      '',
      '🐛 Bug Fixes',
    )
    expect(version).toEqual('minor')
  })
  test('should return major', () => {
    const version = parseNotes(
      `
            ### 💣 Breaking Changes
            some breaking changes
            ### 🐛 Bug Fixes
            some bug fixes

        `,
      '💣 Breaking Changes',
      '🐛 Bug Fixes',
    )
    expect(version).toEqual('major')
  })
})

const markdown = `
<!-- Release notes generated using configuration in .github/release.yml at main -->

## What's Changed
### 🚀 Features
* Update dependency @types/node to ^22.5.4 by @renovate in https://github.com/lucacome/draft-release/pull/326
* Update dependency eslint-plugin-jest to ^28.8.3 by @renovate in https://github.com/lucacome/draft-release/pull/327
* Update dependency eslint-plugin-import to ^2.30.0 by @renovate in https://github.com/lucacome/draft-release/pull/328
* Update typescript-eslint monorepo to ^8.5.0 by @renovate in https://github.com/lucacome/draft-release/pull/338
### 💣 Breaking Changes
* Delete .github/dependabot.yml by @lucacome in https://github.com/lucacome/draft-release/pull/316
* Configure Renovate - autoclosed by @renovate in https://github.com/lucacome/draft-release/pull/315
* Switch to yarn by @lucacome in https://github.com/lucacome/draft-release/pull/325
### 🐛 Bug Fixes
* Lock file maintenance by @renovate in https://github.com/lucacome/draft-release/pull/324
* Update dependency typescript to ^5.6.2 by @renovate in https://github.com/lucacome/draft-release/pull/340
* Bump path-to-regexp from 6.2.2 to 6.3.0 by @dependabot in https://github.com/lucacome/draft-release/pull/342
* Update dependency @types/jest to ^29.5.13 by @renovate in https://github.com/lucacome/draft-release/pull/343
* Update dependency @types/node to ^22.5.5 by @renovate in https://github.com/lucacome/draft-release/pull/344
### 📝 Documentation
* Update dependency lucacome/draft-release to v1 by @renovate in https://github.com/lucacome/draft-release/pull/321
### 🧪 Tests
* Tested with jest
### 🔨 Maintenance
* Build for renovate PR by @lucacome in https://github.com/lucacome/draft-release/pull/332
* Only try to build on javascript changes by @lucacome in https://github.com/lucacome/draft-release/pull/335
* Run pre-commit by @lucacome in https://github.com/lucacome/draft-release/pull/336
### ⬆️ Dependencies
* Update dependency ts-jest to ^29.2.5 by @renovate in https://github.com/lucacome/draft-release/pull/318
* Update dependency @types/node to ^22.5.2 by @renovate in https://github.com/lucacome/draft-release/pull/319
* Update dependency eslint-plugin-jest to ^28.8.2 by @renovate in https://github.com/lucacome/draft-release/pull/320
* Update dependency eslint-plugin-jest to ^28.8.3 by @renovate in https://github.com/lucacome/draft-release/pull/321
* Update typescript-eslint monorepo to v8 (major) by @renovate in https://github.com/lucacome/draft-release/pull/322
* chore(deps): update Yarn to v4.5.0 by @renovate in https://github.com/lucacome/draft-release/pull/346
* [pre-commit.ci] pre-commit autoupdate by @pre-commit-ci in https://github.com/lucacome/draft-release/pull/347
### Other Changes
* [StepSecurity] Apply security best practices by @step-security-bot in https://github.com/lucacome/draft-release/pull/331
* Update pre-commit hook pre-commit/mirrors-eslint to v8.56.0 by @renovate in https://github.com/lucacome/draft-release/pull/334
* Update ossf/scorecard-action action to v2.4.0 by @renovate in https://github.com/lucacome/draft-release/pull/333
* Update pre-commit hook gitleaks/gitleaks to v8.18.4 by @renovate in https://github.com/lucacome/draft-release/pull/337

## New Contributors
* @renovate made their first contribution in https://github.com/lucacome/draft-release/pull/315
* @step-security-bot made their first contribution in https://github.com/lucacome/draft-release/pull/331

**Full Changelog**: https://github.com/lucacome/draft-release/compare/v1.1.1...v1.2.0`

describe('generateReleaseNotes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    gh = github.getOctokit('_')
  })
  it('should generate release notes for the given header and footer', async () => {
    const inputs: Inputs = {
      githubToken: '_',
      majorLabel: 'major',
      minorLabel: 'minor',
      header: 'header with version-number {{version-number}} and foo {{foo}}',
      footer: 'footer with version {{version}} and baz {{baz}}',
      variables: ['foo=bar', 'baz=qux'],
      collapseAfter: 0,
      publish: false,
      configPath: '.github/release.yml',
      dryRun: false,
      groupDependencies: true,
      removeConventionalPrefixes: false,
    }
    const releaseData = {
      releases: [],
      latestRelease: 'v1.0.0',
      branch: 'main',
      nextRelease: 'v1.1.0',
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockResponse: any = {
      data: {
        body: 'This is the body',
      },
    }

    const mockNotes = jest.spyOn(gh.rest.repos, 'generateReleaseNotes')
    mockNotes.mockResolvedValue(mockResponse)

    // call the function
    const notes = await generateReleaseNotes(gh, inputs, releaseData)

    // assert the result
    expect(typeof notes).toEqual('string')
    expect(notes).toContain('header with version-number 1.1.0 and foo bar')
    expect(notes).toContain('This is the body')
    expect(notes).toContain('footer with version v1.1.0 and baz qux')
  })

  it('should collapse the section if it has more than collapseAfter items', async () => {
    const inputs: Inputs = {
      githubToken: '_',
      majorLabel: 'major',
      minorLabel: 'minor',
      header: 'header with version-number {{version-number}}',
      footer: 'footer with version {{version}}',
      variables: [],
      collapseAfter: 3,
      publish: false,
      configPath: '.github/release.yml',
      dryRun: false,
      groupDependencies: false,
      removeConventionalPrefixes: true,
    }

    const releaseData = {
      releases: [],
      latestRelease: 'v1.0.0',
      branch: 'main',
      nextRelease: 'v1.1.0',
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockResponse: any = {
      data: {
        body: `## What's Changed
### 🚀 Features
* feature 1
* feature 2
* feature 3
* feature 4
* feature 5

### 🐛 Bug Fixes
* revert(bug): fix 1
* revert(bug): bug fix 2
* revert(bug): bug fix 3

### 💣 Breaking Changes
* breaking change 1
* breaking change 2
* breaking change 3
* breaking change 4

### 📝 Documentation
* doc 1
* doc 2
* doc 3

### 🔨 Maintenance
* chore 1
* chore 2
* chore 3
* chore 4
* chore 5
* chore 6

## New Contributors
* foo bar

**Full Changelog**: https://github.com/somewhere/compare/v5.0.4...v5.0.5`,
      },
    }

    const mockNotes = jest.spyOn(gh.rest.repos, 'generateReleaseNotes')
    mockNotes.mockResolvedValue(mockResponse)

    // call the function
    const notes = await generateReleaseNotes(gh, inputs, releaseData)

    // assert the result
    expect(typeof notes).toEqual('string')
    expect(notes).toContain('header with version-number 1.1.0')
    expect(notes).toContain('footer with version v1.1.0')
    expect(notes).toContain('<details><summary>5 changes</summary>')
    expect(notes).toContain('<details><summary>4 changes</summary>')
    expect(notes).toContain('<details><summary>6 changes</summary>')

    // assert that the result doesn't contain a collapsed section for 3 items
    expect(notes).not.toContain('<details><summary>3 changes</summary>')
    expect(notes).not.toContain('revert')
  })

  it('should work without new contributors', async () => {
    const inputs: Inputs = {
      githubToken: '_',
      majorLabel: 'major',
      minorLabel: 'minor',
      header: 'header with version-number {{version-number}}',
      footer: 'footer with version {{version}}',
      variables: [],
      collapseAfter: 5,
      publish: false,
      configPath: '.github/release.yml',
      dryRun: false,
      groupDependencies: false,
      removeConventionalPrefixes: true,
    }

    const releaseData = {
      releases: [],
      latestRelease: 'v1.0.0',
      branch: 'main',
      nextRelease: 'v1.1.0',
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockResponse: any = {
      data: {
        body: `## What's Changed
### 🚀 Features
* feature 1
* feature 2
* feature 3
* feature 4
* feature 5


**Full Changelog**: https://github.com/somewhere/compare/v5.0.4...v5.0.5`,
      },
    }

    const mockNotes = jest.spyOn(gh.rest.repos, 'generateReleaseNotes')
    mockNotes.mockResolvedValue(mockResponse)

    // call the function
    const notes = await generateReleaseNotes(gh, inputs, releaseData)

    // assert the result
    expect(typeof notes).toEqual('string')
    expect(notes).toContain('header with version-number 1.1.0')
    expect(notes).toContain('footer with version v1.1.0')
    expect(notes).toContain('**Full Changelog**')
  })

  it('should work with all the features enabled', async () => {
    const inputs: Inputs = {
      githubToken: '_',
      majorLabel: 'major',
      minorLabel: 'minor',
      header: 'header with version-number {{version-number}}',
      footer: 'footer with version {{version}}',
      variables: [],
      collapseAfter: 4,
      publish: false,
      configPath: '.github/release.yml',
      dryRun: false,
      groupDependencies: true,
      removeConventionalPrefixes: true,
    }

    const releaseData = {
      releases: [],
      latestRelease: 'v1.0.0',
      branch: 'main',
      nextRelease: 'v1.1.0',
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockResponse: any = {
      data: {
        body: markdown,
      },
    }

    const mockNotes = jest.spyOn(gh.rest.repos, 'generateReleaseNotes')
    mockNotes.mockResolvedValue(mockResponse)

    // call the function
    const notes = await generateReleaseNotes(gh, inputs, releaseData)

    // assert the result
    expect(typeof notes).toEqual('string')
    expect(notes).toContain('header with version-number 1.1.0')
    expect(notes).toContain('footer with version v1.1.0')
    expect(notes).toContain('<details><summary>5 changes</summary>')
    expect(notes).toContain('<details><summary>6 changes</summary>')

    expect(notes).toContain(
      '* Update dependency eslint-plugin-jest to ^28.8.3 by @renovate in https://github.com/lucacome/draft-release/pull/320, https://github.com/lucacome/draft-release/pull/321',
    )

    expect(notes).toContain('## New Contributors')
    expect(notes).toContain('**Full Changelog**: https://github.com/lucacome/draft-release/compare/v1.1.1...v1.2.0')
  })
})

describe('splitMarkdownSections', () => {
  it('splits sections correctly', async () => {
    const expectedOutput = {
      enhancement: [
        '* Update dependency @types/node to ^22.5.4 by @renovate in https://github.com/lucacome/draft-release/pull/326',
        '* Update dependency eslint-plugin-jest to ^28.8.3 by @renovate in https://github.com/lucacome/draft-release/pull/327',
        '* Update dependency eslint-plugin-import to ^2.30.0 by @renovate in https://github.com/lucacome/draft-release/pull/328',
        '* Update typescript-eslint monorepo to ^8.5.0 by @renovate in https://github.com/lucacome/draft-release/pull/338',
      ],
      change: [
        '* Delete .github/dependabot.yml by @lucacome in https://github.com/lucacome/draft-release/pull/316',
        '* Configure Renovate - autoclosed by @renovate in https://github.com/lucacome/draft-release/pull/315',
        '* Switch to yarn by @lucacome in https://github.com/lucacome/draft-release/pull/325',
      ],
      bug: [
        '* Lock file maintenance by @renovate in https://github.com/lucacome/draft-release/pull/324',
        '* Update dependency typescript to ^5.6.2 by @renovate in https://github.com/lucacome/draft-release/pull/340',
        '* Bump path-to-regexp from 6.2.2 to 6.3.0 by @dependabot in https://github.com/lucacome/draft-release/pull/342',
        '* Update dependency @types/jest to ^29.5.13 by @renovate in https://github.com/lucacome/draft-release/pull/343',
        '* Update dependency @types/node to ^22.5.5 by @renovate in https://github.com/lucacome/draft-release/pull/344',
      ],
      documentation: [
        '* Update dependency lucacome/draft-release to v1 by @renovate in https://github.com/lucacome/draft-release/pull/321',
      ],
      chore: [
        '* Build for renovate PR by @lucacome in https://github.com/lucacome/draft-release/pull/332',
        '* Only try to build on javascript changes by @lucacome in https://github.com/lucacome/draft-release/pull/335',
        '* Run pre-commit by @lucacome in https://github.com/lucacome/draft-release/pull/336',
      ],
      dependencies: [
        '* Update dependency ts-jest to ^29.2.5 by @renovate in https://github.com/lucacome/draft-release/pull/318',
        '* Update dependency @types/node to ^22.5.2 by @renovate in https://github.com/lucacome/draft-release/pull/319',
        '* Update dependency eslint-plugin-jest to ^28.8.2 by @renovate in https://github.com/lucacome/draft-release/pull/320',
        '* Update dependency eslint-plugin-jest to ^28.8.3 by @renovate in https://github.com/lucacome/draft-release/pull/321',
        '* Update typescript-eslint monorepo to v8 (major) by @renovate in https://github.com/lucacome/draft-release/pull/322',
        '* chore(deps): update Yarn to v4.5.0 by @renovate in https://github.com/lucacome/draft-release/pull/346',
        '* [pre-commit.ci] pre-commit autoupdate by @pre-commit-ci in https://github.com/lucacome/draft-release/pull/347',
      ],
      '*': [
        '* [StepSecurity] Apply security best practices by @step-security-bot in https://github.com/lucacome/draft-release/pull/331',
        '* Update pre-commit hook pre-commit/mirrors-eslint to v8.56.0 by @renovate in https://github.com/lucacome/draft-release/pull/334',
        '* Update ossf/scorecard-action action to v2.4.0 by @renovate in https://github.com/lucacome/draft-release/pull/333',
        '* Update pre-commit hook gitleaks/gitleaks to v8.18.4 by @renovate in https://github.com/lucacome/draft-release/pull/337',
      ],
      tests: ['* Tested with jest'],
    }
    const categories = [
      {
        title: 'Other Changes', // default category
        labels: ['*'],
      },
      {
        title: '🐛 Bug Fixes',
        labels: ['bug'],
      },
      {
        title: '🧪 Tests',
        labels: ['tests'],
      },
      {
        title: '🔨 Maintenance',
        labels: ['chore'],
      },
      {
        title: '⬆️ Dependencies',
        labels: ['dependencies'],
      },
      {
        title: '📝 Documentation',
        labels: ['documentation'],
      },
      {
        title: '🚀 Features',
        labels: ['enhancement'],
      },
      {
        title: '💣 Breaking Changes',
        labels: ['change'],
      },
    ]
    const result = await splitMarkdownSections(markdown, categories)
    expect(result).toEqual(expectedOutput)
  })
})

// Add this after your existing tests

describe('groupDependencyUpdates', () => {
  it('groups renovate dependency updates with the same name', async () => {
    const sections = {
      bug: [
        '* Update dependency typescript to ^5.5.0 by @renovate in https://github.com/lucacome/draft-release/pull/330',
        '* Update dependency typescript to ^5.6.2 by @renovate in https://github.com/lucacome/draft-release/pull/340',
        '* Update module github.com/onsi/ginkgo/v2 to v2.22.0 by @renovate in https://github.com/lucacome/draft-release/pull/2794',
        '* Update module github.com/onsi/ginkgo/v2 to v2.26.0 by @renovate in https://github.com/lucacome/draft-release/pull/2798',
        '* Fix something else by @lucacome in https://github.com/lucacome/draft-release/pull/345',
      ],
    }

    const result = await groupDependencyUpdates(sections)

    expect(result).toEqual({
      bug: [
        '* Update dependency typescript to ^5.6.2 by @renovate in https://github.com/lucacome/draft-release/pull/330, https://github.com/lucacome/draft-release/pull/340',
        '* Update module github.com/onsi/ginkgo/v2 to v2.26.0 by @renovate in https://github.com/lucacome/draft-release/pull/2794, https://github.com/lucacome/draft-release/pull/2798',
        '* Fix something else by @lucacome in https://github.com/lucacome/draft-release/pull/345',
      ],
    })
  })

  it('groups dependabot dependency updates with the same name', async () => {
    const sections = {
      bug: [
        '* Bump path-to-regexp from 6.1.0 to 6.2.2 by @dependabot in https://github.com/lucacome/draft-release/pull/332',
        '* Bump path-to-regexp from 6.2.2 to 6.3.0 by @dependabot in https://github.com/lucacome/draft-release/pull/342',
        '* Fix something else by @lucacome in https://github.com/lucacome/draft-release/pull/345',
      ],
    }

    const result = await groupDependencyUpdates(sections)

    expect(result).toEqual({
      bug: [
        '* Bump path-to-regexp from 6.1.0 to 6.3.0 by @dependabot in https://github.com/lucacome/draft-release/pull/332, https://github.com/lucacome/draft-release/pull/342',
        '* Fix something else by @lucacome in https://github.com/lucacome/draft-release/pull/345',
      ],
    })
  })

  it('groups mixed dependency updates with the same name', async () => {
    const sections = {
      dependencies: [
        '* Update dependency @types/node to ^22.5.2 by @renovate in https://github.com/lucacome/draft-release/pull/169',
        '* Update dependency @types/node to ^22.5.3 by @renovate in https://github.com/lucacome/draft-release/pull/210',
        '* Update dependency ts-jest to ^29.2.5 by @renovate in https://github.com/lucacome/draft-release/pull/318',
        '* Update dependency @types/node to ^22.5.4 by @renovate in https://github.com/lucacome/draft-release/pull/85',
        '* Update typescript-eslint monorepo to v8 (major) by @renovate in https://github.com/lucacome/draft-release/pull/322',
      ],
      bug: [
        '* Update dependency @types/node to ^22.5.5 by @renovate in https://github.com/lucacome/draft-release/pull/344',
        '* Bump path-to-regexp from 6.2.2 to 6.3.0 by @dependabot in https://github.com/lucacome/draft-release/pull/342',
      ],
    }

    const result = await groupDependencyUpdates(sections)

    // Note: dependencies in different sections remain separate
    expect(result).toEqual({
      dependencies: [
        '* Update dependency @types/node to ^22.5.4 by @renovate in https://github.com/lucacome/draft-release/pull/85, https://github.com/lucacome/draft-release/pull/169, https://github.com/lucacome/draft-release/pull/210',
        '* Update dependency ts-jest to ^29.2.5 by @renovate in https://github.com/lucacome/draft-release/pull/318',
        '* Update typescript-eslint monorepo to v8 (major) by @renovate in https://github.com/lucacome/draft-release/pull/322',
      ],
      bug: [
        '* Update dependency @types/node to ^22.5.5 by @renovate in https://github.com/lucacome/draft-release/pull/344',
        '* Bump path-to-regexp from 6.2.2 to 6.3.0 by @dependabot in https://github.com/lucacome/draft-release/pull/342',
      ],
    })
  })

  it('handles other update formats correctly', async () => {
    const sections = {
      dependencies: [
        '* Update Yarn to v4.5.0 by @renovate in https://github.com/lucacome/draft-release/pull/346',
        '* Update pre-commit hook gitleaks/gitleaks to v8.18.4 by @renovate in https://github.com/lucacome/draft-release/pull/337',
        '* Update pre-commit hook gitleaks/gitleaks to v8.18.5 by @renovate in https://github.com/lucacome/draft-release/pull/338',
        '* Update pre-commit hook pre-commit/mirrors-eslint to v8.56.0 by @renovate in https://github.com/lucacome/draft-release/pull/334',
        '* Update ossf/scorecard-action action to v2.4.0 by @renovate in https://github.com/lucacome/draft-release/pull/333',
      ],
    }

    const result = await groupDependencyUpdates(sections)

    // All of these have different dependency names, so they should remain separate
    expect(result).toEqual({
      dependencies: [
        '* Update Yarn to v4.5.0 by @renovate in https://github.com/lucacome/draft-release/pull/346',
        '* Update pre-commit hook gitleaks/gitleaks to v8.18.5 by @renovate in https://github.com/lucacome/draft-release/pull/337, https://github.com/lucacome/draft-release/pull/338',
        '* Update pre-commit hook pre-commit/mirrors-eslint to v8.56.0 by @renovate in https://github.com/lucacome/draft-release/pull/334',
        '* Update ossf/scorecard-action action to v2.4.0 by @renovate in https://github.com/lucacome/draft-release/pull/333',
      ],
    })
  })

  it('handles empty sections and items without dependencies', async () => {
    const sections = {
      empty: [],
      nodeps: [
        '* Fix a bug by @lucacome in https://github.com/lucacome/draft-release/pull/345',
        '* Add a feature by @contributor in https://github.com/lucacome/draft-release/pull/346',
      ],
    }

    const result = await groupDependencyUpdates(sections)

    expect(result).toEqual({
      empty: [],
      nodeps: [
        '* Fix a bug by @lucacome in https://github.com/lucacome/draft-release/pull/345',
        '* Add a feature by @contributor in https://github.com/lucacome/draft-release/pull/346',
      ],
    })
  })

  it('preserves all sections in the original input', async () => {
    const sections = {
      enhancement: ['* Feature 1'],
      bug: ['* Bug 1'],
      dependencies: ['* Update dependency X to Y by @renovate in PR-1'],
      documentation: ['* Doc 1'],
    }

    const result = await groupDependencyUpdates(sections)

    expect(Object.keys(result)).toEqual(['enhancement', 'bug', 'dependencies', 'documentation'])
  })

  it('groups pre-commit-ci updates correctly', async () => {
    const sections = {
      dependencies: [
        '* [pre-commit.ci] pre-commit autoupdate by @pre-commit-ci[bot] in https://github.com/lucacome/draft-release/pull/350',
        '* Update dependency @types/node to ^22.5.2 by @renovate in https://github.com/lucacome/draft-release/pull/319',
        '* [pre-commit.ci] pre-commit autoupdate by @pre-commit-ci[bot] in https://github.com/lucacome/draft-release/pull/355',
        '* Update dependency ts-jest to ^29.2.5 by @renovate in https://github.com/lucacome/draft-release/pull/318',
        '* Bump path-to-regexp from 6.2.0 to 6.2.1 by @dependabot in https://github.com/lucacome/draft-release/pull/341',
      ],
      other: [
        '* Fix bug in release notes by @lucacome in https://github.com/lucacome/draft-release/pull/360',
        '* [pre-commit.ci] pre-commit autoupdate by @pre-commit-ci in https://github.com/lucacome/draft-release/pull/359',
        '* Another regular update by @contributor in https://github.com/lucacome/draft-release/pull/358',
      ],
    }

    const result = await groupDependencyUpdates(sections)

    // Verify pre-commit updates are grouped properly within each section
    expect(result).toEqual({
      dependencies: [
        '* [pre-commit.ci] pre-commit autoupdate by @pre-commit-ci[bot] in https://github.com/lucacome/draft-release/pull/350, https://github.com/lucacome/draft-release/pull/355',
        '* Update dependency @types/node to ^22.5.2 by @renovate in https://github.com/lucacome/draft-release/pull/319',
        '* Update dependency ts-jest to ^29.2.5 by @renovate in https://github.com/lucacome/draft-release/pull/318',
        '* Bump path-to-regexp from 6.2.0 to 6.2.1 by @dependabot in https://github.com/lucacome/draft-release/pull/341',
      ],
      other: [
        '* Fix bug in release notes by @lucacome in https://github.com/lucacome/draft-release/pull/360',
        '* [pre-commit.ci] pre-commit autoupdate by @pre-commit-ci in https://github.com/lucacome/draft-release/pull/359',
        '* Another regular update by @contributor in https://github.com/lucacome/draft-release/pull/358',
      ],
    })
  })

  it('handles mixed dependency updates with pre-commit-ci updates', async () => {
    const sections = {
      dependencies: [
        '* Update dependency @types/node to ^22.5.2 by @renovate in https://github.com/lucacome/draft-release/pull/319',
        '* [pre-commit.ci] pre-commit autoupdate by @pre-commit-ci in https://github.com/lucacome/draft-release/pull/350',
        '* fix(deps): update dependency @types/node to ^22.5.3 by @renovate in https://github.com/lucacome/draft-release/pull/320',
        '* Update dependency @types/node to ^22.5.4 by @renovate in https://github.com/lucacome/draft-release/pull/326',
        '* [pre-commit.ci] pre-commit autoupdate by @pre-commit-ci in https://github.com/lucacome/draft-release/pull/355',
        '* Bump path-to-regexp from 6.2.0 to 6.3.0 by @dependabot in https://github.com/lucacome/draft-release/pull/342',
        '* Bump path-to-regexp from 6.1.0 to 6.2.0 by @dependabot in https://github.com/lucacome/draft-release/pull/340',
      ],
    }

    const result = await groupDependencyUpdates(sections)

    // Verify all types of updates are grouped correctly
    expect(result).toEqual({
      dependencies: [
        '* Update dependency @types/node to ^22.5.4 by @renovate in https://github.com/lucacome/draft-release/pull/319, https://github.com/lucacome/draft-release/pull/320, https://github.com/lucacome/draft-release/pull/326',
        '* [pre-commit.ci] pre-commit autoupdate by @pre-commit-ci in https://github.com/lucacome/draft-release/pull/350, https://github.com/lucacome/draft-release/pull/355',
        '* Bump path-to-regexp from 6.1.0 to 6.3.0 by @dependabot in https://github.com/lucacome/draft-release/pull/340, https://github.com/lucacome/draft-release/pull/342',
      ],
    })
  })

  it('preserves pre-commit-ci updates in different sections', async () => {
    const sections = {
      dependencies: ['* [pre-commit.ci] pre-commit autoupdate by @pre-commit-ci in https://github.com/lucacome/draft-release/pull/350'],
      enhancement: ['* Add feature by @contributor in https://github.com/lucacome/draft-release/pull/345'],
      bug: [
        '* [pre-commit.ci] pre-commit autoupdate by @pre-commit-ci in https://github.com/lucacome/draft-release/pull/355',
        '* Fix critical bug by @developer in https://github.com/lucacome/draft-release/pull/347',
      ],
    }

    const result = await groupDependencyUpdates(sections)

    // Pre-commit updates should be grouped within each section but kept separate across sections
    expect(result).toEqual({
      dependencies: ['* [pre-commit.ci] pre-commit autoupdate by @pre-commit-ci in https://github.com/lucacome/draft-release/pull/350'],
      enhancement: ['* Add feature by @contributor in https://github.com/lucacome/draft-release/pull/345'],
      bug: [
        '* [pre-commit.ci] pre-commit autoupdate by @pre-commit-ci in https://github.com/lucacome/draft-release/pull/355',
        '* Fix critical bug by @developer in https://github.com/lucacome/draft-release/pull/347',
      ],
    })
  })
  // Add this test in the groupDependencyUpdates describe block
  it('groups lock file maintenance updates correctly', async () => {
    const sections = {
      dependencies: [
        '* Lock file maintenance by @renovate in https://github.com/lucacome/draft-release/pull/391',
        '* Update dependency @types/node to ^22.5.2 by @renovate in https://github.com/lucacome/draft-release/pull/319',
        '* Lock file maintenance by @renovate in https://github.com/lucacome/draft-release/pull/395',
        '* Update dependency ts-jest to ^29.2.5 by @renovate in https://github.com/lucacome/draft-release/pull/318',
        '* Bump path-to-regexp from 6.2.0 to 6.2.1 by @dependabot in https://github.com/lucacome/draft-release/pull/341',
      ],
      bug: [
        '* Fix bug in release notes by @lucacome in https://github.com/lucacome/draft-release/pull/360',
        '* Lock file maintenance by @renovate in https://github.com/lucacome/draft-release/pull/399',
      ],
    }

    const result = await groupDependencyUpdates(sections)

    // Verify lock file maintenance updates are grouped properly within each section
    expect(result).toEqual({
      dependencies: [
        '* Lock file maintenance by @renovate in https://github.com/lucacome/draft-release/pull/391, https://github.com/lucacome/draft-release/pull/395',
        '* Update dependency @types/node to ^22.5.2 by @renovate in https://github.com/lucacome/draft-release/pull/319',
        '* Update dependency ts-jest to ^29.2.5 by @renovate in https://github.com/lucacome/draft-release/pull/318',
        '* Bump path-to-regexp from 6.2.0 to 6.2.1 by @dependabot in https://github.com/lucacome/draft-release/pull/341',
      ],
      bug: [
        '* Fix bug in release notes by @lucacome in https://github.com/lucacome/draft-release/pull/360',
        '* Lock file maintenance by @renovate in https://github.com/lucacome/draft-release/pull/399',
      ],
    })
  })

  it('handles mixed updates with lock file maintenance', async () => {
    const sections = {
      dependencies: [
        '* Update dependency @types/node to ^22.5.2 by @renovate in https://github.com/lucacome/draft-release/pull/319',
        '* Lock file maintenance by @renovate in https://github.com/lucacome/draft-release/pull/391',
        '* [pre-commit.ci] pre-commit autoupdate by @pre-commit-ci in https://github.com/lucacome/draft-release/pull/350',
        '* Update dependency @types/node to ^22.5.4 by @renovate in https://github.com/lucacome/draft-release/pull/326',
        '* Lock file maintenance by @renovate in https://github.com/lucacome/draft-release/pull/395',
        '* [pre-commit.ci] pre-commit autoupdate by @pre-commit-ci in https://github.com/lucacome/draft-release/pull/355',
        '* Bump path-to-regexp from 6.2.0 to 6.3.0 by @dependabot in https://github.com/lucacome/draft-release/pull/342',
        '* Bump path-to-regexp from 6.1.0 to 6.2.0 by @dependabot in https://github.com/lucacome/draft-release/pull/340',
      ],
    }

    const result = await groupDependencyUpdates(sections)

    // Verify all types of updates are grouped correctly
    expect(result).toEqual({
      dependencies: [
        '* Update dependency @types/node to ^22.5.4 by @renovate in https://github.com/lucacome/draft-release/pull/319, https://github.com/lucacome/draft-release/pull/326',
        '* Lock file maintenance by @renovate in https://github.com/lucacome/draft-release/pull/391, https://github.com/lucacome/draft-release/pull/395',
        '* [pre-commit.ci] pre-commit autoupdate by @pre-commit-ci in https://github.com/lucacome/draft-release/pull/350, https://github.com/lucacome/draft-release/pull/355',
        '* Bump path-to-regexp from 6.1.0 to 6.3.0 by @dependabot in https://github.com/lucacome/draft-release/pull/340, https://github.com/lucacome/draft-release/pull/342',
      ],
    })
  })

  it('preserves mixed prefix types within grouped updates', async () => {
    const sections = {
      dependencies: [
        // Same dependency with different prefix types
        '* fix(deps): update dependency typescript to ^5.2.0 by @renovate in https://github.com/lucacome/draft-release/pull/320',
        '* chore(deps-dev): update dependency typescript to ^5.3.0 by @renovate in https://github.com/lucacome/draft-release/pull/330',

        // Same for dependabot updates
        '* fix(deps): bump path-to-regexp from 6.1.0 to 6.2.0 by @dependabot in https://github.com/lucacome/draft-release/pull/340',
        '* chore(deps): bump path-to-regexp from 6.2.0 to 6.3.0 by @dependabot in https://github.com/lucacome/draft-release/pull/342',
      ],
    }

    const result = await groupDependencyUpdates(sections)

    // When we have the same dependency with different prefix types, it should preserve
    // the prefix from the entry with the latest version
    expect(result).toEqual({
      dependencies: [
        // For typescript, should use chore(deps-dev) prefix since 5.3.0 is newer than 5.2.0
        '* chore(deps-dev): update dependency typescript to ^5.3.0 by @renovate in https://github.com/lucacome/draft-release/pull/320, https://github.com/lucacome/draft-release/pull/330',

        // For path-to-regexp, should use chore(deps) prefix since 6.3.0 is newer than 6.2.0
        '* chore(deps): bump path-to-regexp from 6.1.0 to 6.3.0 by @dependabot in https://github.com/lucacome/draft-release/pull/340, https://github.com/lucacome/draft-release/pull/342',
      ],
    })
  })

  it('correctly handles conventional prefixes with special formats', async () => {
    const sections = {
      dependencies: [
        // Some less common conventional commit formats
        '* refactor(deps): update dependency eslint to ^8.56.0 by @renovate in https://github.com/lucacome/draft-release/pull/340',
        '* perf(deps): update dependency lodash to ^4.17.21 by @renovate in https://github.com/lucacome/draft-release/pull/341',
        '* docs(deps): update dependency typedoc to ^0.25.7 by @renovate in https://github.com/lucacome/draft-release/pull/342',
        '* test(deps): update dependency jest to ^29.7.0 by @renovate in https://github.com/lucacome/draft-release/pull/343',
      ],
    }

    // Test with removeConventionalPrefixes = false
    const resultWithPrefixes = await groupDependencyUpdates(sections)
    expect(resultWithPrefixes.dependencies[0]).toContain('refactor(deps):')
    expect(resultWithPrefixes.dependencies[1]).toContain('perf(deps):')
    expect(resultWithPrefixes.dependencies[2]).toContain('docs(deps):')
    expect(resultWithPrefixes.dependencies[3]).toContain('test(deps):')
  })
})

// First, let's add tests specifically for the removeConventionalPrefixes function
describe('removeConventionalPrefixes', () => {
  it('removes conventional prefixes from entries', async () => {
    const sections = {
      dependencies: [
        '* fix(deps): update dependency @types/node to ^22.5.2 by @renovate in https://github.com/lucacome/draft-release/pull/319',
        '* chore(deps): update typescript-eslint monorepo to v8 by @renovate in https://github.com/lucacome/draft-release/pull/322',
        '* feat(ui): add new component by @contributor in https://github.com/lucacome/draft-release/pull/325',
        '* Update regular dependency without prefix by @renovate in https://github.com/lucacome/draft-release/pull/330',
      ],
      bug: [
        '* fix(core): resolve crash on startup by @developer in https://github.com/lucacome/draft-release/pull/340',
        '* Regular bug fix without prefix by @contributor in https://github.com/lucacome/draft-release/pull/345',
      ],
    }

    const result = await removeConventionalPrefixes(sections)

    expect(result).toEqual({
      dependencies: [
        '* Update dependency @types/node to ^22.5.2 by @renovate in https://github.com/lucacome/draft-release/pull/319',
        '* Update typescript-eslint monorepo to v8 by @renovate in https://github.com/lucacome/draft-release/pull/322',
        '* Add new component by @contributor in https://github.com/lucacome/draft-release/pull/325',
        '* Update regular dependency without prefix by @renovate in https://github.com/lucacome/draft-release/pull/330',
      ],
      bug: [
        '* Resolve crash on startup by @developer in https://github.com/lucacome/draft-release/pull/340',
        '* Regular bug fix without prefix by @contributor in https://github.com/lucacome/draft-release/pull/345',
      ],
    })
  })

  it('handles different conventional commit formats', async () => {
    const sections = {
      dependencies: [
        '* refactor(deps): update dependency eslint to ^8.56.0 by @renovate in https://github.com/lucacome/draft-release/pull/340',
        '* perf(deps): update dependency lodash to ^4.17.21 by @renovate in https://github.com/lucacome/draft-release/pull/341',
        '* docs(deps): update dependency typedoc to ^0.25.7 by @renovate in https://github.com/lucacome/draft-release/pull/342',
        '* test(deps): update dependency jest to ^29.7.0 by @renovate in https://github.com/lucacome/draft-release/pull/343',
      ],
    }

    const result = await removeConventionalPrefixes(sections)

    expect(result).toEqual({
      dependencies: [
        '* Update dependency eslint to ^8.56.0 by @renovate in https://github.com/lucacome/draft-release/pull/340',
        '* Update dependency lodash to ^4.17.21 by @renovate in https://github.com/lucacome/draft-release/pull/341',
        '* Update dependency typedoc to ^0.25.7 by @renovate in https://github.com/lucacome/draft-release/pull/342',
        '* Update dependency jest to ^29.7.0 by @renovate in https://github.com/lucacome/draft-release/pull/343',
      ],
    })
  })

  it('leaves entries without conventional prefixes unchanged', async () => {
    const sections = {
      enhancement: [
        '* Add new feature by @contributor in https://github.com/lucacome/draft-release/pull/326',
        '* Improve performance by @developer in https://github.com/lucacome/draft-release/pull/327',
      ],
    }

    const result = await removeConventionalPrefixes(sections)

    // Should be unchanged
    expect(result).toEqual({
      enhancement: [
        '* Add new feature by @contributor in https://github.com/lucacome/draft-release/pull/326',
        '* Improve performance by @developer in https://github.com/lucacome/draft-release/pull/327',
      ],
    })
  })

  it('correctly handles empty sections', async () => {
    const sections = {
      empty: [],
      dependencies: [
        '* fix(deps): update dependency @types/node to ^22.5.2 by @renovate in https://github.com/lucacome/draft-release/pull/319',
      ],
    }

    const result = await removeConventionalPrefixes(sections)

    expect(result).toEqual({
      empty: [],
      dependencies: ['* Update dependency @types/node to ^22.5.2 by @renovate in https://github.com/lucacome/draft-release/pull/319'],
    })
  })

  it('should capitalize the first word after removing prefix', async () => {
    const sections = {
      dependencies: [
        '* fix(deps): update dependency typescript to ^5.2.0 by @renovate in https://github.com/lucacome/draft-release/pull/320',
        '* chore(deps): lock file maintenance by @renovate in https://github.com/lucacome/draft-release/pull/324',
      ],
    }

    const result = await removeConventionalPrefixes(sections)

    expect(result).toEqual({
      dependencies: [
        '* Update dependency typescript to ^5.2.0 by @renovate in https://github.com/lucacome/draft-release/pull/320',
        '* Lock file maintenance by @renovate in https://github.com/lucacome/draft-release/pull/324',
      ],
    })
  })
})
