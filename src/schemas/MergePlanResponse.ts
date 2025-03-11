export interface MergePlanResponse {
    artifactIndexes: number[];
    mergeStrategy: 'union' | 'intersection' | 'specific_columns';
    columnsToKeep?: string[];
    deduplicate: boolean;
}
