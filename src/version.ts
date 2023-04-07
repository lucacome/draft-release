import {promises as fsPromises} from 'fs'
import * as yaml from 'js-yaml'
import * as semver from 'semver'
import {Inputs} from './context'
import {parseNotes} from './notes'
import {ReleaseData} from './release'

// yaml type definition for release.yml
// changelog:
//   exclude:
//     labels:
//       - skip-changelog
//   categories:
//     - title: 🚀 Features
//       labels:
//         - enhancement
//     - title: 💣 Breaking Changes
//       labels:
//         - change
//     - title: 🐛 Bug Fixes
//       labels:
//         - bug

type ReleaseYAML = {
  changelog: {
    exclude: {
      labels: string[]
    }
    categories: {
      title: string
      labels: string[]
    }[]
  }
}

export interface Category {
  title: string
  labels: string[]
}

export async function getCategories(): Promise<Category[]> {
  const content = await fsPromises.readFile('.github/release.yml', 'utf8')
  const doc = yaml.load(content) as ReleaseYAML
  return doc.changelog.categories.map((category) => {
    return {
      title: category.title,
      labels: category.labels,
    }
  })
}

// function that returns tile for matching label
async function getTitleForLabel(label: string): Promise<string> {
  if (label === '') {
    return ''
  }
  const categories = await getCategories()
  const category = categories.find((category) => category.labels.includes(label))
  if (category === undefined) {
    return ''
  }
  return category.title
}

// function getVersionIncrease returns the version increase based on the labels. Major, minor, patch
export async function getVersionIncrease(releaseData: ReleaseData, inputs: Inputs, notes: string): Promise<string> {
  const majorTitle = await getTitleForLabel(inputs.majorLabel)
  const minorTitle = await getTitleForLabel(inputs.minorLabel)
  const version = parseNotes(notes, majorTitle, minorTitle) as semver.ReleaseType

  return semver.inc(releaseData.latestRelease, version) || ''
}
