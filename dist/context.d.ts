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
    removeConventionalPrefixes: boolean;
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
export declare function getInputs(): Inputs;
//# sourceMappingURL=context.d.ts.map