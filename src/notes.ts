import * as github from '@actions/github'
import * as semver from 'semver'
import * as handlebars from 'handlebars'
import {Inputs} from './context'

interface VariableObject {
  [key: string]: string
}

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

  // get all the variables from inputs.variables
  const variables: VariableObject = inputs.variables.reduce((acc: VariableObject, variable: string) => {
    const [key, value] = variable.split('=')
    acc[key] = value
    return acc
  }, {})

  // variables to replace in header and footer
  const data = {
    version: nextRelease,
    'version-number': nextRelease.replace('v', ''),
    ...variables,
  }

  if (inputs.header) {
    const header = handlebars.compile(inputs.header)(data)
    body = `${header}\n\n${body}`
  }
  if (inputs.footer) {
    const footer = handlebars.compile(inputs.footer)(data)
    body = `${body}\n\n${footer}`
  }

  return body
}

export function parseNotes(notes: string, major: string, minor: string): string {
  let notesType

  // if minor is empty, default to patch else search for minor in notes
  !minor ? (notesType = 'patch') : (notesType = notes.includes(`### ${minor}`) ? 'minor' : 'patch')

  // if major is empty, default to what was found else search for major in notes
  !major ? notesType : (notesType = notes.includes(`### ${major}`) ? 'major' : notesType)

  return notesType
}
