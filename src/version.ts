import * as semver from 'semver'
import {Inputs} from './context.js'
import {parseNotes} from './notes.js'
import {ReleaseData} from './release.js'
import {getCategories} from './category.js'

/**
 * Retrieve the category title for a given label.
 *
 * @param inputs - Action inputs and configuration used to load categories
 * @param label - The label to look up; if empty or not found, an empty string is returned
 * @returns The matching category title, or an empty string if `label` is empty or no category matches
 */
async function getTitleForLabel(inputs: Inputs, label: string): Promise<string> {
  if (label === '') {
    return ''
  }
  const categories = await getCategories(inputs)
  const category = categories.find((category) => category.labels.includes(label))
  if (category === undefined) {
    return ''
  }
  return category.title
}

/**
 * Computes the next semantic version based on release notes and action inputs.
 *
 * @param releaseData - Current release metadata including the latest published version
 * @param inputs - Action inputs providing label and configuration values
 * @param notes - Markdown release notes used to detect version bump type
 * @returns The incremented version string (e.g. `'1.2.3'`), or `''` if the latest release tag is not valid semver
 */
export async function getVersionIncrease(releaseData: ReleaseData, inputs: Inputs, notes: string): Promise<string> {
  const majorTitle = await getTitleForLabel(inputs, inputs.majorLabel)
  const minorTitle = await getTitleForLabel(inputs, inputs.minorLabel)
  const parsedType = parseNotes(notes, majorTitle, minorTitle)
  // parseNotes always returns one of these three values; validate before casting to catch
  // any future changes to parseNotes that might introduce unexpected return values.
  const version: semver.ReleaseType = parsedType === 'major' || parsedType === 'minor' || parsedType === 'patch' ? parsedType : 'patch'

  return semver.inc(releaseData.latestRelease, version) || ''
}
