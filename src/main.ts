import * as github from '@actions/github'
import * as core from '@actions/core'
import { getRelease } from './release'
import * as fs from 'fs';
import { parse, stringify } from 'yaml'
import * as jsyaml from 'js-yaml'

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
    const [latestRelease, releaseID] = await getRelease(token);
    core.info(`getRelease: ${latestRelease}, ${releaseID}`);

    // generate release notes for the next release
    // const releaseNotes = await generateReleaseNotes(latestRelease, releaseID);


    const releaseFile = '.github/release.yml';

    // read releaseFile
    const releaseFileContent = fs.readFileSync(releaseFile, 'utf8');
    const parsedYAML = parse(releaseFileContent);
    core.info(`releaseFileContent: ${parsedYAML}`);
    // const releaseNotes = parsedYAML
    // core.info(`releaseNotes: ${releaseNotes}`);

    // yaml type definition for release.yml
    // changelog:
    //   exclude:
    //     labels:
    //       - skip-changelog
    //   categories:
    //     - title: 🚀 Features
    //       labels:
    //         - enhancement
    //     - title: 💣 Breaking Changes
    //       labels:
    //         - change
    //     - title: 🐛 Bug Fixes
    //       labels:
    //         - bug

    type ReleaseYAML = {
      changelog: {
        exclude: {
          labels: string[]
        },
        categories: {
          title: string,
          labels: string[]
        }[]
      }
    }

    const doc = jsyaml.load(releaseFileContent) as ReleaseYAML;

    // save all titles and corresponding labels from release.yml in an array
    const categories = doc.changelog.categories.map(category => {
      return {
        title: category.title,
        labels: category.labels
      }
    }
    );

    core.info(`categories: ${categories}`);



  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run();
