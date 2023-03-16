import * as github from '@actions/github'
import * as semver from 'semver'
import {Inputs} from './context'

export async function generateReleaseNotes(
  client: ReturnType<typeof github.getOctokit>,
  inputs: Inputs,
  latestRelease: string,
  releaseID: number,
  nextRelease: string,
): Promise<string> {
  const context = github.context
  const notes = await client.rest.repos.generateReleaseNotes({
    ...context.repo,
    release_id: releaseID,
    tag_name: nextRelease,
    previous_tag_name: semver.gt(latestRelease, '0.0.0') ? latestRelease : '',
    target_commitish: context.ref.replace('refs/heads/', ''),
  })

  let body = notes.data.body
  if (inputs.header) {
    body = `${inputs.header.replace('%TAG%', nextRelease)}\n\n${body}`
  }
  if (inputs.footer) {
    body = `${body}\n\n${inputs.footer.replace('%TAG%', nextRelease)}`
  }

  return body
}

export async function parseNotes(notes: string, major: string, minor: string): Promise<string> {
  let notesType

  notes.includes(`### ${minor}`) ? (notesType = 'minor') : (notesType = 'patch')
  notes.includes(`### ${major}`) ? (notesType = 'major') : notesType

  return notesType
}
