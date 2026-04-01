import * as github from '@actions/github'
import * as core from '@actions/core'
import {components as OctoOpenApiTypes} from '@octokit/openapi-types'
import {generateReleaseNotes} from './notes.js'
import {getContext, Inputs} from './context.js'

type Release = OctoOpenApiTypes['schemas']['release']

export const NEXT_RELEASE_SENTINEL = 'next'

export type ReleaseData = {
  latestRelease: string
  releases: Release[]
  branch: string
  nextRelease: string
}

export async function getRelease(client: ReturnType<typeof github.getOctokit>, inputs: Inputs): Promise<ReleaseData> {
  const releaseResponse: ReleaseData = {
    latestRelease: 'v0.0.0',
    releases: [],
    branch: '',
    nextRelease: '',
  }

  const context = await getContext(inputs.context)

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
    releaseResponse.nextRelease = isTag ? context.ref.replace('refs/tags/', '') : NEXT_RELEASE_SENTINEL

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
    core.error(`Error getting releases: ${error}`)
    throw error
  }

  return releaseResponse
}

export async function createOrUpdateRelease(
  client: ReturnType<typeof github.getOctokit>,
  inputs: Inputs,
  releaseData: ReleaseData,
): Promise<void> {
  const context = await getContext(inputs.context)
  const releases = releaseData.releases
  const nextRelease = releaseData.nextRelease

  // find if a release draft already exists for versionIncrease
  let releaseDraft = releases.find((release) => release.draft && release.tag_name === nextRelease)

  // for branch events: if no exact match, fall back to the most-recent draft targeting this branch
  if (releaseDraft === undefined && releaseData.branch !== 'tag') {
    releaseDraft = releases.find((release) => release.draft && release.target_commitish === releaseData.branch)
  }

  const draft = releaseData.branch !== 'tag' || !inputs.publish
  const targetBranch = releaseData.branch === 'tag' ? (releaseDraft?.target_commitish ?? nextRelease) : releaseData.branch
  core.debug(`targetBranch: ${targetBranch}`)
  const newReleaseNotes = await generateReleaseNotes(client, inputs, {...releaseData, branch: targetBranch})

  let response
  if (!inputs.dryRun) {
    const releaseParams = {
      ...context.repo,
      tag_name: nextRelease,
      name: nextRelease,
      target_commitish: targetBranch,
      body: newReleaseNotes,
      draft: draft,
    }

    response = await (releaseDraft === undefined
      ? client.rest.repos.createRelease({
          ...releaseParams,
        })
      : client.rest.repos.updateRelease({
          ...releaseParams,
          release_id: releaseDraft.id,
        }))
  }

  const separator = '----------------------------------'
  core.startGroup(`${releaseDraft === undefined ? 'Create' : 'Update'} release draft for ${nextRelease}`)
  core.info(separator)
  core.info(`latestRelease: ${releaseData.latestRelease}`)
  core.info(separator)
  core.info(`releaseNotes: ${newReleaseNotes}`)
  core.info(separator)
  core.info(`releaseURL: ${response?.data?.html_url}`)
  core.info(separator)
  core.debug(`releaseDraft: ${JSON.stringify(releaseDraft, null, 2)}`)
  core.debug(`${releaseDraft === undefined ? 'create' : 'update'}Release: ${JSON.stringify(response?.data, null, 2)}`)
  core.endGroup()

  core.setOutput('release-notes', newReleaseNotes.trim())
  core.setOutput('release-id', response?.data?.id !== undefined ? String(response.data.id) : '')
  core.setOutput('release-url', response?.data?.html_url?.trim() ?? '')
}
