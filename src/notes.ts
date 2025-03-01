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

const conventionalPrefixRegex = /^\* (fix|feat|chore|docs|style|refactor|perf|test|build|ci|revert)(\([^)]+\))?:\s+/i

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

    if (inputs.removeConventionalPrefixes) {
      sections = await removeConventionalPrefixes(sections)
      await core.group('Removing conventional commit prefixes', async () => {
        core.debug(JSON.stringify(sections, null, 2))
      })
    }

    if (inputs.groupDependencies) {
      sections = await groupDependencyUpdates(sections)
      await core.group('Grouping dependency updates', async () => {
        core.debug(JSON.stringify(sections, null, 2))
      })
    }

    if (inputs.collapseAfter > 0) {
      sections = await collapseSections(sections, inputs.collapseAfter)
      await core.group('Collapsing sections', async () => {
        core.debug(JSON.stringify(sections, null, 2))
      })
    }

    body = rebuildMarkdown(body, sections, categories)

    // Apply header and footer templates
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
 * Rebuilds the markdown content with processed sections.
 *
 * This function takes the original release notes body and replaces only the
 * categorized sections that we want to modify, leaving all other content untouched.
 *
 * @param originalBody - The original markdown content from GitHub
 * @param processedSections - The processed section data
 * @param categories - The category definitions
 * @returns Updated markdown with processed sections and all other content preserved
 */
function rebuildMarkdown(originalBody: string, processedSections: SectionData, categories: Category[]): string {
  // Extract the structure of the original markdown
  const lines = originalBody.split('\n')
  const result: string[] = []

  // Track if we're inside a section that we need to replace
  let inReplaceableSection = false

  // Process each line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Detect any kind of section header (## or ###)
    // This is important because we need to reset inReplaceableSection for any new section
    if (line.trim().startsWith('##')) {
      // Reset the section flag for any section header (including ## and ###)
      inReplaceableSection = false

      // Now check if this is specifically a category section header (### Title)
      const sectionMatch = line.trim().match(/^###\s(.+)$/)

      if (sectionMatch) {
        // Get the section title
        const sectionTitle = sectionMatch[1]

        // Find if this section matches any of our categories
        const matchedCategory = categories.find((cat) => cat.title === sectionTitle)

        if (matchedCategory) {
          // This is a section we want to replace
          inReplaceableSection = true
          const currentSectionLabel = matchedCategory.labels[0]

          // Add the section header
          result.push(line)

          // Add the processed items for this section
          const sectionItems = processedSections[currentSectionLabel] || []
          if (sectionItems.length > 0) {
            result.push(...sectionItems)
          }

          // Skip lines until we hit the next section or non-bullet item
          while (i + 1 < lines.length) {
            const nextLine = lines[i + 1].trim()
            if (nextLine.startsWith('##') || (nextLine && !nextLine.startsWith('*'))) {
              // This is the start of a new section or non-bulleted content
              break
            }
            i++ // Skip this line
          }
          continue
        }
      }

      // This is a section header, but not one we want to modify
      // We've already reset inReplaceableSection, so just add the line
      result.push(line)
    } else if (!inReplaceableSection) {
      // Not in a replaceable section, just copy the line
      result.push(line)
    }
    // If we're in a replaceable section, skip all lines
  }

  return result.join('\n')
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
 * Adds collapse tags to sections that exceed the specified item limit.
 *
 * @param sections - The processed section data
 * @param n - Number of items after which to collapse a section
 * @returns SectionData with collapse tags added where needed
 */
async function collapseSections(sections: SectionData, n: number): Promise<SectionData> {
  if (n <= 0) {
    return sections // No collapsing needed
  }

  const result: SectionData = {}

  // Process each section
  for (const [label, items] of Object.entries(sections)) {
    if (items.length <= n) {
      // No need to collapse
      result[label] = [...items]
    } else {
      // If the section has more items than the limit, we'll collapse the entire section

      // Create a details/summary block with the total number of changes
      const beforeText = `<details><summary>${items.length} changes</summary>\n\n`
      const afterText = '\n</details>\n'

      // Rather than joining all items with the HTML tags, modify the first and last items directly
      const modifiedItems = [...items]

      // Add the opening HTML to the first item
      modifiedItems[0] = beforeText + modifiedItems[0]

      // Add the closing HTML to the last item
      modifiedItems[modifiedItems.length - 1] = modifiedItems[modifiedItems.length - 1] + afterText

      // Replace the section content with the modified version
      result[label] = modifiedItems
    }
  }

  // Log the collapsed sections to help with debugging
  core.debug(`Collapsed sections structure: ${JSON.stringify(result, null, 2)}`)

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
 * Removes conventional commit prefixes from release note entries.
 *
 * @param sections - Parsed release note sections categorized by type
 * @returns Updated sections with prefixes removed
 */
export async function removeConventionalPrefixes(sections: SectionData): Promise<SectionData> {
  const result: SectionData = {}

  for (const [label, items] of Object.entries(sections)) {
    if (items.length === 0) {
      result[label] = []
      continue
    }

    const processedItems = items.map((item) => {
      if (conventionalPrefixRegex.test(item)) {
        // Replace the prefix with just "* " and capitalize first word
        let processed = item.replace(conventionalPrefixRegex, '* ')

        // Capitalize the first word after the bullet point
        processed = processed.replace(/^\* (.+)$/, (_, content) => {
          return `* ${capitalizeFirstWord(content)}`
        })

        return processed
      }
      return item
    })

    result[label] = processedItems
  }

  return result
}

/**
 * Extracts a conventional commit prefix from a string.
 *
 * @param str - The string containing a potential conventional commit prefix.
 * @param regex - The regex pattern to use for matching the prefix.
 * @returns The extracted prefix including scope and colon+space, or an empty string if none found.
 */
function getPrefix(str: string, regex: RegExp): string {
  const match = str.match(regex)
  return match ? match[0].substring(2) : '' // Remove "* " prefix
}

/**
 * Consolidates dependency update entries in release note sections.
 *
 * Processes parsed release note sections by grouping automated dependency update entries that match defined update patterns,
 * such as Renovate standard updates, Renovate lockfile maintenance, Dependabot updates, and pre-commit-ci updates.
 * For each dependency, it aggregates entries to record the most recent update while merging all relevant pull request links,
 * and preserves the original order of non-matching items.
 *
 * @param sections - Parsed release note sections categorized by type.
 * @returns Updated release note sections with consolidated dependency update entries.
 */
export async function groupDependencyUpdates(sections: SectionData): Promise<SectionData> {
  const result: SectionData = {}

  // Optional pattern part for conventional prefixes - can be used to enhance regexes
  const optionalPrefixPattern = '(?:(?:fix|feat|chore|docs|style|refactor|perf|test|build|ci|revert)(?:\\([^)]+\\))?:\\s+)?'

  // Create enhanced patterns that work with or without conventional prefixes
  const updatePatterns = [
    // Renovate standard dependency updates
    {
      name: 'renovate-dependency',
      // Match both "* Update..." and "* chore(deps): update..."
      regex: new RegExp(`\\* ${optionalPrefixPattern}Update (.*?) to (.*?) by @renovate in (.*)$`, 'i'),
      getKey: (matches: RegExpMatchArray) => matches[1].trim().toLowerCase(),
      getGroupKey: (matches: RegExpMatchArray) => matches[1].trim().toLowerCase(),
      getOriginalName: (matches: RegExpMatchArray) => matches[1].trim(),
      getLatestVersion: (matches: RegExpMatchArray) => matches[2].trim(),
      getPRUrl: (matches: RegExpMatchArray) => matches[3].trim(),
      formatEntry: (name: string, latest: string, _initial: string, prLinks: string, prefix?: string) =>
        `* ${prefix || ''}${prefix ? 'update' : 'Update'} ${name} to ${latest} by @renovate in ${prLinks}`,
    },
    // Renovate lock file maintenance
    {
      name: 'renovate-lockfile',
      // Match both "* Lock file..." and "* chore(deps): lock file..."
      regex: new RegExp(`\\* ${optionalPrefixPattern}Lock file maintenance by @renovate in (.*)$`, 'i'),
      getKey: () => 'lock-file-maintenance',
      getGroupKey: () => 'lock-file-maintenance',
      getOriginalName: () => 'Lock file maintenance',
      getLatestVersion: () => '',
      getPRUrl: (matches: RegExpMatchArray) => matches[1].trim(),
      formatEntry: (_name: string, _latest: string, _initial: string, prLinks: string, prefix?: string) =>
        `* ${prefix || ''}${prefix ? 'lock file maintenance' : 'Lock file maintenance'} by @renovate in ${prLinks}`,
    },
    // Dependabot updates
    {
      name: 'dependabot',
      // Match both "* Bump..." and "* chore(deps): bump..."
      regex: new RegExp(`\\* ${optionalPrefixPattern}Bump (.*?) from (.*?) to (.*?) by @dependabot in (.*)$`, 'i'),
      getKey: (matches: RegExpMatchArray) => matches[1].trim().toLowerCase(),
      getGroupKey: (matches: RegExpMatchArray) => matches[1].trim().toLowerCase(),
      getOriginalName: (matches: RegExpMatchArray) => matches[1].trim(),
      getLatestVersion: (matches: RegExpMatchArray) => matches[3].trim(),
      getInitialVersion: (matches: RegExpMatchArray) => matches[2].trim(),
      getPRUrl: (matches: RegExpMatchArray) => matches[4].trim(),
      formatEntry: (name: string, latest: string, initial: string, prLinks: string, prefix?: string) =>
        `* ${prefix || ''}${prefix ? 'bump' : 'Bump'} ${name} from ${initial} to ${latest} by @dependabot in ${prLinks}`,
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
  ]

  for (const [label, items] of Object.entries(sections)) {
    if (items.length === 0) {
      result[label] = []
      continue
    }

    // Grouping structures
    interface UpdateGroup {
      originalDependencyName: string
      latestVersion: string
      initialVersion: string
      allPRs: Set<string>
      position: number
      pattern: (typeof updatePatterns)[0]
      prefix: string // Store the prefix
    }

    const updateGroups = new Map<string, UpdateGroup>()
    const nonAutomatedItems = new Set<number>()

    // First pass: gather update information
    for (let i = 0; i < items.length; i++) {
      let matched = false

      // Try each pattern until one matches
      for (const pattern of updatePatterns) {
        const match = items[i].match(pattern.regex)
        if (match) {
          matched = true
          const groupKey = pattern.getGroupKey(match)
          const key = `${pattern.name}:${groupKey}`
          const prUrl = pattern.getPRUrl(match)

          // When creating the group, store the prefix and version
          if (!updateGroups.has(key)) {
            updateGroups.set(key, {
              originalDependencyName: pattern.getOriginalName(match),
              latestVersion: pattern.getLatestVersion?.(match) || '',
              initialVersion: pattern.getInitialVersion?.(match) || '',
              allPRs: new Set([prUrl]),
              position: i,
              pattern,
              prefix: getPrefix(items[i], conventionalPrefixRegex),
            })
          } else {
            const group = updateGroups.get(key)!
            group.allPRs.add(prUrl)

            // When we encounter a newer version, update the prefix along with the version
            const latestVersion = pattern.getLatestVersion?.(match) || ''
            if (
              latestVersion &&
              group.latestVersion &&
              isNewerVersion(latestVersion, group.latestVersion, group.originalDependencyName, pattern.name.startsWith('renovate'))
            ) {
              // Update both version and prefix
              group.latestVersion = latestVersion
              group.prefix = getPrefix(items[i], conventionalPrefixRegex)
            }

            // Update initialVersion if needed (for Dependabot updates)
            const initialVersion = pattern.getInitialVersion?.(match) || ''
            if (initialVersion && pattern.name === 'dependabot') {
              if (!group.initialVersion || isEarlierVersion(initialVersion, group.initialVersion)) {
                group.initialVersion = initialVersion
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
        // Not an automated update - use directly
        newItems.push(items[i])
        continue
      }

      // For automated updates, directly find which pattern matches
      let groupKey: string | null = null

      // Find which pattern matches this item
      for (const pattern of updatePatterns) {
        const match = items[i].match(pattern.regex)
        if (match) {
          groupKey = `${pattern.name}:${pattern.getGroupKey(match)}`
          break
        }
      }

      if (groupKey && !processedGroups.has(groupKey)) {
        const group = updateGroups.get(groupKey)!

        // Format the consolidated entry with properly sorted PR numbers
        const sortedPRs = Array.from(group.allPRs).sort((a, b) => {
          // Extract PR numbers from URLs
          const prNumA = parseInt(a.match(/\/pull\/(\d+)$/)?.[1] || '0')
          const prNumB = parseInt(b.match(/\/pull\/(\d+)$/)?.[1] || '0')

          // Compare numerically
          return prNumA - prNumB
        })

        const prLinks = sortedPRs.join(', ')
        const entry = group.pattern.formatEntry(
          group.originalDependencyName,
          group.latestVersion,
          group.initialVersion,
          prLinks,
          group.prefix, // Pass the prefix to formatEntry
        )

        newItems.push(entry)
        processedGroups.add(groupKey)
      }
      // Skip already processed groups
    }

    result[label] = newItems
  }

  return result
}

/**
 * Determines whether a candidate version should replace the current version.
 *
 * This function compares two version strings using several strategies to handle standard semver,
 * non-standard formats (via coercion), and versions with caret or tilde prefixes. If either
 * version string is missing or if an error occurs during comparison, the function falls back to
 * the automated update behavior indicated by the isRenovate flag.
 *
 * @param newVersion - The version string to evaluate as the new version.
 * @param currentVersion - The version string currently in use.
 * @param packageName - The name of the package being compared (used for debugging).
 * @param isRenovate - Indicates whether the update comes from Renovate, affecting fallback behavior.
 * @returns True if newVersion is determined to be newer than currentVersion; otherwise, false.
 */
function isNewerVersion(newVersion: string, currentVersion: string, packageName: string, isRenovate: boolean): boolean {
  if (!newVersion || !currentVersion) {
    return isRenovate // For empty versions in Renovate updates, trust the most recent
  }

  try {
    // Strategy 1: Direct semver comparison for valid versions
    if (semver.valid(newVersion) && semver.valid(currentVersion)) {
      const cleanNew = semver.clean(newVersion) || newVersion
      const cleanCurrent = semver.clean(currentVersion) || currentVersion

      core.debug(`[VERSION] Comparing semver versions for ${packageName}: ${cleanNew} vs ${cleanCurrent}`)

      if (semver.gt(cleanNew, cleanCurrent)) {
        core.debug(`[VERSION] ${newVersion} is newer than ${currentVersion}`)
        return true
      } else {
        core.debug(`[VERSION] ${currentVersion} is newer than or equal to ${newVersion}`)
        return false
      }
    }

    // Strategy 2: Try coercion for non-standard formats
    const coercedNew = semver.coerce(newVersion)
    const coercedCurrent = semver.coerce(currentVersion)

    if (coercedNew && coercedCurrent) {
      core.debug(`[VERSION] Comparing coerced versions: ${coercedNew.version} vs ${coercedCurrent.version}`)

      if (semver.gt(coercedNew, coercedCurrent)) {
        core.debug(`[VERSION] ${newVersion} is newer than ${currentVersion} (coerced)`)
        return true
      }
      return false
    }

    // Strategy 3: Special handling for caret/tilde prefixes
    const stripPrefixRegex = /[\^~]/g
    const strippedNew = newVersion.replace(stripPrefixRegex, '')
    const strippedCurrent = currentVersion.replace(stripPrefixRegex, '')

    if (semver.valid(strippedNew) && semver.valid(strippedCurrent)) {
      if (semver.gt(strippedNew, strippedCurrent)) {
        core.debug(`[VERSION] ${newVersion} is newer than ${currentVersion} (stripped)`)
        return true
      }
      return false
    }

    // Strategy 4: For other cases, trust Renovate's order
    if (isRenovate) {
      core.debug(`[RENOVATE] Fallback: Using most recent version ${newVersion}`)
      return true
    }

    return false
  } catch (err) {
    core.debug(`Version comparison error: ${err}`)
    // For errors with Renovate, trust the most recent PR
    return isRenovate
  }
}

/**
 * Compares two version strings and determines if the initial version is earlier than the current one.
 * Used specifically for tracking the earliest "from" version in Dependabot updates.
 *
 * @param initialVersion - The new initial version to compare
 * @param currentInitialVersion - The current initial version to compare against
 * @returns True if the new initial version is earlier, false otherwise
 */
function isEarlierVersion(initialVersion: string, currentInitialVersion: string): boolean {
  if (!initialVersion || !currentInitialVersion) {
    return !!initialVersion
  }

  try {
    // Try standard semver comparison first
    if (semver.valid(initialVersion) && semver.valid(currentInitialVersion)) {
      return semver.lt(initialVersion, currentInitialVersion)
    }

    // For non-semver versions, try to extract numbers for comparison
    const initNumbers = initialVersion.match(/\d+/g) || []
    const groupInitNumbers = currentInitialVersion.match(/\d+/g) || []

    // Simple heuristic: compare the first number in each
    if (initNumbers.length > 0 && groupInitNumbers.length > 0) {
      const firstInitNumber = initNumbers[0]
      const firstGroupNumber = groupInitNumbers[0]

      if (firstInitNumber && firstGroupNumber) {
        const parsedInit = parseInt(firstInitNumber)
        const parsedGroup = parseInt(firstGroupNumber)

        return parsedInit < parsedGroup
      }
    }

    return false
  } catch (err) {
    core.debug(`Initial version comparison failed: ${err}. Keeping existing.`)
    return false
  }
}

// Helper function to capitalize the first word in a string
function capitalizeFirstWord(str: string): string {
  if (!str) return str
  const words = str.trim().split(/\s+/)
  if (words.length === 0) return str
  words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1)
  return words.join(' ')
}
