import * as semver from 'semver'
import {Inputs} from './context.js'
import {parseNotes} from './notes.js'
import {ReleaseData} from './release.js'
import {getCategories} from './category.js'

// function that returns tile for matching label
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

// function getVersionIncrease returns the version increase based on the labels. Major, minor, patch
export async function getVersionIncrease(releaseData: ReleaseData, inputs: Inputs, notes: string): Promise<string> {
  const majorTitle = await getTitleForLabel(inputs, inputs.majorLabel)
  const minorTitle = await getTitleForLabel(inputs, inputs.minorLabel)
  const version = parseNotes(notes, majorTitle, minorTitle) as semver.ReleaseType

  return semver.inc(releaseData.latestRelease, version) || ''
}
