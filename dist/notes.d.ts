import * as github from '@actions/github';
import { Inputs } from './context.js';
import { Category } from './version.js';
import { ReleaseData } from './release.js';
type SectionData = {
    [key: string]: string[];
};
/**
 * Generates and formats release notes for a GitHub repository.
 *
 * This function fetches release notes via GitHub's REST API between specified release tags, processes the resulting markdown
 * by splitting it into categorized sections, and optionally groups dependency updates. It also collapses sections with an
 * item count exceeding the specified threshold and applies header and footer templates populated with dynamic release data.
 * Finally, it sets outputs for the header, footer, and parsed sections before returning the complete markdown.
 *
 * @returns The fully formatted release notes in markdown format.
 */
export declare function generateReleaseNotes(client: ReturnType<typeof github.getOctokit>, inputs: Inputs, releaseData: ReleaseData): Promise<string>;
/**
 * Determines the type of release update based on version headings in the provided release notes.
 *
 * The function searches the markdown content for headings formatted as "### {minor}" and "### {major}".
 * If a heading for the specified minor version is found, it initially categorizes the release as "minor".
 * If a heading for the specified major version is also present, it overrides the minor designation to "major".
 * In the absence of either heading, the release is classified as a "patch".
 *
 * @param notes - The markdown content containing the release notes.
 * @param major - The major version header to look for (formatted without the "###" prefix).
 * @param minor - The minor version header to look for (formatted without the "###" prefix).
 * @returns A string indicating the release type: "patch", "minor", or "major".
 */
export declare function parseNotes(notes: string, major: string, minor: string): string;
/**
 * Splits a markdown string into categorized sections using header and bullet list markers.
 *
 * The function parses the markdown content line by line to detect section headers marked with "### ".
 * When a header matches a category's title, it assigns subsequent bullet list items (lines starting with "* ")
 * to the corresponding section using the first label of the matching category. Empty lines are skipped, and
 * lines that do not match the expected patterns reset the current category.
 *
 * @param markdown - The markdown content to be parsed.
 * @param categories - An array of category definitions, each with a title and associated labels used for mapping sections.
 * @returns A promise that resolves to an object mapping category labels to arrays of markdown bullet list items.
 */
export declare function splitMarkdownSections(markdown: string, categories: Category[]): Promise<SectionData>;
/**
 * Removes conventional commit prefixes from release note entries.
 *
 * @param sections - Parsed release note sections categorized by type
 * @returns Updated sections with prefixes removed
 */
export declare function removeConventionalPrefixes(sections: SectionData): Promise<SectionData>;
/**
 * Consolidates dependency update entries in release note sections.
 *
 * Processes parsed release note sections by grouping automated dependency update entries that match defined update patterns,
 * such as Renovate standard updates, Renovate lockfile maintenance, Dependabot updates, and pre-commit-ci updates.
 * For each dependency, it aggregates entries to record the most recent update while merging all relevant pull request links,
 * and preserves the original order of non-matching items.
 *
 * @param sections - Parsed release note sections categorized by type.
 * @returns Updated release note sections with consolidated dependency update entries.
 */
export declare function groupDependencyUpdates(sections: SectionData): Promise<SectionData>;
export {};
//# sourceMappingURL=notes.d.ts.map