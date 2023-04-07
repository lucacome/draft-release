import * as github from '@actions/github'
import * as core from '@actions/core'
import {components as OctoOpenApiTypes} from '@octokit/openapi-types'
import {generateReleaseNotes} from './notes'
import {Inputs} from './context'

type Release = OctoOpenApiTypes['schemas']['release']

export type ReleaseData = {
  latestRelease: string
  releases: Release[]
  branch: string
  nextRelease: string
}

export async function getRelease(client: ReturnType<typeof github.getOctokit>): Promise<ReleaseData> {
  const releaseResponse: ReleaseData = {
    latestRelease: 'v0.0.0',
    releases: [],
    branch: '',
    nextRelease: '',
  }

  const context = github.context

  try {
    // get all releases
    const releases: Release[] = await client.paginate(client.rest.repos.listReleases, {
      ...context.repo,
      per_page: 100,
    })

    releases.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    releaseResponse.releases = releases

    const isTag = context.ref.startsWith('refs/tags/')
    releaseResponse.branch = isTag ? 'tag' : context.ref.replace('refs/heads/', '')
    core.debug(`Current branch: ${releaseResponse.branch}`)
    releaseResponse.nextRelease = isTag ? context.ref.replace('refs/tags/', '') : 'next'

    if (releases.length === 0) {
      core.debug(`No releases found`)
      return releaseResponse
    }

    const releaseInCurrent = releases.find((release) => !release.draft && release.target_commitish === releaseResponse.branch)

    if (releaseInCurrent === undefined) {
      core.debug(`No release found for branch ${releaseResponse.branch}`)

      // find latest release that is not a draft
      const latestNonDraft = releases.find((release) => !release.draft)
      if (latestNonDraft === undefined) {
        return releaseResponse
      }
      releaseResponse.latestRelease = latestNonDraft.tag_name
    } else {
      releaseResponse.latestRelease = releaseInCurrent.tag_name
    }
  } catch (error) {
    core.debug(`Error getting releases: ${error}`)
  }

  return releaseResponse
}

export async function createOrUpdateRelease(
  client: ReturnType<typeof github.getOctokit>,
  inputs: Inputs,
  releaseData: ReleaseData,
): Promise<void> {
  const context = github.context
  const releases = releaseData.releases
  const nextRelease = releaseData.nextRelease

  // find if a release draft already exists for versionIncrease
  const releaseDraft = releases.find((release) => release.draft && release.tag_name === nextRelease)

  if (releaseDraft === undefined && releaseData.branch === 'tag') {
    core.info(`No release draft found for tag ${nextRelease}. Skipping release creation/update.`)
    return
  }

  const draft = releaseData.branch !== 'tag'
  releaseData.branch = (releaseData.branch === 'tag' && releaseDraft?.target_commitish) || releaseData.branch
  core.debug(`releaseData.branch: ${releaseData.branch}`)
  const newReleaseNotes = await generateReleaseNotes(client, inputs, releaseData)

  const releaseParams = {
    ...context.repo,
    tag_name: nextRelease,
    name: nextRelease,
    target_commitish: releaseData.branch,
    body: newReleaseNotes,
    draft: draft,
  }

  const response = await (releaseDraft === undefined
    ? client.rest.repos.createRelease({
        ...releaseParams,
      })
    : client.rest.repos.updateRelease({
        ...releaseParams,
        release_id: releaseDraft.id,
      }))

  core.startGroup(`${releaseDraft === undefined ? 'Create' : 'Update'} release draft for ${nextRelease}`)
  core.info(`latestRelease: ${releaseData.latestRelease}`)
  core.info(`releaseNotes: ${newReleaseNotes}`)
  core.info(`releaseURL: ' ${response.data?.html_url}`)
  core.debug(`releaseDraft: ${JSON.stringify(releaseDraft, null, 2)}`)
  core.debug(`${releaseDraft === undefined ? 'create' : 'update'}Release: ${JSON.stringify(response.data, null, 2)}`)
  core.endGroup()

  core.setOutput('release-notes', newReleaseNotes?.trim())
  core.setOutput('release-id', response.data?.id)
  core.setOutput('release-url', response.data?.html_url?.trim())
}
