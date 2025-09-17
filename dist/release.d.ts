import * as github from '@actions/github';
import { components as OctoOpenApiTypes } from '@octokit/openapi-types';
import { Inputs } from './context.js';
type Release = OctoOpenApiTypes['schemas']['release'];
export type ReleaseData = {
    latestRelease: string;
    releases: Release[];
    branch: string;
    nextRelease: string;
};
export declare function getRelease(client: ReturnType<typeof github.getOctokit>): Promise<ReleaseData>;
export declare function createOrUpdateRelease(client: ReturnType<typeof github.getOctokit>, inputs: Inputs, releaseData: ReleaseData): Promise<void>;
export {};
//# sourceMappingURL=release.d.ts.map