import * as github from '@actions/github'
import * as core from '@actions/core'
import {components as OctoOpenApiTypes} from '@octokit/openapi-types'
import {generateReleaseNotes} from './notes'
import {Inputs} from './context'

type Release = OctoOpenApiTypes['schemas']['release']

export async function getRelease(client: ReturnType<typeof github.getOctokit>): Promise<[Release[], string]> {
  const context = github.context
  let latestRelease = 'v0.0.0'

  // get all releases
  const releases = await client.paginate(
    client.rest.repos.listReleases,
    {
      ...context.repo,
      per_page: 100,
    },
    (response) => response.data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
  )

  const tags = await client.paginate(
    client.rest.repos.listTags,
    {
      ...context.repo,
      per_page: 100,
    },
    (response) => response.data,
  )

  if (!context.ref.startsWith('refs/heads/')) {
    // not a branch
    // todo: handle tags
    return [releases, latestRelease]
  }

  // if there are no releases
  if (releases.length === 0) {
    core.info(`No releases found`)
    return [releases, latestRelease]
  }

  const currentBranch = context.ref.replace('refs/heads/', '')
  core.info(`Current branch: ${currentBranch}`)

  const releaseInCurrent = releases.find((release) => !release.draft && release.target_commitish === currentBranch)

  if (releaseInCurrent === undefined) {
    core.info(`No release found for branch ${currentBranch}`)

    // find latest release that is not a draft
    const latestNonDraft = releases.find((release) => !release.draft)
    if (latestNonDraft === undefined) {
      core.info(`No non-draft releases found`)
      return [releases, latestRelease]
    }
    latestRelease = latestNonDraft.tag_name
  } else {
    latestRelease = releaseInCurrent.tag_name
  }

  core.info(tags[0].name)

  core.info(`Found ${releases.length} releases`)
  core.info(`Latest release: ${releases[0].tag_name}`)
  core.info(releases[0].target_commitish)

  return [releases, latestRelease]
}

export async function createOrUpdateRelease(
  client: ReturnType<typeof github.getOctokit>,
  inputs: Inputs,
  releases: Release[],
  latestRelease: string,
  versionIncrease: string,
): Promise<void> {
  const context = github.context
  const newReleaseNotes = await generateReleaseNotes(client, inputs, latestRelease, versionIncrease)
  // print latestRelease, versionIncrease, releaseID
  core.info(`Latest release: ${latestRelease}`)
  core.info(`Version increase: ${versionIncrease}`)

  // find if a release draft already exists for versionIncrease
  const releaseDraft = releases.find((release) => release.draft && release.tag_name === versionIncrease)
  core.info(`releaseDraft: ${releaseDraft}`)

  const releaseParams = {
    ...context.repo,
    tag_name: versionIncrease,
    name: versionIncrease,
    target_commitish: context.ref.replace('refs/heads/', ''),
    body: newReleaseNotes,
  }

  const response = await (releaseDraft === undefined
    ? client.rest.repos.createRelease({
        ...releaseParams,
        draft: true,
      })
    : client.rest.repos.updateRelease({
        ...releaseParams,
        release_id: releaseDraft.id,
      }))

  core.info(`${releaseDraft === undefined ? 'create' : 'update'}Release: ${JSON.stringify(response.data, null, 2)}`)
}
