import { PromptBuilder } from 'src/llm/promptBuilder';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ExecutorType } from '../interfaces/ExecutorType';
import { ArtifactGenerationStepResponse, GenerateArtifactExecutor } from './GenerateArtifactExecutor';
import { ArtifactType } from 'src/tools/artifact';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { ModelConversation } from '../interfaces/StepExecutor';
import { JSONSchema } from 'openai/lib/jsonschema';

@StepExecutorDecorator(ExecutorType.GENERATE_MARKWHEN, 'Create/revise a Markwhen timeline roadmap.')
export class GenerateMarkwhenExecutor extends GenerateArtifactExecutor {
    protected getGanttSchema(): JSONSchema {
        return {
            type: "object",
            properties: {
                tasks: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            id: { type: "number", description: "Unique numeric ID for the task" },
                            text: { type: "string", description: "Task name or description" },
                            start: { 
                                type: "string", 
                                format: "date-time",
                                description: "Start date in ISO format (YYYY-MM-DDTHH:mm:ssZ)"
                            },
                            end: { 
                                type: "string", 
                                format: "date-time",
                                description: "End date in ISO format (YYYY-MM-DDTHH:mm:ssZ)"
                            },
                            duration: { 
                                type: "number", 
                                description: "Duration in days",
                                minimum: 0
                            },
                            progress: {
                                type: "number",
                                description: "Progress percentage (0-100)",
                                minimum: 0,
                                maximum: 100
                            },
                            type: {
                                type: "string",
                                enum: ["task", "summary"],
                                description: "Task type - 'task' for regular tasks, 'summary' for parent tasks"
                            },
                            parent: {
                                type: "number",
                                description: "Parent task ID for subtasks",
                                minimum: 0
                            }
                        },
                        required: ["id", "text", "start", "end", "type"]
                    }
                },
                links: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            id: { type: "number", description: "Unique numeric ID for the link" },
                            source: { 
                                type: "number", 
                                description: "Source task ID",
                                minimum: 0
                            },
                            target: { 
                                type: "number", 
                                description: "Target task ID",
                                minimum: 0
                            },
                            type: {
                                type: "string",
                                enum: ["e2e", "s2s", "f2f", "s2f"],
                                description: "Dependency type between tasks"
                            }
                        },
                        required: ["id", "source", "target", "type"]
                    }
                },
                scales: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            unit: {
                                type: "string",
                                enum: ["year", "month", "week", "day", "hour"],
                                description: "Time unit for the scale"
                            },
                            step: {
                                type: "number",
                                description: "Step size for the time unit",
                                minimum: 1
                            },
                            format: {
                                type: "string",
                                description: "Date format string"
                            }
                        },
                        required: ["unit", "step", "format"]
                    }
                }
            },
            required: ["tasks"]
        };
    }

    protected addContentFormattingRules(prompt: ModelConversation<ArtifactGenerationStepResponse>) {
        const schema = this.getGanttSchema();
        prompt.addInstruction(`GANTT CHART DATA FORMAT RULES:
- Generate JSON data for a Gantt chart inside <artifact_gantt> blocks
- Follow this JSON Schema for proper structure:
${JSON.stringify(schema, null, 2)}
- Use ISO 8601 date format for all date fields
- Ensure all IDs are unique numbers
- Maintain proper task hierarchy using parent IDs
- Include dependencies with links where needed`);
    }

    protected getContentRules(): string {
        return `GANTT CHART DATA FORMATTING RULES:
- Use valid JSON format INSIDE of the <artifact_gantt> blocks
- Follow the provided JSON Schema exactly
- Include all required fields for tasks and links
- Use proper ISO 8601 date formatting
- Maintain task hierarchy with parent/child relationships
- Include dependencies with links where needed`;
    }

    protected getSupportedFormat(): string {
        return 'gantt';
    }

    getArtifactType(): ArtifactType {
        return ArtifactType.Document;
    }

    protected async prepareArtifactMetadata(result: any): Promise<Record<string, any>> {
        return {
            ...await super.prepareArtifactMetadata(result),
            subtype: 'Roadmap',
            format: 'gantt'
        };
    }
}
