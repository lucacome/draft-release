import type * as core from '@actions/core'
import {jest} from '@jest/globals'

export const debug = jest.fn<typeof core.debug>()
export const error = jest.fn<typeof core.error>()
export const info = jest.fn<typeof core.info>()
export const getBooleanInput = jest.fn<typeof core.getBooleanInput>()
export const getInput = jest.fn<typeof core.getInput>()
export const setOutput = jest.fn<typeof core.setOutput>()
export const setFailed = jest.fn<typeof core.setFailed>()
export const warning = jest.fn<typeof core.warning>()
export const startGroup = jest.fn<typeof core.startGroup>()
export const endGroup = jest.fn<typeof core.endGroup>()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const groupImpl = async (_name: string, fn: () => Promise<any>) => fn()
export const group = jest.fn(groupImpl) as unknown as typeof core.group
