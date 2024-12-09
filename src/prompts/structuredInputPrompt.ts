import { Task } from "src/tools/taskManager";

export interface InputPrompt {
    getInstructions(): string;
}

export class StructuredInputPrompt implements InputPrompt {
    private inputData: any;
    private instructions: string;

    constructor(instructions: string, inputData: any) {
        this.instructions = instructions;
        this.inputData = inputData;
    }

    public getInstructions(): string {
        return this.instructions;
    }

    public getInputData(): any {
        return this.inputData;
    }

    public toString(): string {
        return `${this.instructions}\n\nInput Data:\n${JSON.stringify(this.inputData, null, 2)}`;
    }
}

export class TaskInputPrompt implements InputPrompt {
    private instructions: string;
    private tasks: Task[];

    constructor(instructions: string, tasks: Task[]) {
        this.instructions = instructions;
        this.tasks = tasks;
    }

    public getInstructions(): string {
        return this.instructions;
    }

    public getTasks(): Task[] {
        return this.tasks;
    }

    public toString(): string {
        return `${this.instructions}\n\nPROVIDED TASK LIST:\n${this.tasks.map(t => ` - ${t.id}: ${t.description}`).join('\n')}`;
    }
}