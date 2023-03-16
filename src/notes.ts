import * as github from '@actions/github'
import * as semver from 'semver'
import {Inputs} from './context'

export async function generateReleaseNotes(
  client: ReturnType<typeof github.getOctokit>,
  inputs: Inputs,
  latestRelease: string,
  nextRelease: string,
): Promise<string> {
  const context = github.context
  const notes = await client.rest.repos.generateReleaseNotes({
    ...context.repo,
    tag_name: nextRelease,
    previous_tag_name: semver.gt(latestRelease, '0.0.0') ? latestRelease : '',
    target_commitish: context.ref.replace('refs/heads/', ''),
  })

  let body = notes.data.body
  if (inputs.header) {
    let header = replaceAll(inputs.header, '%TAG%', nextRelease)
    header = replaceAll(header, '%TAG_STRIPPED%', nextRelease.replace('v', ''))
    body = `${header}\n\n${body}`
  }
  if (inputs.footer) {
    let footer = replaceAll(inputs.footer, '%TAG%', nextRelease)
    footer = replaceAll(footer, '%TAG_STRIPPED%', nextRelease.replace('v', ''))
    body = `${body}\n\n${footer}`
  }

  return body
}

export async function parseNotes(notes: string, major: string, minor: string): Promise<string> {
  let notesType

  notes.includes(`### ${minor}`) ? (notesType = 'minor') : (notesType = 'patch')
  notes.includes(`### ${major}`) ? (notesType = 'major') : notesType

  return notesType
}

function replaceAll(str: string, find: string, replace: string): string {
  return str.replace(new RegExp(find, 'g'), replace)
}
