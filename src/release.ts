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
  isTag: boolean
  nextRelease: string
}

export async function getRelease(client: ReturnType<typeof github.getOctokit>, inputs: Inputs): Promise<ReleaseData> {
  const releaseResponse: ReleaseData = {
    latestRelease: 'v0.0.0',
    releases: [],
    branch: '',
    isTag: false,
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
    releaseResponse.isTag = isTag
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
  const isTagRun = releaseData.isTag

  let releaseToUpdate: Release | undefined

  if (isTagRun) {
    const sameTagDraft = releases.find((release) => release.draft && release.tag_name === nextRelease)
    const sameTagPublished = releases.find((release) => !release.draft && release.tag_name === nextRelease)

    // Tag flow precedence:
    // 1) Same tag draft
    // 2) Same tag published release
    // 3) Create a new release
    releaseToUpdate = sameTagDraft ?? sameTagPublished
  } else {
    // Branch flow: match tag+branch first, then fall back to latest draft on branch.
    releaseToUpdate = releases.find(
      (release) => release.draft && release.tag_name === nextRelease && release.target_commitish === releaseData.branch,
    )

    if (releaseToUpdate === undefined) {
      releaseToUpdate = releases.find((release) => release.draft && release.target_commitish === releaseData.branch)
    }
  }

  const draft = isTagRun ? (releaseToUpdate?.draft === false ? false : !inputs.publish) : true
  const targetCommitish = isTagRun ? (releaseToUpdate?.target_commitish ?? context.sha) : releaseData.branch
  core.debug(`targetCommitish: ${targetCommitish}`)
  const newReleaseNotes = await generateReleaseNotes(client, inputs, {...releaseData, branch: targetCommitish})

  let response
  if (!inputs.dryRun) {
    const releaseParams = {
      ...context.repo,
      tag_name: nextRelease,
      name: nextRelease,
      target_commitish: targetCommitish,
      body: newReleaseNotes,
      draft: draft,
    }

    response = await (releaseToUpdate === undefined
      ? client.rest.repos.createRelease({
          ...releaseParams,
        })
      : client.rest.repos.updateRelease({
          ...releaseParams,
          release_id: releaseToUpdate.id,
        }))
  }

  const separator = '----------------------------------'
  core.startGroup(`${releaseToUpdate === undefined ? 'Create' : 'Update'} release for ${nextRelease}`)
  core.info(separator)
  core.info(`latestRelease: ${releaseData.latestRelease}`)
  core.info(separator)
  core.info(`releaseNotes: ${newReleaseNotes}`)
  core.info(separator)
  core.info(`releaseURL: ${response?.data?.html_url}`)
  core.info(separator)
  core.debug(`releaseToUpdate: ${JSON.stringify(releaseToUpdate, null, 2)}`)
  core.debug(`${releaseToUpdate === undefined ? 'create' : 'update'}Release: ${JSON.stringify(response?.data, null, 2)}`)
  core.endGroup()

  core.setOutput('release-notes', newReleaseNotes.trim())
  core.setOutput('release-id', response?.data?.id !== undefined ? String(response.data.id) : '')
  core.setOutput('release-url', response?.data?.html_url?.trim() ?? '')
}
