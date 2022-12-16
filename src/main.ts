import * as core from '@actions/core'
import * as github from '@actions/github'

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

    // get all releases
    const octokit = github.getOctokit(token);
    const releases = await octokit.rest.repos.listReleases({
      ...context.repo
    });

    core.info(`Found ${releases.data.length} releases`);
    core.info(`Latest release: ${releases.data[0].tag_name}`);

  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run();
