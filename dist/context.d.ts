export interface Inputs {
    githubToken: string;
    majorLabel: string;
    minorLabel: string;
    header: string;
    footer: string;
    variables: string[];
    collapseAfter: number;
    publish: boolean;
    configPath: string;
    dryRun: boolean;
    groupDependencies: boolean;
}
export declare function getInputs(): Inputs;
