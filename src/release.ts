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

  if (!context.ref.startsWith('refs/heads/')) {
    // not a branch
    // todo: handle tags
    const tags = await client.paginate(
      client.rest.repos.listTags,
      {
        ...context.repo,
        per_page: 100,
      },
      (response) => response.data,
    )
    core.info(`tags: ${tags}`)
    return [releases, latestRelease]
  }

  // if there are no releases
  if (releases.length === 0) {
    core.debug(`No releases found`)
    return [releases, latestRelease]
  }

  const currentBranch = context.ref.replace('refs/heads/', '')
  core.debug(`Current branch: ${currentBranch}`)

  const releaseInCurrent = releases.find((release) => !release.draft && release.target_commitish === currentBranch)

  if (releaseInCurrent === undefined) {
    core.debug(`No release found for branch ${currentBranch}`)

    // find latest release that is not a draft
    const latestNonDraft = releases.find((release) => !release.draft)
    if (latestNonDraft === undefined) {
      return [releases, latestRelease]
    }
    latestRelease = latestNonDraft.tag_name
  } else {
    latestRelease = releaseInCurrent.tag_name
  }

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

  // find if a release draft already exists for versionIncrease
  const releaseDraft = releases.find((release) => release.draft && release.tag_name === versionIncrease)

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

  core.startGroup(`${releaseDraft === undefined ? 'Create' : 'Update'} release draft for ${versionIncrease}`)
  core.info(`latestRelease: ${latestRelease}`)
  core.info(`releaseNotes: ${newReleaseNotes}`)
  core.info(`releaseURL: ' ${response.data?.html_url}`)
  core.debug(`releaseDraft: ${JSON.stringify(releaseDraft, null, 2)}`)
  core.debug(`${releaseDraft === undefined ? 'create' : 'update'}Release: ${JSON.stringify(response.data, null, 2)}`)
  core.endGroup()

  core.setOutput('release-notes', newReleaseNotes)
  core.setOutput('release-id', response.data?.id)
  core.setOutput('release-url', response.data?.html_url)
}
