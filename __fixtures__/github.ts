import type * as github from '@actions/github'
import {jest} from '@jest/globals'

export const context: Partial<typeof github.context> = {
  payload: {
    pull_request: {
      number: 123,
    },
  },
  repo: {
    owner: 'monalisa',
    repo: 'helloworld',
  },
  ref: 'refs/heads/main',
}

export const getOctokit = jest.fn<typeof github.getOctokit>().mockImplementation(() => ({
  rest: {
    issues: {
      addLabels: jest.fn(),
      removeLabel: jest.fn(),
    },
    pulls: {
      get: jest.fn().mockResolvedValue({}),
      listFiles: {
        endpoint: {
          merge: jest.fn().mockReturnValue({}),
        },
      },
    },
    repos: {
      getContent: jest.fn(),
      listReleases: jest.fn(),
      createRelease: jest.fn(),
      updateRelease: jest.fn(),
      generateReleaseNotes: jest.fn(),
    },
  },
  paginate: jest
    .fn()
    .mockImplementation(
      async (method: (options: Record<string, unknown>) => Promise<{data: unknown[]}>, options: Record<string, unknown>) => {
        const response = await method(options)
        return response.data
      },
    ),
}))
