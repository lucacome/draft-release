import * as github from '@actions/github'
import * as core from '@actions/core'
import {components as OctoOpenApiTypes} from '@octokit/openapi-types'

type Release = OctoOpenApiTypes['schemas']['release']

export async function getRelease(
  token: string
): Promise<[Release[], string, number]> {
  const context = github.context
  let latestRelease = 'v0.0.0'
  let releaseID = 0

  // get all releases
  const octokit = github.getOctokit(token)
  const releases = await octokit.paginate(
    octokit.rest.repos.listReleases,
    {
      ...context.repo,
      per_page: 100
    },
    response =>
      response.data.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
  )

  const tags = await octokit.paginate(
    octokit.rest.repos.listTags,
    {
      ...context.repo,
      per_page: 100
    },
    response => response.data
  )

  if (!context.ref.startsWith('refs/heads/')) {
    // not a branch
    // todo: handle tags
    return [releases, latestRelease, releaseID]
  }

  // if there are no releases
  if (releases.length === 0) {
    core.info(`No releases found`)
    return [releases, latestRelease, releaseID]
  }

  const currentBranch = context.ref.replace('refs/heads/', '')
  core.info(`Current branch: ${currentBranch}`)

  const releaseInCurrent = releases.find(
    release => !release.draft && release.target_commitish === currentBranch
  )

  if (releaseInCurrent === undefined) {
    core.info(`No release found for branch ${currentBranch}`)

    // find latest release that is not a draft
    const latestNonDraft = releases.find(release => !release.draft)
    if (latestNonDraft === undefined) {
      core.info(`No non-draft releases found`)
      return [releases, latestRelease, releaseID]
    }
    latestRelease = latestNonDraft.tag_name
    releaseID = latestNonDraft.id
  } else {
    latestRelease = releaseInCurrent.tag_name
    releaseID = releaseInCurrent.id
  }

  core.info(tags[0].name)

  core.info(`Found ${releases.length} releases`)
  core.info(`Latest release: ${releases[0].tag_name}`)
  core.info(releases[0].target_commitish)

  return [releases, latestRelease, releaseID]
}
