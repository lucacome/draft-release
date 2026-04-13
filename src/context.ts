import * as core from '@actions/core'
import * as github from '@actions/github'
import {Util} from '@docker/actions-toolkit/lib/util.js'
import {Git} from '@docker/actions-toolkit/lib/git.js'

export enum ContextSource {
  workflow = 'workflow',
  git = 'git',
}

export interface Inputs {
  githubToken: string
  majorLabel: string
  minorLabel: string
  header: string
  footer: string
  variables: string[]
  collapseAfter: number
  publish: boolean
  configPath: string
  dryRun: boolean
  groupDependencies: boolean
  removeConventionalPrefixes: boolean
  context: ContextSource
}

/**
 * Retrieves and parses the inputs for the GitHub Action.
 *
 * This function collects input values using the GitHub Actions core utilities and
 * returns them as an object that conforms to the Inputs interface. It converts string
 * inputs to appropriate types where necessary, such as parsing the 'collapse-after'
 * input to an integer and interpreting 'publish', 'dry-run', and 'group-dependencies' as booleans.
 *
 * @returns An object containing the structured inputs for the action.
 */
export function getInputs(): Inputs {
  return {
    githubToken: core.getInput('github-token'),
    majorLabel: core.getInput('major-label'),
    minorLabel: core.getInput('minor-label'),
    header: core.getInput('notes-header'),
    footer: core.getInput('notes-footer'),
    variables: Util.getInputList('variables'),
    collapseAfter: parseInt(core.getInput('collapse-after'), 10),
    publish: core.getBooleanInput('publish'),
    configPath: core.getInput('config-path'),
    dryRun: core.getBooleanInput('dry-run'),
    groupDependencies: core.getBooleanInput('group-dependencies'),
    removeConventionalPrefixes: core.getBooleanInput('remove-conventional-prefixes'),
    context: (core.getInput('context') || ContextSource.workflow) as ContextSource,
  }
}

type Context = typeof github.context

// Cache the git context so git commands are only run once per action invocation,
// and all callers receive the same consistent ref/sha snapshot.
let cachedGitContext: Context | undefined

/**
 * Returns the action context from either the workflow environment or live git commands.
 *
 * When source is `ContextSource.git`, the result is memoized: git commands (`git branch`,
 * `git show`, etc.) are executed only on the first call, and every subsequent call returns
 * the same context object. This guarantees a consistent ref/sha across all callers and
 * avoids redundant shell spawns.
 *
 * @param source - The context source: `workflow` (default GitHub Actions env) or `git` (live git).
 * @returns The resolved action context.
 */
export async function getContext(source: ContextSource): Promise<Context> {
  if (source !== ContextSource.git) {
    return github.context
  }
  if (cachedGitContext) {
    return cachedGitContext
  }
  // Git.context() shallow-spreads github.context, which misses prototype getters (e.g. `repo`).
  // Explicitly re-attach repo so downstream callers can rely on context.repo.
  const ctx = await Git.context()
  cachedGitContext = Object.assign(ctx, {repo: github.context.repo})
  return cachedGitContext
}
