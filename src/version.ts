import {promises as fsPromises} from 'fs'
import * as yaml from 'js-yaml'
import * as semver from 'semver'
import {parseNotes} from './notes'

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

async function getCategories(): Promise<{title: string; labels: string[]}[]> {
  const content = await fsPromises.readFile('.github/release.yml', 'utf8')
  const doc = yaml.load(content) as ReleaseYAML
  return doc.changelog.categories.map(category => {
    return {
      title: category.title,
      labels: category.labels
    }
  })
}
// function that returns tile for matching label
async function getTitleForLabel(label: string): Promise<string> {
  const categories = await getCategories()
  const category = categories.find(category => category.labels.includes(label))
  if (category === undefined) {
    return ''
  }
  return category.title
}

// function getVersionIncrease returns the version increase based on the labels. Major, minor, patch
export async function getVersionIncrease(
  latestRelease: string,
  major: string,
  minor: string,
  notes: string
): Promise<string> {
  let majorTitle = ''
  let minorTitle = ''
  if (major !== '') {
    majorTitle = await getTitleForLabel(major)
  }
  if (minor !== '') {
    minorTitle = await getTitleForLabel(minor)
  }

  const version = (await parseNotes(
    notes,
    majorTitle,
    minorTitle
  )) as semver.ReleaseType

  return semver.inc(latestRelease, version) || ''
}
