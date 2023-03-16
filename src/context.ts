import * as core from '@actions/core'

export interface Inputs {
  githubToken: string
  majorLabel: string
  minorLabel: string
  header: string
  footer: string
}

export function getInputs(): Inputs {
  return {
    githubToken: core.getInput('github-token'),
    majorLabel: core.getInput('major-label'),
    minorLabel: core.getInput('minor-label'),
    header: core.getInput('notes-header'),
    footer: core.getInput('notes-footer'),
  }
}
