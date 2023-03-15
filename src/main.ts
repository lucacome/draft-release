import * as github from '@actions/github'
import * as core from '@actions/core'
import {getRelease} from './release'
import {generateReleaseNotes} from './notes'
import {getVersionIncrease} from './version'

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

    const token = core.getInput('github-token')
    const major = core.getInput('major-label')
    const minor = core.getInput('minor-label')

    const [releases, latestRelease, releaseID] = await getRelease(token)
    core.info(`getRelease: ${latestRelease}, ${releaseID}`)

    // generate release notes for the next release
    const releaseNotes = await generateReleaseNotes(
      latestRelease,
      releaseID,
      'next'
    )

    // get version increase
    const versionIncrease =
      'v' +
      (await getVersionIncrease(latestRelease, major, minor, releaseNotes))
    core.info(`versionIncrease: ${versionIncrease}`)

    // find if a release draft already exists for versionIncrease
    const releaseDraft = releases.find(
      release => release.draft && release.tag_name === versionIncrease
    )
    core.info(`releaseDraft: ${releaseDraft}`)

    if (releaseDraft === undefined) {
      // create a new release draft
      const octokit = github.getOctokit(token)
      const response = await octokit.rest.repos.createRelease({
        ...context.repo,
        tag_name: versionIncrease,
        name: versionIncrease,
        draft: true,
        generate_release_notes: true,
        target_commitish: context.ref.replace('refs/heads/', '')
      })
      core.info(`createRelease: ${response.data}`)
    } else {
      const newReleaseNotes = await generateReleaseNotes(
        latestRelease,
        releaseDraft.id,
        versionIncrease
      )
      // update the release draft
      const octokit = github.getOctokit(token)
      const response = await octokit.rest.repos.updateRelease({
        ...context.repo,
        release_id: releaseDraft.id,
        tag_name: versionIncrease,
        name: versionIncrease,
        target_commitish: context.ref.replace('refs/heads/', ''),
        body: newReleaseNotes
      })
      core.info(`createRelease: ${response.data}`)
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
  return
}

run()
