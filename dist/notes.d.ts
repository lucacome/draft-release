import * as github from '@actions/github';
import { Inputs } from './context.js';
import { Category } from './version.js';
import { ReleaseData } from './release.js';
type SectionData = {
    [key: string]: string[];
};
export declare function generateReleaseNotes(client: ReturnType<typeof github.getOctokit>, inputs: Inputs, releaseData: ReleaseData): Promise<string>;
export declare function parseNotes(notes: string, major: string, minor: string): string;
export declare function splitMarkdownSections(markdown: string, categories: Category[]): Promise<SectionData>;
/**
 * Groups dependency updates from renovate or dependabot into single entries
 * showing the latest version but preserving all PR links and original order
 * @param sections The parsed sections from the release notes
 * @returns Updated sections with grouped dependency updates
 */
export declare function groupDependencyUpdates(sections: SectionData): Promise<SectionData>;
export {};
