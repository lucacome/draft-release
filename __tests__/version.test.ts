import {describe, expect, test} from '@jest/globals'
import {getVersionIncrease} from '../src/version'
import {Inputs} from '../src/context'

describe('getVersionIncrease', () => {
  let fakeInputs: Inputs = {
    majorLabel: '',
    minorLabel: '',
    githubToken: '',
    header: '',
    footer: '',
    variables: [],
    collapseAfter: 0,
  }

  test('should return patch with empty labels (bug)', async () => {
    let version = await getVersionIncrease('1.0.0', fakeInputs, '### 🐛 Bug Fixes')
    expect(version).toEqual('1.0.1')
  })
  test('should return patch with empty labels (feature)', async () => {
    let version = await getVersionIncrease('1.0.0', fakeInputs, '### 🚀 Features')
    expect(version).toEqual('1.0.1')
  })
  test('should return patch with empty labels (change)', async () => {
    let version = await getVersionIncrease('1.0.0', fakeInputs, '### 💣 Breaking Changes')
    expect(version).toEqual('1.0.1')
  })

  test('should return minor', async () => {
    fakeInputs.minorLabel = 'enhancement'
    fakeInputs.majorLabel = 'change'
    let version = await getVersionIncrease(
      '1.0.0',
      fakeInputs,
      `
            ### 🚀 Features
            some feaures
            ### 🐛 Bug Fixes
            some bug fixes
        `,
    )
    expect(version).toEqual('1.1.0')
  })
  test('should return major', async () => {
    fakeInputs.minorLabel = 'bug'
    fakeInputs.majorLabel = 'change'
    let version = await getVersionIncrease(
      '1.0.0',
      fakeInputs,
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
