import 'reflect-metadata';

export const EXECUTOR_METADATA_KEY = Symbol('executor');

export interface ExecutorMetadata {
    key: string;
    description: string;
}

export function StepExecutorDecorator(key: string, description: string) {
    return function <T extends { new (...args: any[]): {} }>(constructor: T) {
        Reflect.defineMetadata(EXECUTOR_METADATA_KEY, { key, description }, constructor);
        return constructor;
    };
}

export function getExecutorMetadata(target: Function): ExecutorMetadata | undefined {
    return Reflect.getMetadata(EXECUTOR_METADATA_KEY, target);
}
