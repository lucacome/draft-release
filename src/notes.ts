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

  body = collapseSections(body, inputs.collapseAfter)

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

function collapseSections(markdownText: string, n: number): string {
  if (n < 1) {
    return markdownText
  }
  const beforeText = `<details><summary>{count} changes</summary>\n\n`
  const afterText = `\n</details>\n`

  const processed = markdownText.split('\n').reduce(
    (acc, line) => {
      if (line.startsWith('###')) {
        if (acc.inSection) {
          acc.result +=
            acc.itemCount > n
              ? acc.sectionHeader + beforeText.replace('{count}', acc.itemCount.toString()) + acc.sectionContent + afterText + '\n'
              : acc.sectionHeader + acc.sectionContent
        }
        acc.sectionHeader = line + '\n'
        acc.sectionContent = ''
        acc.inSection = true
        acc.itemCount = 0
      } else if (acc.inSection && line.startsWith('* ')) {
        acc.itemCount++
        acc.sectionContent += line + '\n'
      } else {
        if (acc.inSection) {
          acc.result +=
            acc.itemCount > n
              ? acc.sectionHeader + beforeText.replace('{count}', acc.itemCount.toString()) + acc.sectionContent + afterText + '\n'
              : acc.sectionHeader + acc.sectionContent
          acc.inSection = false
        }
        acc.result += line + '\n'
      }
      return acc
    },
    {
      result: '',
      inSection: false,
      itemCount: 0,
      sectionContent: '',
      sectionHeader: '',
    },
  )

  if (processed.inSection) {
    processed.result +=
      processed.itemCount > n
        ? processed.sectionHeader +
          beforeText.replace('{count}', processed.itemCount.toString()) +
          processed.sectionContent +
          afterText +
          '\n'
        : processed.sectionHeader + processed.sectionContent
  }

  return processed.result.trim()
}
