export interface ExecutorMetadata {
    key: string;
    description: string;
}

export const executorMetadata = new Map<Function, ExecutorMetadata>();

export function StepExecutor(key: string, description: string) {
    return function (target: Function) {
        // Store metadata on both the constructor and prototype
        executorMetadata.set(target, { key, description });
        executorMetadata.set(target.prototype.constructor, { key, description });
        return target;
    };
}

export function getExecutorMetadata(target: Function): ExecutorMetadata | undefined {
    return executorMetadata.get(target) || executorMetadata.get(target.prototype?.constructor);
}
