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
 * Processes parsed release note sections to group dependency updates from automated services.
 * For each dependency, the function aggregates entries to reflect the latest update while combining all relevant pull request links,
 * and preserves the original ordering of non-dependency items.
 *
 * @param sections - Parsed sections of the release notes.
 * @returns Updated sections with consolidated dependency update entries.
 */
export async function groupDependencyUpdates(sections: SectionData): Promise<SectionData> {
  const result: SectionData = {}

  // Define patterns for different types of automated updates
  const updatePatterns = [
    // Renovate standard dependency updates
    {
      name: 'renovate-dependency',
      regex: /\* Update (.*?) to (.*?) by @renovate in (.*)$/,
      getKey: (matches: RegExpMatchArray) => matches[1].trim().toLowerCase(),
      getGroupKey: (matches: RegExpMatchArray) => matches[1].trim().toLowerCase(),
      getOriginalName: (matches: RegExpMatchArray) => matches[1].trim(),
      getLatestVersion: (matches: RegExpMatchArray) => matches[2].trim(),
      getPRUrl: (matches: RegExpMatchArray) => matches[3].trim(),
      formatEntry: (name: string, latest: string, initial: string, prLinks: string) =>
        `* Update ${name} to ${latest} by @renovate in ${prLinks}`,
    },
    // Renovate lock file maintenance
    {
      name: 'renovate-lockfile',
      regex: /\* Lock file maintenance by @renovate in (.*)$/,
      getKey: () => 'lock-file-maintenance',
      getGroupKey: () => 'lock-file-maintenance',
      getOriginalName: () => 'Lock file maintenance',
      getLatestVersion: () => '',
      getPRUrl: (matches: RegExpMatchArray) => matches[1].trim(),
      formatEntry: (_name: string, _latest: string, _initial: string, prLinks: string) =>
        `* Lock file maintenance by @renovate in ${prLinks}`,
    },
    // Dependabot updates
    {
      name: 'dependabot',
      regex: /\* Bump (.*?) from (.*?) to (.*?) by @dependabot in (.*)$/,
      getKey: (matches: RegExpMatchArray) => matches[1].trim().toLowerCase(),
      getGroupKey: (matches: RegExpMatchArray) => matches[1].trim().toLowerCase(),
      getOriginalName: (matches: RegExpMatchArray) => matches[1].trim(),
      getLatestVersion: (matches: RegExpMatchArray) => matches[3].trim(),
      getInitialVersion: (matches: RegExpMatchArray) => matches[2].trim(),
      getPRUrl: (matches: RegExpMatchArray) => matches[4].trim(),
      formatEntry: (name: string, latest: string, initial: string, prLinks: string) =>
        `* Bump ${name} from ${initial} to ${latest} by @dependabot in ${prLinks}`,
    },
    // Pre-commit-ci updates
    {
      name: 'pre-commit-ci',
      regex: /\* \[pre-commit\.ci\] pre-commit autoupdate by @pre-commit-ci in (.*)$/,
      getKey: () => 'pre-commit',
      getGroupKey: () => 'pre-commit',
      getOriginalName: () => 'pre-commit',
      getLatestVersion: () => '',
      getPRUrl: (matches: RegExpMatchArray) => matches[1].trim(),
      formatEntry: (_name: string, _latest: string, _initial: string, prLinks: string) =>
        `* [pre-commit.ci] pre-commit autoupdate by @pre-commit-ci in ${prLinks}`,
    },
    // Future patterns can be added here without modifying the core logic
  ]

  for (const [label, items] of Object.entries(sections)) {
    if (items.length === 0) {
      result[label] = []
      continue
    }

    // Grouping structures
    interface UpdateGroup {
      originalName: string
      latestVersion: string
      initialVersion: string
      allPRs: Set<string>
      position: number
      pattern: (typeof updatePatterns)[0]
    }

    const updateGroups = new Map<string, UpdateGroup>()
    const nonAutomatedItems = new Set<number>()

    // First pass: gather update information
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      let matched = false

      // Try each pattern until one matches
      for (const pattern of updatePatterns) {
        const match = item.match(pattern.regex)
        if (match) {
          matched = true
          const groupKey = pattern.getGroupKey(match)
          const key = `${pattern.name}:${groupKey}`
          const prUrl = pattern.getPRUrl(match)

          if (!updateGroups.has(key)) {
            updateGroups.set(key, {
              originalName: pattern.getOriginalName(match),
              latestVersion: pattern.getLatestVersion?.(match) || '',
              initialVersion: pattern.getInitialVersion?.(match) || '',
              allPRs: new Set([prUrl]),
              position: i,
              pattern,
            })
          } else {
            const group = updateGroups.get(key)!
            group.allPRs.add(prUrl)

            // Version comparison logic for all dependency updates
            const latestVersion = pattern.getLatestVersion?.(match) || ''

            // Special handling for Dependabot initial version tracking
            if (pattern.name === 'dependabot') {
              const initialVersion = pattern.getInitialVersion?.(match) || ''

              // Always keep the earliest initial version
              if (initialVersion && group.initialVersion) {
                try {
                  if (semver.valid(initialVersion) && semver.valid(group.initialVersion)) {
                    // If both are valid semver, compare and keep the smallest
                    if (semver.lt(initialVersion, group.initialVersion)) {
                      core.debug(`[DEPENDABOT] Updating initial version from ${group.initialVersion} to ${initialVersion} (lower)`)
                      group.initialVersion = initialVersion
                    }
                  } else {
                    // For non-semver versions, try to extract numbers for comparison
                    const initNumbers = initialVersion.match(/\d+/g) || []
                    const groupInitNumbers = group.initialVersion.match(/\d+/g) || []

                    // Simple heuristic: compare the first number in each
                    if (initNumbers.length > 0 && groupInitNumbers.length > 0) {
                      const firstInitNumber = initNumbers[0]
                      const firstGroupNumber = groupInitNumbers[0]

                      if (firstInitNumber && firstGroupNumber) {
                        // Ensure neither is undefined
                        const parsedInit = parseInt(firstInitNumber)
                        const parsedGroup = parseInt(firstGroupNumber)

                        if (parsedInit < parsedGroup) {
                          core.debug(
                            `[DEPENDABOT] Updating initial version from ${group.initialVersion} to ${initialVersion} (numeric comparison)`,
                          )
                          group.initialVersion = initialVersion
                        }
                      }
                    }
                  }
                } catch (err) {
                  // In case of comparison error, don't update the initial version
                  core.debug(`Initial version comparison failed: ${err}. Keeping existing.`)
                }
              } else if (initialVersion) {
                group.initialVersion = initialVersion
              }
            }

            // Version comparison for latest version - for both Renovate and Dependabot
            if (latestVersion && group.latestVersion) {
              try {
                // Try to clean the versions if they're valid semver
                if (semver.valid(latestVersion) && semver.valid(group.latestVersion)) {
                  const cleanNew = semver.clean(latestVersion) || latestVersion
                  const cleanCurrent = semver.clean(group.latestVersion) || group.latestVersion

                  core.debug(`[VERSION] Comparing semver versions for ${group.originalName}: ${cleanNew} vs ${cleanCurrent}`)

                  // If the new version is greater, update it
                  if (semver.gt(cleanNew, cleanCurrent)) {
                    core.debug(`[VERSION] Updating latest version from ${group.latestVersion} to ${latestVersion}`)
                    group.latestVersion = latestVersion
                  } else {
                    core.debug(`[VERSION] Keeping current version ${group.latestVersion} (newer than or equal to ${latestVersion})`)
                  }
                }
                // Try with coercion for non-standard formats
                else {
                  const coercedNew = semver.coerce(latestVersion)
                  const coercedCurrent = semver.coerce(group.latestVersion)

                  if (coercedNew && coercedCurrent) {
                    core.debug(`[VERSION] Comparing coerced versions: ${coercedNew.version} vs ${coercedCurrent.version}`)

                    if (semver.gt(coercedNew, coercedCurrent)) {
                      core.debug(`[VERSION] Updating latest version from ${group.latestVersion} to ${latestVersion}`)
                      group.latestVersion = latestVersion
                    }
                  }
                  // Special handling for caret/tilde prefixes
                  else {
                    // For versions like ^1.2.3 or ~1.2.3, strip prefixes
                    const stripPrefixRegex = /[\^~]/g
                    const strippedNew = latestVersion.replace(stripPrefixRegex, '')
                    const strippedCurrent = group.latestVersion.replace(stripPrefixRegex, '')

                    if (semver.valid(strippedNew) && semver.valid(strippedCurrent)) {
                      if (semver.gt(strippedNew, strippedCurrent)) {
                        core.debug(`[VERSION] Using stripped version comparison: ${latestVersion} is newer than ${group.latestVersion}`)
                        group.latestVersion = latestVersion
                      }
                    }
                    // As a fallback for Renovate, trust the most recent PR
                    else if (pattern.name.startsWith('renovate')) {
                      core.debug(`[RENOVATE] Fallback: Using most recent version ${latestVersion}`)
                      group.latestVersion = latestVersion
                    }
                  }
                }
              } catch (err) {
                core.debug(`Version comparison error: ${err}. Using latest PR version.`)
                // For errors, trust the most recent PR for Renovate
                if (pattern.name.startsWith('renovate')) {
                  group.latestVersion = latestVersion
                }
              }
            }
          }
          break
        }
      }

      if (!matched) {
        // Not an automated update
        nonAutomatedItems.add(i)
      }
    }

    // Second pass: create the consolidated entries
    const processedGroups = new Set<string>()
    const newItems: string[] = []

    for (let i = 0; i < items.length; i++) {
      if (nonAutomatedItems.has(i)) {
        // Not an automated update, keep as is
        newItems.push(items[i])
        continue
      }

      const item = items[i]
      let groupKey: string | null = null

      // Find which pattern matches this item
      for (const pattern of updatePatterns) {
        const match = item.match(pattern.regex)
        if (match) {
          groupKey = `${pattern.name}:${pattern.getGroupKey(match)}`
          break
        }
      }

      if (groupKey && !processedGroups.has(groupKey)) {
        const group = updateGroups.get(groupKey)!

        // Format the consolidated entry based on the pattern
        const prLinks = Array.from(group.allPRs).sort().join(', ')
        const entry = group.pattern.formatEntry(group.originalName, group.latestVersion, group.initialVersion, prLinks)

        newItems.push(entry)
        processedGroups.add(groupKey)
      }
      // Skip already processed groups
    }

    result[label] = newItems
  }

  return result
}
