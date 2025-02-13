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
import * as csv from 'csv-parser';
import * as fs from 'fs';
import { stringify } from 'csv-stringify/sync';

@StepExecutorDecorator('csv-processor', 'Process CSV artifacts by delegating tasks for each row')
export class CSVProcessingExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private taskManager: TaskManager;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;
        this.taskManager = params.taskManager!;
    }

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        // Find the first CSV artifact
        const csvArtifact = params.artifacts?.find(a => a.type === ArtifactType.Spreadsheet);
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
            await new Promise((resolve, reject) => {
                fs.createReadStream(csvArtifact.filePath)
                    .pipe(csv())
                    .on('data', (row) => rows.push(row))
                    .on('end', resolve)
                    .on('error', reject);
            });
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

        // Create schema for delegation plan
        const schema = {
            type: 'object',
            properties: {
                projectName: { type: 'string' },
                projectGoal: { type: 'string' },
                taskGroups: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            description: { type: 'string' },
                            assignee: { type: 'string' }, // Agent handle
                            rowIndices: {
                                type: 'array',
                                items: { type: 'number' }
                            }
                        }
                    }
                },
                responseMessage: { type: 'string' }
            }
        };

        const supportedAgents = params.agents?.filter(a => a.supportsDelegation);

        // Create prompt for delegation planning
        const prompt = this.modelHelpers.createPrompt();
        prompt.addInstruction(`Create a plan to process this CSV file by delegating tasks to appropriate agents. 
            The CSV contains ${rows.length} rows of data. 
            Group similar rows together and assign them to the most appropriate agent based on their capabilities.
            Output should include:
            - A clear project name and goal
            - Groups of tasks with descriptions, assigned agents, and the row indices they should process
            - A response message to explain the delegation plan to the user.
            - Create as few delegation steps as possible to achieve the goal.`);
        
        if (supportedAgents) {
            prompt.addContext({
                contentType: ContentType.CHANNEL_AGENT_CAPABILITIES, 
                agents: supportedAgents
            });
        }

        prompt.addInstruction(`IMPORTANT DELEGATION RULES:
            - Group similar rows together to minimize the number of tasks
            - Assign tasks to the most specialized agent for the work
            - If you delegate to managers, do not also delegate to their team
            - Make sure task descriptions are complete and self-contained`);

        const structuredPrompt = new StructuredOutputPrompt(
            schema,
            prompt.build()
        );

        try {
            const responseJSON = await this.modelHelpers.generate({
                message: params.stepGoal,
                instructions: structuredPrompt
            });

            const { projectName, projectGoal, taskGroups, responseMessage } = responseJSON;

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

            // Create tasks and assign to agents
            const taskDetails: string[] = [];
            for (const group of taskGroups) {
                const taskId = createUUID();
                
                // Create task description with row data
                const taskDescription = `Process ${group.rowIndices.length} rows from ${csvArtifact.name}:\n` +
                    group.description + '\n\nRows to process:\n' +
                    group.rowIndices.map(index => {
                        const row = rows[index];
                        return `Row ${index + 1}:\n` +
                            Object.entries(row)
                                .map(([key, value]) => `${key}: ${value}`)
                                .join('\n');
                    }).join('\n\n');

                await this.taskManager.addTask(project, {
                    id: taskId,
                    description: taskDescription,
                    creator: params.agentId,
                    type: TaskType.Standard,
                    props: {
                        rowIndices: group.rowIndices,
                        csvArtifactId: csvArtifact.id,
                        originalRowData: group.rowIndices.map(index => rows[index])
                    }
                });

                // Find and assign to agent
                const agent = params.agents?.find(a => a.messagingHandle === group.assignee);
                if (agent) {
                    await this.taskManager.assignTaskToAgent(taskId, agent.userId);
                } else {
                    Logger.error(`Unable to delegate to unknown (or unsupported for delegation) agent ${group.assignee}`);
                }

                taskDetails.push(`${group.description} [${taskId}] -> ${group.assignee} (${group.rowIndices.length} rows)`);
            }

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
