import {jest, describe, expect, test, beforeEach} from '@jest/globals'
import * as githubfix from '../__fixtures__/github.js'
import * as corefix from '../__fixtures__/core.js'

jest.unstable_mockModule('@actions/github', () => githubfix)
jest.unstable_mockModule('@actions/core', () => corefix)
jest.unstable_mockModule('../src/context.js', () => ({
  ContextSource: {workflow: 'workflow', git: 'git'},
  getContext: jest.fn(),
  getInputs: jest.fn(),
}))

const github = await import('@actions/github')
await import('@actions/core')
const {ContextSource, getContext} = await import('../src/context.js')

const {getRelease, createOrUpdateRelease} = await import('../src/release.js')
import type {Inputs} from '../src/context.js'
import type {ReleaseData} from '../src/release.js'

let gh: ReturnType<typeof github.getOctokit>

const workflowInputs: Inputs = {
  githubToken: '_',
  majorLabel: 'major',
  minorLabel: 'minor',
  header: '',
  footer: '',
  variables: [],
  collapseAfter: 0,
  publish: false,
  configPath: '.github/release.yml',
  dryRun: false,
  groupDependencies: true,
  removeConventionalPrefixes: false,
  context: ContextSource.workflow,
}

describe('getRelease', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    gh = github.getOctokit('_')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jest.mocked(getContext).mockResolvedValue(githubfix.context as any)
  })

  test('should return the latest release when multiple releases exist', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockResponse: any = {
      headers: {},
      status: 200,
      data: [
        {
          tag_name: 'v1.0.2',
          target_commitish: 'main',
          draft: false,
        },
        {
          tag_name: 'v1.0.1',
          target_commitish: 'main',
          draft: false,
        },
        {
          tag_name: 'v1.0.0',
          target_commitish: 'main',
          draft: false,
        },
      ],
    }

    jest.spyOn(gh.rest.repos, 'listReleases').mockResolvedValue(mockResponse)

    const releaseData = await getRelease(gh, workflowInputs)

    expect(releaseData.releases).toHaveLength(3)
    expect(releaseData.latestRelease).toBe('v1.0.2')
  })

  test('should return the latest for the current branch', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockResponse: any = {
      headers: {},
      status: 200,
      data: [
        {
          tag_name: 'v1.0.2',
          target_commitish: 'dev',
          draft: false,
        },
        {
          tag_name: 'v1.0.1',
          target_commitish: 'main',
          draft: false,
        },
        {
          tag_name: 'v1.0.0',
          target_commitish: 'main',
          draft: false,
        },
      ],
    }

    jest.spyOn(gh.rest.repos, 'listReleases').mockResolvedValue(mockResponse)

    const releaseData = await getRelease(gh, workflowInputs)

    expect(releaseData.releases).toHaveLength(3)
    expect(releaseData.latestRelease).toBe('v1.0.1')
  })

  test('should return the latest non-draft release', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockResponse: any = {
      headers: {},
      status: 200,
      data: [
        {
          tag_name: 'v1.0.2',
          target_commitish: 'dev',
          draft: false,
        },
        {
          tag_name: 'v1.0.1',
          target_commitish: 'main',
          draft: true,
        },
        {
          tag_name: 'v1.0.0',
          target_commitish: 'main',
          draft: false,
        },
      ],
    }

    jest.spyOn(gh.rest.repos, 'listReleases').mockResolvedValue(mockResponse)

    const releaseData = await getRelease(gh, workflowInputs)

    expect(releaseData.releases).toHaveLength(3)
    expect(releaseData.latestRelease).toBe('v1.0.0')
  })

  test('should return v0.0.0 when no releases exist', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockResponse: any = {
      headers: {},
      status: 200,
      data: [],
    }

    jest.spyOn(gh.rest.repos, 'listReleases').mockResolvedValue(mockResponse)

    const releaseData = await getRelease(gh, workflowInputs)

    expect(releaseData.releases).toHaveLength(0)
    expect(releaseData.latestRelease).toBe('v0.0.0')
  })

  test('should use local git state when context is git', async () => {
    jest.mocked(getContext).mockResolvedValue({
      ...githubfix.context,
      ref: 'refs/heads/feature-branch',
      sha: 'abc1234',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockResponse: any = {
      headers: {},
      status: 200,
      data: [
        {
          tag_name: 'v2.0.0',
          target_commitish: 'feature-branch',
          draft: false,
        },
        {
          tag_name: 'v1.0.0',
          target_commitish: 'main',
          draft: false,
        },
      ],
    }

    jest.spyOn(gh.rest.repos, 'listReleases').mockResolvedValue(mockResponse)

    const gitInputs: Inputs = {...workflowInputs, context: ContextSource.git}
    const releaseData = await getRelease(gh, gitInputs)

    expect(getContext).toHaveBeenCalledWith(ContextSource.git)
    expect(releaseData.branch).toBe('feature-branch')
    expect(releaseData.latestRelease).toBe('v2.0.0')
  })
})

describe('createOrUpdateRelease', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockResponse: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockNotes: any
  const inputs: Inputs = {
    githubToken: '_',
    majorLabel: 'major',
    minorLabel: 'minor',
    header: 'header',
    footer: 'footer',
    variables: [],
    collapseAfter: 0,
    publish: false,
    configPath: '.github/release.yml',
    dryRun: false,
    groupDependencies: true,
    removeConventionalPrefixes: false,
    context: ContextSource.workflow,
  }
  beforeEach(() => {
    jest.clearAllMocks()
    gh = github.getOctokit('_')
    mockResponse = {
      headers: {},
      status: 200,
      data: [
        {
          id: 1,
          tag_name: 'v1.0.0',
          target_commitish: 'main',
          draft: false,
          body: 'header',
        },
        {
          id: 2,
          tag_name: 'v1.0.1',
          target_commitish: 'main',
          draft: true,
          body: 'header',
        },
      ],
    }

    mockNotes = {
      headers: {},
      status: 200,
      data: {
        body: 'header',
        name: 'v1.0.1',
      },
    }
  })

  it('should create a new release draft', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockInputCreate: any = {
      headers: {},
      status: 200,
      data: [
        {
          id: 1,
          tag_name: 'v1.0.0',
          target_commitish: 'main',
          draft: false,
        },
      ],
    }

    const mockReleases = jest.spyOn(gh.rest.repos, 'createRelease')
    mockReleases.mockResolvedValue(mockResponse)

    const mockRelease = jest.spyOn(gh.rest.repos, 'listReleases')
    mockRelease.mockResolvedValue(mockInputCreate)

    const mockReleaseNotes = jest.spyOn(gh.rest.repos, 'generateReleaseNotes')
    mockReleaseNotes.mockResolvedValue(mockNotes)

    const releaseData: ReleaseData = {
      latestRelease: 'v1.0.0',
      releases: mockInputCreate.data,
      branch: 'main',
      nextRelease: 'v1.0.1',
    }

    await createOrUpdateRelease(gh, inputs, releaseData)

    expect(mockReleases).toHaveBeenCalledTimes(1)
  })

  it('should update an existing release draft', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockInputUpdate: any = {
      headers: {},
      status: 200,
      data: [
        {
          id: 1,
          tag_name: 'v1.0.0',
          target_commitish: 'main',
          draft: false,
        },
        {
          id: 2,
          tag_name: 'v1.0.1',
          target_commitish: 'main',
          draft: true,
        },
      ],
    }

    const releaseData: ReleaseData = {
      latestRelease: 'v1.0.0',
      releases: mockInputUpdate.data,
      branch: 'main',
      nextRelease: 'v1.0.1',
    }

    const mockReleases = jest.spyOn(gh.rest.repos, 'updateRelease')
    mockReleases.mockResolvedValue(mockResponse)

    const mockRelease = jest.spyOn(gh.rest.repos, 'listReleases')
    mockRelease.mockResolvedValue(mockInputUpdate)

    const mockReleaseNotes = jest.spyOn(gh.rest.repos, 'generateReleaseNotes')
    mockReleaseNotes.mockResolvedValue(mockNotes)

    await createOrUpdateRelease(gh, inputs, releaseData)

    expect(mockReleases).toHaveBeenCalledTimes(1)
  })
})
