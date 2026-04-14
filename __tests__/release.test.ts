import {jest, describe, expect, it, beforeEach} from '@jest/globals'
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
const core = await import('@actions/core')
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

  it('should return the latest release when multiple releases exist', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockResponse: any = {
      headers: {},
      status: 200,
      data: [
        {
          tag_name: 'v1.0.2',
          target_commitish: 'main',
          draft: false,
          created_at: '2024-03-03T00:00:00Z',
        },
        {
          tag_name: 'v1.0.1',
          target_commitish: 'main',
          draft: false,
          created_at: '2024-03-02T00:00:00Z',
        },
        {
          tag_name: 'v1.0.0',
          target_commitish: 'main',
          draft: false,
          created_at: '2024-03-01T00:00:00Z',
        },
      ],
    }

    jest.spyOn(gh.rest.repos, 'listReleases').mockResolvedValue(mockResponse)

    const releaseData = await getRelease(gh, workflowInputs)

    expect(releaseData.releases).toHaveLength(3)
    expect(releaseData.latestRelease).toBe('v1.0.2')
  })

  it('should return the latest for the current branch', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockResponse: any = {
      headers: {},
      status: 200,
      data: [
        {
          tag_name: 'v1.0.2',
          target_commitish: 'dev',
          draft: false,
          created_at: '2024-03-03T00:00:00Z',
        },
        {
          tag_name: 'v1.0.1',
          target_commitish: 'main',
          draft: false,
          created_at: '2024-03-02T00:00:00Z',
        },
        {
          tag_name: 'v1.0.0',
          target_commitish: 'main',
          draft: false,
          created_at: '2024-03-01T00:00:00Z',
        },
      ],
    }

    jest.spyOn(gh.rest.repos, 'listReleases').mockResolvedValue(mockResponse)

    const releaseData = await getRelease(gh, workflowInputs)

    expect(releaseData.releases).toHaveLength(3)
    expect(releaseData.latestRelease).toBe('v1.0.1')
  })

  it('should return the latest non-draft release', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockResponse: any = {
      headers: {},
      status: 200,
      data: [
        {
          tag_name: 'v1.0.2',
          target_commitish: 'dev',
          draft: false,
          created_at: '2024-03-03T00:00:00Z',
        },
        {
          tag_name: 'v1.0.1',
          target_commitish: 'main',
          draft: true,
          created_at: '2024-03-02T00:00:00Z',
        },
        {
          tag_name: 'v1.0.0',
          target_commitish: 'main',
          draft: false,
          created_at: '2024-03-01T00:00:00Z',
        },
      ],
    }

    jest.spyOn(gh.rest.repos, 'listReleases').mockResolvedValue(mockResponse)

    const releaseData = await getRelease(gh, workflowInputs)

    expect(releaseData.releases).toHaveLength(3)
    expect(releaseData.latestRelease).toBe('v1.0.0')
  })

  it('should return v0.0.0 when no releases exist', async () => {
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

  it('should use local git state when context is git', async () => {
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
          created_at: '2024-03-02T00:00:00Z',
        },
        {
          tag_name: 'v1.0.0',
          target_commitish: 'main',
          draft: false,
          created_at: '2024-03-01T00:00:00Z',
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

  it('should set nextRelease to tag name and branch to "tag" for tag-triggered events', async () => {
    jest.mocked(getContext).mockResolvedValue({
      ...githubfix.context,
      ref: 'refs/tags/v1.2.3',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockResponse: any = {
      headers: {},
      status: 200,
      data: [
        {
          tag_name: 'v1.0.0',
          target_commitish: 'main',
          draft: false,
          created_at: '2024-03-01T00:00:00Z',
        },
      ],
    }

    jest.spyOn(gh.rest.repos, 'listReleases').mockResolvedValue(mockResponse)

    const releaseData = await getRelease(gh, workflowInputs)

    expect(releaseData.branch).toBe('tag')
    expect(releaseData.nextRelease).toBe('v1.2.3')
  })

  it('should return v0.0.0 when all releases are drafts', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockResponse: any = {
      headers: {},
      status: 200,
      data: [
        {
          tag_name: 'v1.0.2',
          target_commitish: 'main',
          draft: true,
          created_at: '2024-03-02T00:00:00Z',
        },
        {
          tag_name: 'v1.0.1',
          target_commitish: 'main',
          draft: true,
          created_at: '2024-03-01T00:00:00Z',
        },
      ],
    }

    jest.spyOn(gh.rest.repos, 'listReleases').mockResolvedValue(mockResponse)

    const releaseData = await getRelease(gh, workflowInputs)

    expect(releaseData.latestRelease).toBe('v0.0.0')
  })

  it('should propagate API errors from paginate', async () => {
    jest.spyOn(gh.rest.repos, 'listReleases').mockRejectedValue(new Error('API error'))

    await expect(getRelease(gh, workflowInputs)).rejects.toThrow('API error')
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jest.mocked(getContext).mockResolvedValue(githubfix.context as any)
    mockResponse = {
      headers: {},
      status: 200,
      data: {
        id: 2,
        tag_name: 'v1.0.1',
        target_commitish: 'main',
        html_url: 'https://github.com/lucacome/draft-release/releases/tag/v1.0.1',
        draft: true,
        body: 'header',
      },
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
    const releaseData: ReleaseData = {
      latestRelease: 'v1.0.0',
      releases: [],
      branch: 'main',
      nextRelease: 'v1.0.1',
    }

    const mockReleases = jest.spyOn(gh.rest.repos, 'createRelease')
    mockReleases.mockResolvedValue(mockResponse)

    const mockReleaseNotes = jest.spyOn(gh.rest.repos, 'generateReleaseNotes')
    mockReleaseNotes.mockResolvedValue(mockNotes)

    await createOrUpdateRelease(gh, inputs, releaseData)

    expect(mockReleases).toHaveBeenCalledTimes(1)
  })

  it('should update an existing release draft', async () => {
    const releaseData: ReleaseData = {
      latestRelease: 'v1.0.0',
      releases: [
        {
          id: 1,
          tag_name: 'v1.0.0',
          target_commitish: 'main',
          draft: false,
          created_at: '2024-03-01T00:00:00Z',
        },
        {
          id: 2,
          tag_name: 'v1.0.1',
          target_commitish: 'main',
          draft: true,
          created_at: '2024-03-02T00:00:00Z',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any[],
      branch: 'main',
      nextRelease: 'v1.0.1',
    }

    const mockReleases = jest.spyOn(gh.rest.repos, 'updateRelease')
    mockReleases.mockResolvedValue(mockResponse)

    const mockReleaseNotes = jest.spyOn(gh.rest.repos, 'generateReleaseNotes')
    mockReleaseNotes.mockResolvedValue(mockNotes)

    await createOrUpdateRelease(gh, inputs, releaseData)

    expect(mockReleases).toHaveBeenCalledTimes(1)
  })

  it('should skip API calls and output empty strings when dryRun is true', async () => {
    const dryRunInputs: Inputs = {...inputs, dryRun: true}

    const mockReleaseNotes = jest.spyOn(gh.rest.repos, 'generateReleaseNotes')
    mockReleaseNotes.mockResolvedValue(mockNotes)

    const mockCreate = jest.spyOn(gh.rest.repos, 'createRelease')
    const mockUpdate = jest.spyOn(gh.rest.repos, 'updateRelease')

    const releaseData: ReleaseData = {
      latestRelease: 'v1.0.0',
      releases: [],
      branch: 'main',
      nextRelease: 'v1.0.1',
    }

    await createOrUpdateRelease(gh, dryRunInputs, releaseData)

    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()

    expect(core.setOutput).toHaveBeenCalledWith('release-id', '')
    expect(core.setOutput).toHaveBeenCalledWith('release-url', '')
  })

  it('should create a new draft when branch is tag but no matching draft exists', async () => {
    const releaseData: ReleaseData = {
      latestRelease: 'v1.0.0',
      releases: [],
      branch: 'tag',
      nextRelease: 'v1.0.1',
    }

    const mockReleaseNotes = jest.spyOn(gh.rest.repos, 'generateReleaseNotes')
    mockReleaseNotes.mockResolvedValue(mockNotes)

    const mockCreate = jest.spyOn(gh.rest.repos, 'createRelease')
    mockCreate.mockResolvedValue(mockResponse)

    await createOrUpdateRelease(gh, inputs, releaseData)

    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        tag_name: 'v1.0.1',
        target_commitish: 'v1.0.1',
        draft: true,
      }),
    )
    // generateReleaseNotes must not receive 'tag' as target_commitish
    expect(mockReleaseNotes).toHaveBeenCalledWith(expect.objectContaining({target_commitish: 'v1.0.1'}))
  })

  it('should update existing draft when branch is tag and matching draft exists', async () => {
    const releaseData: ReleaseData = {
      latestRelease: 'v1.0.0',
      releases: [
        {
          id: 5,
          tag_name: 'v1.0.1',
          target_commitish: 'main',
          draft: true,
          created_at: '2024-03-02T00:00:00Z',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any[],
      branch: 'tag',
      nextRelease: 'v1.0.1',
    }

    const mockReleaseNotes = jest.spyOn(gh.rest.repos, 'generateReleaseNotes')
    mockReleaseNotes.mockResolvedValue(mockNotes)

    const mockUpdate = jest.spyOn(gh.rest.repos, 'updateRelease')
    mockUpdate.mockResolvedValue(mockResponse)

    await createOrUpdateRelease(gh, inputs, releaseData)

    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        tag_name: 'v1.0.1',
        // uses the draft's target_commitish (the branch it was prepared on), not the tag name
        target_commitish: 'main',
        release_id: 5,
        draft: true,
      }),
    )
    // generateReleaseNotes must receive the draft's branch, not 'tag'
    expect(mockReleaseNotes).toHaveBeenCalledWith(expect.objectContaining({target_commitish: 'main'}))
  })

  it('should create a non-draft release when branch is tag and publish is true', async () => {
    const publishInputs: Inputs = {...inputs, publish: true}

    const releaseData: ReleaseData = {
      latestRelease: 'v1.0.0',
      releases: [],
      branch: 'tag',
      nextRelease: 'v1.0.1',
    }

    const mockReleaseNotes = jest.spyOn(gh.rest.repos, 'generateReleaseNotes')
    mockReleaseNotes.mockResolvedValue(mockNotes)

    const mockCreate = jest.spyOn(gh.rest.repos, 'createRelease')
    mockCreate.mockResolvedValue(mockResponse)

    await createOrUpdateRelease(gh, publishInputs, releaseData)

    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        tag_name: 'v1.0.1',
        target_commitish: 'v1.0.1',
        draft: false,
      }),
    )
  })

  it('should publish existing draft when branch is tag and publish is true', async () => {
    const publishInputs: Inputs = {...inputs, publish: true}

    const releaseData: ReleaseData = {
      latestRelease: 'v1.0.0',
      releases: [
        {
          id: 5,
          tag_name: 'v1.0.1',
          target_commitish: 'main',
          draft: true,
          created_at: '2024-03-02T00:00:00Z',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any[],
      branch: 'tag',
      nextRelease: 'v1.0.1',
    }

    const mockReleaseNotes = jest.spyOn(gh.rest.repos, 'generateReleaseNotes')
    mockReleaseNotes.mockResolvedValue(mockNotes)

    const mockUpdate = jest.spyOn(gh.rest.repos, 'updateRelease')
    mockUpdate.mockResolvedValue(mockResponse)

    await createOrUpdateRelease(gh, publishInputs, releaseData)

    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        tag_name: 'v1.0.1',
        target_commitish: 'main',
        release_id: 5,
        draft: false,
      }),
    )
  })

  it('should update stale same-branch draft when tag does not match nextRelease', async () => {
    const releaseData: ReleaseData = {
      latestRelease: 'v2.0.4',
      releases: [
        {
          id: 10,
          tag_name: 'v2.0.5',
          target_commitish: 'main',
          draft: true,
          created_at: '2024-03-01T00:00:00Z',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any[],
      branch: 'main',
      nextRelease: 'v2.1.0',
    }

    const mockReleaseNotes = jest.spyOn(gh.rest.repos, 'generateReleaseNotes')
    mockReleaseNotes.mockResolvedValue(mockNotes)

    const mockUpdate = jest.spyOn(gh.rest.repos, 'updateRelease')
    mockUpdate.mockResolvedValue(mockResponse)

    const mockCreate = jest.spyOn(gh.rest.repos, 'createRelease')

    await createOrUpdateRelease(gh, inputs, releaseData)

    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        tag_name: 'v2.1.0',
        target_commitish: 'main',
        release_id: 10,
        draft: true,
      }),
    )
  })

  it('should create a new draft when the only existing draft targets a different branch', async () => {
    const releaseData: ReleaseData = {
      latestRelease: 'v2.0.4',
      releases: [
        {
          id: 10,
          tag_name: 'v2.0.5',
          target_commitish: 'release/2.x',
          draft: true,
          created_at: '2024-03-01T00:00:00Z',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any[],
      branch: 'main',
      nextRelease: 'v2.1.0',
    }

    const mockReleaseNotes = jest.spyOn(gh.rest.repos, 'generateReleaseNotes')
    mockReleaseNotes.mockResolvedValue(mockNotes)

    const mockCreate = jest.spyOn(gh.rest.repos, 'createRelease')
    mockCreate.mockResolvedValue(mockResponse)

    const mockUpdate = jest.spyOn(gh.rest.repos, 'updateRelease')

    await createOrUpdateRelease(gh, inputs, releaseData)

    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        tag_name: 'v2.1.0',
        target_commitish: 'main',
        draft: true,
      }),
    )
  })

  it('should not reuse a draft with the same tag that targets a different branch', async () => {
    const releaseData: ReleaseData = {
      latestRelease: 'v2.0.4',
      releases: [
        {
          id: 99,
          tag_name: 'v2.1.0',
          target_commitish: 'release/2.x',
          draft: true,
          created_at: '2024-03-01T00:00:00Z',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any[],
      branch: 'main',
      nextRelease: 'v2.1.0',
    }

    const mockReleaseNotes = jest.spyOn(gh.rest.repos, 'generateReleaseNotes')
    mockReleaseNotes.mockResolvedValue(mockNotes)

    const mockCreate = jest.spyOn(gh.rest.repos, 'createRelease')
    mockCreate.mockResolvedValue(mockResponse)

    const mockUpdate = jest.spyOn(gh.rest.repos, 'updateRelease')

    await createOrUpdateRelease(gh, inputs, releaseData)

    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        tag_name: 'v2.1.0',
        target_commitish: 'main',
        draft: true,
      }),
    )
  })

  it('should pick the most recent draft when multiple drafts exist on the same branch', async () => {
    const releaseData: ReleaseData = {
      latestRelease: 'v2.0.4',
      releases: [
        {
          id: 20,
          tag_name: 'v2.0.5',
          target_commitish: 'main',
          draft: true,
          created_at: '2024-03-02T00:00:00Z',
        },
        {
          id: 10,
          tag_name: 'v2.0.4',
          target_commitish: 'main',
          draft: true,
          created_at: '2024-03-01T00:00:00Z',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any[],
      branch: 'main',
      nextRelease: 'v2.1.0',
    }

    const mockReleaseNotes = jest.spyOn(gh.rest.repos, 'generateReleaseNotes')
    mockReleaseNotes.mockResolvedValue(mockNotes)

    const mockUpdate = jest.spyOn(gh.rest.repos, 'updateRelease')
    mockUpdate.mockResolvedValue(mockResponse)

    const mockCreate = jest.spyOn(gh.rest.repos, 'createRelease')

    await createOrUpdateRelease(gh, inputs, releaseData)

    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        release_id: 20,
        tag_name: 'v2.1.0',
        target_commitish: 'main',
        draft: true,
      }),
    )
  })

  it('should set release-id and release-url outputs from the API response', async () => {
    const releaseData: ReleaseData = {
      latestRelease: 'v1.0.0',
      releases: [],
      branch: 'main',
      nextRelease: 'v1.0.1',
    }

    jest.spyOn(gh.rest.repos, 'generateReleaseNotes').mockResolvedValue(mockNotes)
    jest.spyOn(gh.rest.repos, 'createRelease').mockResolvedValue(mockResponse)

    await createOrUpdateRelease(gh, inputs, releaseData)

    expect(core.setOutput).toHaveBeenCalledWith('release-id', '2')
    expect(core.setOutput).toHaveBeenCalledWith('release-url', 'https://github.com/lucacome/draft-release/releases/tag/v1.0.1')
  })
})
