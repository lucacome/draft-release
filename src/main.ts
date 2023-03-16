import * as github from '@actions/github'
import * as core from '@actions/core'
import {getRelease, createOrUpdateRelease} from './release'
import {generateReleaseNotes} from './notes'
import {getVersionIncrease} from './version'
import {getInputs, Inputs} from './context'

async function run(): Promise<void> {
  try {
    const context = github.context
    core.startGroup(`Context info`)
    core.info(`eventName: ${context.eventName}`)
    core.info(`sha: ${context.sha}`)
    core.info(`ref: ${context.ref}`)
    core.info(`workflow: ${context.workflow}`)
    core.info(`action: ${context.action}`)
    core.info(`actor: ${context.actor}`)
    core.info(`runNumber: ${context.runNumber}`)
    core.info(`runId: ${context.runId}`)
    core.endGroup()

    const inputs: Inputs = getInputs()
    const client = github.getOctokit(inputs.githubToken)

    const [releases, latestRelease, releaseID] = await getRelease(client)
    core.info(`getRelease: ${latestRelease}, ${releaseID}`)

    // generate release notes for the next release
    const releaseNotes = await generateReleaseNotes(client, inputs, latestRelease, releaseID, 'next')

    // get version increase
    const versionIncrease = 'v' + (await getVersionIncrease(latestRelease, inputs, releaseNotes))
    core.info(`versionIncrease: ${versionIncrease}`)

    // find if a release draft already exists for versionIncrease
    const releaseDraft = releases.find((release) => release.draft && release.tag_name === versionIncrease)
    core.info(`releaseDraft: ${releaseDraft}`)

    // create or update release
    await createOrUpdateRelease(client, inputs, latestRelease, versionIncrease, releaseDraft ? releaseDraft.id : releaseID)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
  return
}

run()
