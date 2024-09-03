import * as core from '@actions/core'
import * as github from '@actions/github'
import * as semver from 'semver'
import * as handlebars from 'handlebars'
import {Inputs} from './context'
import {getCategories, Category} from './version'
import {ReleaseData} from './release'

interface VariableObject {
  [key: string]: string
}
type SectionData = {
  [key: string]: string[]
}

export async function generateReleaseNotes(
  client: ReturnType<typeof github.getOctokit>,
  inputs: Inputs,
  releaseData: ReleaseData,
): Promise<string> {
  const context = github.context
  const latestRelease = releaseData.latestRelease
  const nextRelease = releaseData.nextRelease
  const configPath = inputs.configPath
  let body = ''
  let sections: SectionData = {}

  try {
    const notes = await client.rest.repos.generateReleaseNotes({
      ...context.repo,
      tag_name: nextRelease,
      previous_tag_name: semver.gt(latestRelease, '0.0.0') ? latestRelease : '',
      target_commitish: releaseData.branch,
      configuration_file_path: configPath,
    })

    body = notes.data.body

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
      'previous-version': latestRelease,
      'previous-version-number': latestRelease.replace('v', ''),
      ...variables,
    }
    const categories = await getCategories(inputs)
    sections = await splitMarkdownSections(body, categories)

    body = await collapseSections(body, sections, categories, inputs.collapseAfter)

    if (inputs.header) {
      const header = handlebars.compile(inputs.header)(data)
      body = `${header}\n\n${body}`
      core.setOutput('release-header', header?.trim())
    }
    if (inputs.footer) {
      const footer = handlebars.compile(inputs.footer)(data)
      body = `${body}\n\n${footer}`
      core.setOutput('release-footer', footer?.trim())
    }
    core.setOutput('release-sections', JSON.stringify(sections))
  } catch (e) {
    core.error(`Error while generating release notes: ${e}`)
  }

  return body
}

export function parseNotes(notes: string, major: string, minor: string): string {
  let notesType = 'patch'

  if (minor && notes.includes(`### ${minor}`)) {
    notesType = 'minor'
  }

  if (major && notes.includes(`### ${major}`)) {
    notesType = 'major'
  }

  return notesType
}

async function collapseSections(markdown: string, sectionData: SectionData, categories: Category[], n: number): Promise<string> {
  if (n < 1) {
    return markdown
  }
  const beforeTextTemplate = `<details><summary>{count} changes</summary>\n\n`
  const afterText = `\n</details>\n`

  const sectionsToAddText = categories
    .map((category) => category.labels)
    .flat()
    .filter((label) => sectionData[label] && sectionData[label].length > n)

  if (!sectionsToAddText.length) {
    return markdown
  }

  const lines = markdown.split('\n')
  const modifiedLines: string[] = []

  let insideSection = false
  let currentLabel: string | null = null
  let itemCount = 0

  for (const line of lines) {
    const titleMatch = line.match(/###\s(.+)/)

    if (titleMatch) {
      if (insideSection && currentLabel && sectionsToAddText.includes(currentLabel)) {
        modifiedLines.push(afterText)
      }

      const title = titleMatch[1]
      const category = categories.find((cat) => cat.title === title)

      if (category) {
        const labels = category.labels
        currentLabel = labels[0]
        itemCount = 0
        insideSection = true

        if (labels.some((label) => sectionsToAddText.includes(label))) {
          const beforeText = beforeTextTemplate.replace('{count}', String(sectionData[currentLabel].length))
          modifiedLines.push(line, beforeText)
        } else {
          modifiedLines.push(line)
        }
        continue
      }
    }

    if (insideSection && line.trim() !== '') {
      itemCount++

      if (currentLabel && itemCount === sectionData[currentLabel].length && sectionsToAddText.includes(currentLabel)) {
        modifiedLines.push(line, afterText)
        insideSection = false
      } else {
        modifiedLines.push(line)
      }
    } else {
      modifiedLines.push(line)
    }
  }

  return modifiedLines.join('\n')
}

export async function splitMarkdownSections(markdown: string, categories: Category[]): Promise<SectionData> {
  const lines = markdown.split('\n')
  const sections: SectionData = {}

  categories.forEach((category) => {
    category.labels.forEach((label) => {
      sections[label] = []
    })
  })

  let currentLabel = ''

  lines.forEach((line) => {
    const trimmedLine = line.trim()
    if (!trimmedLine) return // Ignore empty lines

    const sectionMatch = trimmedLine.match(/###\s(.+)/)

    if (sectionMatch) {
      const sectionName = sectionMatch[1]

      const matchedCategory = categories.find((category) => category.title === sectionName)
      if (matchedCategory) {
        currentLabel = matchedCategory.labels[0]
      } else {
        currentLabel = ''
      }
    } else if (currentLabel !== '' && trimmedLine.startsWith('* ')) {
      sections[currentLabel].push(trimmedLine)
    } else {
      currentLabel = ''
    }
  })

  return sections
}
