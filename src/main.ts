import * as github from '@actions/github'
import * as core from '@actions/core'
import {getRelease, createOrUpdateRelease, NEXT_RELEASE_SENTINEL} from './release.js'
import {generateReleaseNotes} from './notes.js'
import {getVersionIncrease} from './version.js'
import {getContext, getInputs, Inputs} from './context.js'

export async function run(): Promise<void> {
  try {
    const inputs: Inputs = getInputs()
    const client = github.getOctokit(inputs.githubToken)
    const context = await getContext(inputs.context)

    await core.group(`Context info`, async () => {
      core.info(`eventName: ${context.eventName}`)
      core.info(`sha: ${context.sha}`)
      core.info(`ref: ${context.ref}`)
      core.info(`workflow: ${context.workflow}`)
      core.info(`action: ${context.action}`)
      core.info(`actor: ${context.actor}`)
      core.info(`owner: ${context.repo.owner}`)
      core.info(`repo: ${context.repo.repo}`)
      core.info(`job: ${context.job}`)
      core.info(`runNumber: ${context.runNumber}`)
      core.info(`runAttempt: ${context.runAttempt}`)
      core.info(`runId: ${context.runId}`)
    })

    const releaseData = await getRelease(client, inputs)
    core.setOutput('previous-version', releaseData.latestRelease)

    await core.group(`Releases`, async () => {
      core.info(`Latest release: ${releaseData.latestRelease}`)
      core.info(`Found ${releaseData.releases.length} release(s):`)
      core.info(`-`.repeat(20))
      releaseData.releases.forEach((release) => {
        core.info(`ID: ${release.id}`)
        core.info(`Release: ${release.tag_name}`)
        core.info(`Draft: ${release.draft}`)
        core.info(`Target commitish: ${release.target_commitish}`)
        core.info(`-`.repeat(20))
      })
    })

    if (releaseData.nextRelease === NEXT_RELEASE_SENTINEL) {
      // generate release notes for the next release
      const releaseNotes = await generateReleaseNotes(client, inputs, releaseData)
      const versionIncrease = await getVersionIncrease(releaseData, inputs, releaseNotes)
      if (!versionIncrease) {
        throw new Error(
          `Could not compute next version from latest release '${releaseData.latestRelease}'. Ensure it is a valid semver tag.`,
        )
      }
      releaseData.nextRelease = 'v' + versionIncrease
    }
    core.setOutput('version', releaseData.nextRelease)

    // create or update release

    await createOrUpdateRelease(client, inputs, releaseData)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}
