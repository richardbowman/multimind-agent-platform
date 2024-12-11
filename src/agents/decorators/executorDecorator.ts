export interface ExecutorMetadata {
    key: string;
    description: string;
}

export const executorMetadata = new Map<Function, ExecutorMetadata>();

export function StepExecutor(key: string, description: string) {
    return function (target: Function) {
        executorMetadata.set(target, { key, description });
    };
}

export function getExecutorMetadata(target: Function): ExecutorMetadata | undefined {
    return executorMetadata.get(target);
}
