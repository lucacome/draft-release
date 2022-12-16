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
    const releases = await octokit.paginate(
      octokit.rest.repos.listReleases,
      {
        ...context.repo,
        per_page: 100
      },
      response => response.data
    );

    const tags = await octokit.paginate(
      octokit.rest.repos.listTags,
      {
        ...context.repo,
        per_page: 100
      },
      response => response.data
    );

    core.info(tags[0].name)

    core.info(`Found ${releases.length} releases`);
    core.info(`Latest release: ${releases[0].tag_name}`);
    core.info(releases[0].target_commitish);

  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run();
