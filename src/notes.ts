import * as github from '@actions/github'
import * as core from '@actions/core'
import * as semver from 'semver'

export async function generateReleaseNotes(
    latestRelease: string,
    releaseID: number,
    nextRelease: string,
): Promise<string> {
    const context = github.context;
    const token = core.getInput('github-token');

    const octokit = github.getOctokit(token);

    const notes = await octokit.rest.repos.generateReleaseNotes({
        ...context.repo,
        release_id: releaseID,
        tag_name: nextRelease,
        previous_tag_name: semver.gt(latestRelease, '0.0.0') ? latestRelease : '',
        target_commitish: context.ref.replace('refs/heads/', ''),
    });

    return notes.data.body;

}

export async function parseNotes(notes: string, major: string, minor: string): Promise<string> {
    let notesType;

    notes.includes(`### ${minor}`) ? notesType = 'minor' : notesType = 'patch'
    notes.includes(`### ${major}`) ? notesType = 'major' : notesType = notesType

    return notesType;


}
