import 'reflect-metadata';

export const EXECUTOR_METADATA_KEY = Symbol('executor');

export interface ExecutorMetadata {
    key: string;
    description: string;
}

export function StepExecutor(key: string, description: string) {
    return function (target: Function) {
        Reflect.defineMetadata(EXECUTOR_METADATA_KEY, { key, description }, target);
        return target;
    };
}

export function getExecutorMetadata(target: Function): ExecutorMetadata | undefined {
    return Reflect.getMetadata(EXECUTOR_METADATA_KEY, target);
}
