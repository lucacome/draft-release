import {describe, expect, test, it} from '@jest/globals'
import {parseNotes, generateReleaseNotes} from '../src/notes'
import * as github from '@actions/github'
import {Inputs} from '../src/context'
import {helpers} from 'handlebars'

jest.mock('@actions/core')
jest.mock('@actions/github')

let gh: ReturnType<typeof github.getOctokit>

describe('parseNotes', () => {
  test('should return patch with empty labels', () => {
    let version = parseNotes('### 🐛 Bug Fixes', '', '')
    expect(version).toEqual('patch')
  })
  test('should return patch with empty labels', () => {
    let version = parseNotes('### 🚀 Features', '', '')
    expect(version).toEqual('patch')
  })
  test('should return patch if minor and major are not in notes', () => {
    let version = parseNotes('### 🚀 Features', '💣 Breaking Changes', '🐛 Bug Fixes')
    expect(version).toEqual('patch')
  })
  test('should return minor', () => {
    let version = parseNotes(
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
    let version = parseNotes(
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
    let version = parseNotes(
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
    }
    const latestRelease = 'v1.0.0'
    const nextRelease = 'v1.1.0'

    const mockResponse: any = {
      data: {
        body: 'This is the body',
      },
    }

    const mockNotes = jest.spyOn(gh.rest.repos, 'generateReleaseNotes')
    mockNotes.mockResolvedValue(mockResponse)

    // call the function
    const notes = await generateReleaseNotes(gh, inputs, latestRelease, nextRelease)

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
    }

    const latestRelease = 'v1.0.0'
    const nextRelease = 'v1.1.0'

    const mockResponse: any = {
      data: {
        body: `## What's Changed
### 🚀 Features
* fearture 1
* fearture 2
* fearture 3
* fearture 4
* fearture 5

### 🐛 Bug Fixes
* bug fix 1
* bug fix 2
* bug fix 3

### 💣 Breaking Changes
* breaking change 1
* breaking change 2
* breaking change 3
* breaking change 4

### 📝 Documentation
* doc 1
* doc 2
* doc 3

### 🧹 Chores
* chore 1
* chore 2
* chore 3
* chore 4
* chore 5
* chore 6

**Full Changelog**: https://github.com/somewhere/compare/v5.0.4...v5.0.5`,
      },
    }

    const mockNotes = jest.spyOn(gh.rest.repos, 'generateReleaseNotes')
    mockNotes.mockResolvedValue(mockResponse)

    // call the function
    const notes = await generateReleaseNotes(gh, inputs, latestRelease, nextRelease)

    // assert the result
    expect(typeof notes).toEqual('string')
    expect(notes).toContain('header with version-number 1.1.0')
    expect(notes).toContain('footer with version v1.1.0')
    expect(notes).toContain('<details><summary>5 changes</summary>')
    expect(notes).toContain('<details><summary>4 changes</summary>')
    expect(notes).toContain('<details><summary>6 changes</summary>')

    // assert that the result doesn't contain a collapsed section for 3 items
    expect(notes).not.toContain('<details><summary>3 changes</summary>')
  })
})
