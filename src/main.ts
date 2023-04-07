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

    const releaseData = await getRelease(client)
    core.setOutput('previous-version', releaseData.latestRelease)

    core.startGroup(`Releases`)
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
    core.endGroup()

    if (releaseData.nextRelease === 'next') {
      // generate release notes for the next release
      const releaseNotes = await generateReleaseNotes(client, inputs, releaseData)
      releaseData.nextRelease = 'v' + (await getVersionIncrease(releaseData, inputs, releaseNotes))
    }
    core.setOutput('version', releaseData.nextRelease)

    // create or update release
    await createOrUpdateRelease(client, inputs, releaseData)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
  return
}

run()
