import {promises as fsPromises} from 'fs'
import * as yaml from 'js-yaml'
import {Inputs} from './context.js'

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

/**
 * Extracts release categories from the release YAML located at the configured path.
 *
 * Reads the YAML file at `inputs.configPath` and returns an array of categories defined under `changelog.categories`. File read or YAML parse errors propagate to the caller.
 *
 * @param inputs - Contains `configPath`, the filesystem path to the release YAML configuration
 * @returns An array of `Category` objects parsed from `changelog.categories`
 */
export async function getCategories(inputs: Inputs): Promise<Category[]> {
  const content = await fsPromises.readFile(inputs.configPath, 'utf8')
  const doc = yaml.load(content) as ReleaseYAML
  return doc.changelog.categories.map((category) => {
    return {
      title: category.title,
      labels: category.labels,
    }
  })
}
