import {getRelease, createOrUpdateRelease, ReleaseData} from '../src/release'
import * as github from '@actions/github'
import {Inputs} from '../src/context'

const fs = jest.requireActual('fs')

jest.mock('@actions/core')
jest.mock('@actions/github')

let gh: ReturnType<typeof github.getOctokit>

describe('getRelease', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    gh = github.getOctokit('_')
  })

  it('should return the latest release when multiple releases exist', async () => {
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

    const mockReleases = jest.spyOn(gh.rest.repos, 'listReleases')
    mockReleases.mockResolvedValue(mockResponse)

    const releaseData = await getRelease(gh)

    expect(releaseData.releases).toHaveLength(3)
    expect(releaseData.latestRelease).toBe('v1.0.2')
  })

  it('should return the latest for the current branch', async () => {
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

    const mockReleases = jest.spyOn(gh.rest.repos, 'listReleases')
    mockReleases.mockResolvedValue(mockResponse)

    const releaseData = await getRelease(gh)

    expect(releaseData.releases).toHaveLength(3)
    expect(releaseData.latestRelease).toBe('v1.0.1')
  })

  it('should return the latest non-draft release', async () => {
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

    const mockReleases = jest.spyOn(gh.rest.repos, 'listReleases')
    mockReleases.mockResolvedValue(mockResponse)

    const releaseData = await getRelease(gh)

    expect(releaseData.releases).toHaveLength(3)
    expect(releaseData.latestRelease).toBe('v1.0.0')
  })

  it('should return v0.0.0 when no releases exist', async () => {
    const mockResponse: any = {
      headers: {},
      status: 200,
      data: [],
    }

    const mockReleases = jest.spyOn(gh.rest.repos, 'listReleases')
    mockReleases.mockResolvedValue(mockResponse)

    const releaseData = await getRelease(gh)

    expect(releaseData.releases).toHaveLength(0)
    expect(releaseData.latestRelease).toBe('v0.0.0')
  })
})

describe('createOrUpdateRelease', () => {
  let mockResponse: any
  let mockNotes: any
  const inputs: Inputs = {
    githubToken: '_',
    majorLabel: 'major',
    minorLabel: 'minor',
    header: 'header',
    footer: 'footer',
    variables: [],
    collapseAfter: 0,
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

    const response = await createOrUpdateRelease(gh, inputs, releaseData)

    expect(mockReleases).toHaveBeenCalledTimes(1)
  })

  it('should update an existing release draft', async () => {
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

    const response = await createOrUpdateRelease(gh, inputs, releaseData)

    expect(mockReleases).toHaveBeenCalledTimes(1)
  })
})
