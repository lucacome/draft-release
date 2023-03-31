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

    const [releases, latestRelease] = await getRelease(client)
    core.setOutput('previous-version', latestRelease)

    core.startGroup(`Releases`)
    core.info(`Latest release: ${latestRelease}`)
    core.info(`Found ${releases.length} release(s):`)
    core.info(`-`.repeat(20))
    releases.forEach((release) => {
      core.info(`ID: ${release.id}`)
      core.info(`Release: ${release.tag_name}`)
      core.info(`Draft: ${release.draft}`)
      core.info(`Target commitish: ${release.target_commitish}`)
      core.info(`-`.repeat(20))
    })
    core.endGroup()

    // generate release notes for the next release
    const releaseNotes = await generateReleaseNotes(client, inputs, latestRelease, 'next')

    // get version increase
    const versionIncrease = 'v' + (await getVersionIncrease(latestRelease, inputs, releaseNotes))
    core.setOutput('version', versionIncrease)

    // create or update release
    await createOrUpdateRelease(client, inputs, releases, latestRelease, versionIncrease)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
  return
}

run()
