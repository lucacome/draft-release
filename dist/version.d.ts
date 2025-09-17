import { Inputs } from './context.js';
import { ReleaseData } from './release.js';
export interface Category {
    title: string;
    labels: string[];
}
export declare function getCategories(inputs: Inputs): Promise<Category[]>;
export declare function getVersionIncrease(releaseData: ReleaseData, inputs: Inputs, notes: string): Promise<string>;
//# sourceMappingURL=version.d.ts.map