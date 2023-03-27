import * as core from '@actions/core'
import {Util} from '@docker/actions-toolkit/lib/util'

export interface Inputs {
  githubToken: string
  majorLabel: string
  minorLabel: string
  header: string
  footer: string
  variables: string[]
}

export function getInputs(): Inputs {
  return {
    githubToken: core.getInput('github-token'),
    majorLabel: core.getInput('major-label'),
    minorLabel: core.getInput('minor-label'),
    header: core.getInput('notes-header'),
    footer: core.getInput('notes-footer'),
    variables: Util.getInputList('variables'),
  }
}
