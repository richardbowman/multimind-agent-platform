import 'reflect-metadata';

export const EXECUTOR_METADATA_KEY = Symbol('executor');

export interface ExecutorMetadata {
    key: string;
    description: string;
    planner?: boolean;
}

export function StepExecutorDecorator(key: string, description: string, planner: boolean = true) {
    return function <T extends { new (...args: any[]): {} }>(constructor: T) {
        Reflect.defineMetadata(EXECUTOR_METADATA_KEY, { key, description, planner }, constructor);
        return constructor;
    };
}

export function getExecutorMetadata(target: Function): ExecutorMetadata | undefined {
    return Reflect.getMetadata(EXECUTOR_METADATA_KEY, target);
}
