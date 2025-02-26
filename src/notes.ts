import * as core from '@actions/core'
import * as github from '@actions/github'
import * as semver from 'semver'
import * as handlebars from 'handlebars'
import {Inputs} from './context.js'
import {getCategories, Category} from './version.js'
import {ReleaseData} from './release.js'

interface VariableObject {
  [key: string]: string
}
type SectionData = {
  [key: string]: string[]
}

/**
 * Generates and formats release notes for a GitHub repository.
 *
 * This function fetches release notes via GitHub's REST API between specified release tags, processes the resulting markdown
 * by splitting it into categorized sections, and optionally groups dependency updates. It also collapses sections with an
 * item count exceeding the specified threshold and applies header and footer templates populated with dynamic release data.
 * Finally, it sets outputs for the header, footer, and parsed sections before returning the complete markdown.
 *
 * @returns The fully formatted release notes in markdown format.
 */
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

    if (inputs.groupDependencies) {
      await core.group('Grouping dependency updates', async () => {
        sections = await groupDependencyUpdates(sections)
        core.debug(JSON.stringify(sections))
      })
    }

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

/**
 * Determines the type of release update based on version headings in the provided release notes.
 *
 * The function searches the markdown content for headings formatted as "### {minor}" and "### {major}".
 * If a heading for the specified minor version is found, it initially categorizes the release as "minor".
 * If a heading for the specified major version is also present, it overrides the minor designation to "major".
 * In the absence of either heading, the release is classified as a "patch".
 *
 * @param notes - The markdown content containing the release notes.
 * @param major - The major version header to look for (formatted without the "###" prefix).
 * @param minor - The minor version header to look for (formatted without the "###" prefix).
 * @returns A string indicating the release type: "patch", "minor", or "major".
 */
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

/**
 * Re-generates release notes markdown with selectively collapsed sections.
 *
 * The function partitions the original markdown into header, category, and footer parts,
 * then rebuilds the document by processing each category section from the provided section data.
 * If a section contains more items than the specified threshold, its content is wrapped in HTML
 * <details> elements to allow collapsing.
 *
 * @param markdown - The original markdown content.
 * @param sectionData - An object mapping section labels to arrays of markdown entries.
 * @param categories - An array of category configurations, each containing a title and associated labels.
 * @param n - The threshold for collapsing a section; sections with more than n items are collapsed (0 disables collapsing).
 * @returns The updated markdown with collapsed sections where applicable.
 */
async function collapseSections(markdown: string, sectionData: SectionData, categories: Category[], n: number): Promise<string> {
  const beforeTextTemplate = `<details><summary>{count} changes</summary>\n\n`
  const afterText = `\n</details>\n`

  // Get lines of the original markdown
  const originalLines = markdown.split('\n')
  const headerLines: string[] = []
  const footerLines: string[] = []

  // Track the state of our parser
  let inHeaderSection = true
  let inCategorySection = false

  // GitHub release notes typically have:
  // 1. Header (containing "## What's Changed")
  // 2. Category sections (with ### headings)
  // 3. Footer (with "## New Contributors" and "**Full Changelog**" links)

  for (let i = 0; i < originalLines.length; i++) {
    const line = originalLines[i]

    // Detect section headings
    const isL3Heading = line.match(/^###\s(.+)/)
    const isL2Heading = !isL3Heading && line.match(/^##\s(.+)/)

    if (isL3Heading) {
      // Found a category heading (###)
      if (inHeaderSection) {
        inHeaderSection = false
        inCategorySection = true
        continue
      }

      continue
    }

    // Found a major section heading (##) after we've seen category headings
    if (inCategorySection && isL2Heading) {
      inCategorySection = false
      // This is the beginning of the footer
      footerLines.push(line)
      continue
    }

    if (inHeaderSection) {
      headerLines.push(line)
    } else if (!inCategorySection) {
      // If we're not in a category section or header, we're in the footer
      footerLines.push(line)
    }

    // Skip the actual content of the categories, as we'll regenerate it
  }

  // Generate the new section content
  const sectionLines: string[] = []

  // Identify sections that should be collapsed
  const sectionsToAddText =
    n > 0
      ? categories
          .map((category) => category.labels)
          .flat()
          .filter((label) => sectionData[label] && sectionData[label].length > n)
      : []

  // Add each category's content
  for (const category of categories) {
    const label = category.labels[0]
    const items = sectionData[label]

    // Skip empty sections
    if (!items || items.length === 0) continue

    // Add section heading
    sectionLines.push(`### ${category.title}`)

    // Determine if this section should be collapsed
    const shouldCollapse = sectionsToAddText.includes(label)

    if (shouldCollapse) {
      // Add opening details tag with count
      const beforeText = beforeTextTemplate.replace('{count}', String(items.length))
      sectionLines.push(beforeText)
    }

    // Add all items in the section
    sectionLines.push(...items)

    if (shouldCollapse) {
      // Add closing details tag
      sectionLines.push(afterText)
    }

    // Add an empty line after the section
    sectionLines.push('')
  }

  // Combine header, section content, and footer
  const result = [...headerLines, '', ...sectionLines, ...footerLines].join('\n')

  return result
}

/**
 * Splits a markdown string into categorized sections using header and bullet list markers.
 *
 * The function parses the markdown content line by line to detect section headers marked with "### ".
 * When a header matches a category's title, it assigns subsequent bullet list items (lines starting with "* ")
 * to the corresponding section using the first label of the matching category. Empty lines are skipped, and
 * lines that do not match the expected patterns reset the current category.
 *
 * @param markdown - The markdown content to be parsed.
 * @param categories - An array of category definitions, each with a title and associated labels used for mapping sections.
 * @returns A promise that resolves to an object mapping category labels to arrays of markdown bullet list items.
 */
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

/**
 * Consolidates multiple dependency update entries into single entries.
 *
 * Processes parsed release note sections to group dependency updates from Renovate and Dependabot.
 * For each dependency, the function aggregates entries to reflect the latest update while combining all relevant pull request links,
 * and preserves the original ordering of non-dependency items.
 *
 * @param sections - Parsed sections of the release notes.
 * @returns Updated sections with consolidated dependency update entries.
 */
export async function groupDependencyUpdates(sections: SectionData): Promise<SectionData> {
  const result: SectionData = {}

  for (const [label, items] of Object.entries(sections)) {
    if (items.length === 0) {
      result[label] = []
      continue
    }

    // First pass: identify dependencies to group
    const dependencyGroups = new Map<
      string,
      {
        originalName: string // Preserve the original casing of the dependency name
        latestVersion: string
        initialVersion: string
        allPRs: Set<string>
        source: string
        position: number // Track the first position where this dependency appears
      }
    >()

    // Track non-dependency items
    const nonDependencyItems = new Set<number>()

    // First pass: gather information about dependencies
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const renovateMatch = item.match(/\* Update (.*?) to (.*?) by @renovate in (.*)$/)
      const dependabotMatch = item.match(/\* Bump (.*?) from (.*?) to (.*?) by @dependabot in (.*)$/)

      if (renovateMatch) {
        const [, dependency, version, prLink] = renovateMatch
        const key = dependency.trim().toLowerCase() // Lowercase for map key
        const originalName = dependency.trim() // Keep original for display
        const prUrl = prLink.trim()

        if (!dependencyGroups.has(key)) {
          dependencyGroups.set(key, {
            originalName,
            latestVersion: version,
            initialVersion: '',
            allPRs: new Set([prUrl]),
            source: 'renovate',
            position: i,
          })
        } else {
          const group = dependencyGroups.get(key)!
          group.allPRs.add(prUrl)
          group.latestVersion = version
        }
      } else if (dependabotMatch) {
        const [, dependency, fromVersion, toVersion, prLink] = dependabotMatch
        const key = dependency.trim().toLowerCase() // Lowercase for map key
        const originalName = dependency.trim() // Keep original for display
        const prUrl = prLink.trim()

        if (!dependencyGroups.has(key)) {
          dependencyGroups.set(key, {
            originalName,
            latestVersion: toVersion,
            initialVersion: fromVersion,
            allPRs: new Set([prUrl]),
            source: 'dependabot',
            position: i,
          })
        } else {
          const group = dependencyGroups.get(key)!
          group.allPRs.add(prUrl)
          group.latestVersion = toVersion

          // Keep the earliest "from" version
          if (semver.valid(fromVersion) && semver.valid(group.initialVersion)) {
            try {
              if (semver.lt(fromVersion, group.initialVersion)) {
                group.initialVersion = fromVersion
              }
            } catch {
              // If semver comparison fails, keep the first version we encountered
              if (!group.initialVersion) {
                group.initialVersion = fromVersion
              }
            }
          } else {
            // For non-semver versions, just keep the first one we saw
            if (!group.initialVersion) {
              group.initialVersion = fromVersion
            }
          }
        }
      } else {
        // Mark this as a non-dependency item
        nonDependencyItems.add(i)
      }
    }

    // Second pass: create the new items array while preserving order
    const processedDependencies = new Set<string>()
    const newItems: string[] = []

    for (let i = 0; i < items.length; i++) {
      if (nonDependencyItems.has(i)) {
        // This is a non-dependency item, keep as is
        newItems.push(items[i])
        continue
      }

      // This is a dependency item
      const item = items[i]
      let dependencyKey: string | null = null

      // Extract the dependency key
      const renovateMatch = item.match(/\* Update (.*?) to .* by @renovate/)
      const dependabotMatch = item.match(/\* Bump (.*?) from .* by @dependabot/)

      if (renovateMatch) {
        dependencyKey = renovateMatch[1].trim().toLowerCase()
      } else if (dependabotMatch) {
        dependencyKey = dependabotMatch[1].trim().toLowerCase()
      }

      if (dependencyKey && !processedDependencies.has(dependencyKey)) {
        // This is the first occurrence of this dependency
        const group = dependencyGroups.get(dependencyKey)!

        // Create the consolidated entry using the original name format
        const prefix =
          group.source === 'renovate'
            ? `* Update ${group.originalName} to ${group.latestVersion} by @renovate in `
            : `* Bump ${group.originalName} from ${group.initialVersion} to ${group.latestVersion} by @dependabot in `

        // Join all PR links with comma separator
        const prLinks = Array.from(group.allPRs).join(', ')

        // Add the consolidated entry
        newItems.push(`${prefix}${prLinks}`)

        // Mark this dependency as processed
        processedDependencies.add(dependencyKey)
      }
      // Skip subsequent occurrences of the same dependency
    }

    result[label] = newItems
  }

  return result
}
