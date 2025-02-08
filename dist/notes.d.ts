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
export {};
