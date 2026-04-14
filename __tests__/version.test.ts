import {jest, describe, expect, it, beforeEach} from '@jest/globals'
import {ContextSource} from '../src/context.js'
import type {Inputs} from '../src/context.js'

jest.unstable_mockModule('../src/category.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getCategories: jest.fn<() => Promise<any>>().mockResolvedValue([
    {title: '🚀 Features', labels: ['enhancement']},
    {title: '💣 Breaking Changes', labels: ['change']},
    {title: '🐛 Bug Fixes', labels: ['bug']},
  ]),
}))

const {getVersionIncrease} = await import('../src/version.js')

describe('getVersionIncrease', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  const baseInputs: Inputs = {
    majorLabel: '',
    minorLabel: '',
    githubToken: '',
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

  const releaseData = {
    releases: [],
    latestRelease: '1.0.0',
    branch: 'main',
    nextRelease: '1.0.1',
  }

  it('should return patch with empty labels (bug)', async () => {
    const inputs: Inputs = {...baseInputs}
    const version = await getVersionIncrease(releaseData, inputs, '### 🐛 Bug Fixes')
    expect(version).toEqual('1.0.1')
  })
  it('should return patch with empty labels (feature)', async () => {
    const inputs: Inputs = {...baseInputs}
    const version = await getVersionIncrease(releaseData, inputs, '### 🚀 Features')
    expect(version).toEqual('1.0.1')
  })
  it('should return patch with empty labels (change)', async () => {
    const inputs: Inputs = {...baseInputs}
    const version = await getVersionIncrease(releaseData, inputs, '### 💣 Breaking Changes')
    expect(version).toEqual('1.0.1')
  })

  it('should return minor', async () => {
    const inputs: Inputs = {...baseInputs, minorLabel: 'enhancement', majorLabel: 'change'}

    const version = await getVersionIncrease(
      releaseData,
      inputs,
      `
            ### 🚀 Features
            some feaures
            ### 🐛 Bug Fixes
            some bug fixes
        `,
    )
    expect(version).toEqual('1.1.0')
  })
  it('should return major', async () => {
    const inputs: Inputs = {...baseInputs, minorLabel: 'bug', majorLabel: 'change'}
    const version = await getVersionIncrease(
      releaseData,
      inputs,
      `
            ### 💣 Breaking Changes
            some breaking changes
            ### 🐛 Bug Fixes
            some bug fixes
        `,
    )
    expect(version).toEqual('2.0.0')
  })
})
