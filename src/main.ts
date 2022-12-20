import * as github from '@actions/github'
import * as core from '@actions/core'
import { getRelease } from './release'
import { generateReleaseNotes } from './notes'
import { getVersionIncrease } from './version'

async function run() {
  try {
    const context = github.context;
    core.startGroup(`Context info`);
    core.info(`eventName: ${context.eventName}`);
    core.info(`sha: ${context.sha}`);
    core.info(`ref: ${context.ref}`);
    core.info(`workflow: ${context.workflow}`);
    core.info(`action: ${context.action}`);
    core.info(`actor: ${context.actor}`);
    core.info(`runNumber: ${context.runNumber}`);
    core.info(`runId: ${context.runId}`);
    core.endGroup();

    const token = core.getInput('github-token');
    const major = core.getInput('major-label');
    const minor = core.getInput('minor-label');

    const [latestRelease, releaseID] = await getRelease(token);
    core.info(`getRelease: ${latestRelease}, ${releaseID}`);

    // generate release notes for the next release
    const releaseNotes = await generateReleaseNotes(latestRelease, releaseID, 'next');

    // get version increase
    const versionIncrease = await getVersionIncrease(latestRelease, major, minor, releaseNotes);
    core.info(`versionIncrease: ${versionIncrease}`);



  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run();
