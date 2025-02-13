import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResult, StepResultType } from '../interfaces/StepResult';
import { StructuredOutputPrompt } from "../../llm/ILLMService";
import { ModelHelpers } from '../../llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { Task, TaskManager, TaskType } from '../../tools/taskManager';
import Logger from '../../helpers/logger';
import { createUUID } from 'src/types/uuid';
import { Agent } from '../agents';
import { ContentType } from 'src/llm/promptBuilder';
import { Artifact, ArtifactType } from '../../tools/artifact';
import { parse } from 'csv';
import * as fs from 'fs';
import { stringify } from 'csv-stringify/sync';
import { ArtifactManager } from 'src/tools/artifactManager';

@StepExecutorDecorator('csv-processor', 'Process CSV artifacts by delegating tasks for each row')
export class CSVProcessingExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private taskManager: TaskManager;
    private artifactManager: ArtifactManager;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;
        this.taskManager = params.taskManager!;
        this.artifactManager = params.artifactManager!;
    }

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        // Find the first CSV artifact
        const csvArtifact = params.context?.artifacts?.find(a => a.type === ArtifactType.Spreadsheet);
        if (!csvArtifact) {
            return {
                type: StepResultType.Error,
                finished: true,
                response: {
                    message: 'No CSV artifact found to process'
                }
            };
        }

        // Read the CSV file
        const rows: any[] = [];
        try {
            const artifact = await this.artifactManager.loadArtifact(csvArtifact.id);

            if (!artifact) {
                throw new Error(`Could not load artifact ${csvArtifact.id}`);
            }
            
            const parser = parse(artifact.content.toString(), {
                columns: true,
                skip_empty_lines: true,
                trim: true,
                relax_quotes: true,
                relax_column_count: true,
                bom: true
            });
            for await (const record of parser) {
                rows.push(record);
            }
        } catch (error) {
            Logger.error('Error reading CSV file:', error);
            return {
                type: StepResultType.Error,
                finished: true,
                response: {
                    message: 'Failed to read the CSV file'
                }
            };
        }

        // Create schema for agent selection
        const schema = {
            type: 'object',
            properties: {
                projectName: { type: 'string' },
                projectGoal: { type: 'string' },
                assignedAgent: { type: 'string' }, // Agent handle
                responseMessage: { type: 'string' }
            }
        };

        const supportedAgents = params.agents?.filter(a => a.supportsDelegation);

        // Create prompt for agent selection
        const prompt = this.modelHelpers.createPrompt();
        prompt.addInstruction(`Select the most appropriate agent to process this CSV file based on the goal and content.
            The CSV contains ${rows.length} rows of data.
            Consider the agents' capabilities and the nature of the data when making your selection.
            Output should include:
            - A clear project name and goal
            - The handle of the selected agent
            - A response message explaining the selection to the user.`);
        
        if (supportedAgents) {
            prompt.addContext({
                contentType: ContentType.CHANNEL_AGENT_CAPABILITIES, 
                agents: supportedAgents
            });
        }

        prompt.addInstruction(`IMPORTANT SELECTION RULES:
            - Choose the most specialized agent for the work
            - Consider the type of data in the CSV
            - If multiple agents could handle it, choose the one with the most relevant expertise`);

        const structuredPrompt = new StructuredOutputPrompt(
            schema,
            prompt.build()
        );

        try {
            const responseJSON = await this.modelHelpers.generate({
                message: params.stepGoal,
                instructions: structuredPrompt
            });

            const { projectName, projectGoal, assignedAgent: selectedAgentHandle, responseMessage } = responseJSON;

            // Find the selected agent
            const assignedAgent = supportedAgents?.find(a => a.messagingHandle === selectedAgentHandle);
            if (!assignedAgent) {
                return {
                    type: StepResultType.Error,
                    finished: true,
                    response: {
                        message: `Unable to delegate to unknown agent ${selectedAgentHandle}`
                    }
                };
            }

            // Create the project
            const project = await this.taskManager.createProject({
                name: projectName,
                metadata: {
                    description: projectGoal,
                    status: 'active',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    parentTaskId: params.stepId
                }
            });

            // Create a single task for all rows
            const taskId = createUUID();
            
            // Create task description with row data
            const taskDescription = `Process ${rows.length} rows from ${csvArtifact.name}:\n\n` +
                rows.map((row, index) => 
                    `Row ${index + 1}:\n` +
                    Object.entries(row)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join('\n')
                ).join('\n\n');

            await this.taskManager.addTask(project, {
                id: taskId,
                description: taskDescription,
                creator: params.agentId,
                type: TaskType.Standard,
                props: {
                    rowIndices: rows.map((_, index) => index),
                    csvArtifactId: csvArtifact.id,
                    originalRowData: rows
                }
            });

            // Assign to agent
            await this.taskManager.assignTaskToAgent(taskId, assignedAgent.userId);

            const taskDetails = [`Process ${rows.length} rows [${taskId}] -> ${assignedAgent.messagingHandle}`];

            return {
                type: StepResultType.Delegation,
                projectId: project.id,
                finished: false,
                async: true,
                response: {
                    message: `${responseMessage}\n\nProject "${projectName}" created with ID: ${project.id}\n\nTasks:\n` +
                        taskDetails.join('\n')
                }
            };

        } catch (error) {
            Logger.error('Error in CSVProcessingExecutor:', error);
            return {
                type: StepResultType.Delegation,
                finished: true,
                response: {
                    message: 'Failed to create the CSV processing project. Please try again later.'
                }
            };
        }
    }

    async updateCSVWithResults(artifact: Artifact, results: any[]): Promise<void> {
        if (artifact.type !== ArtifactType.Spreadsheet) {
            throw new Error('Can only update spreadsheet artifacts');
        }

        // Read existing CSV
        const rows: any[] = [];
        await new Promise((resolve, reject) => {
            fs.createReadStream(artifact.filePath)
                .pipe(csv())
                .on('data', (row) => rows.push(row))
                .on('end', resolve)
                .on('error', reject);
        });

        // Merge results with existing rows
        for (const result of results) {
            const rowIndex = result.rowIndex;
            if (rowIndex >= 0 && rowIndex < rows.length) {
                rows[rowIndex] = { ...rows[rowIndex], ...result.data };
            }
        }

        // Write updated CSV
        const output = stringify(rows, { header: true });
        fs.writeFileSync(artifact.filePath, output);
    }
}
