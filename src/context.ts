import * as core from '@actions/core'
import {Util} from '@docker/actions-toolkit/lib/util'

export interface Inputs {
  githubToken: string
  majorLabel: string
  minorLabel: string
  header: string
  footer: string
  variables: string[]
  collapseAfter: number
  publish: boolean
  configPath: string
  dryRun: boolean
  groupDependencies: boolean
  removeConventionalPrefixes: boolean
}

/**
 * Retrieves and parses the inputs for the GitHub Action.
 *
 * This function collects input values using the GitHub Actions core utilities and
 * returns them as an object that conforms to the Inputs interface. It converts string
 * inputs to appropriate types where necessary, such as parsing the 'collapse-after'
 * input to an integer and interpreting 'publish', 'dry-run', and 'group-dependencies' as booleans.
 *
 * @returns An object containing the structured inputs for the action.
 */
export function getInputs(): Inputs {
  return {
    githubToken: core.getInput('github-token'),
    majorLabel: core.getInput('major-label'),
    minorLabel: core.getInput('minor-label'),
    header: core.getInput('notes-header'),
    footer: core.getInput('notes-footer'),
    variables: Util.getInputList('variables'),
    collapseAfter: parseInt(core.getInput('collapse-after'), 10),
    publish: core.getBooleanInput('publish'),
    configPath: core.getInput('config-path'),
    dryRun: core.getBooleanInput('dry-run'),
    groupDependencies: core.getBooleanInput('group-dependencies'),
    removeConventionalPrefixes: core.getBooleanInput('remove-conventional-prefixes'),
  }
}
