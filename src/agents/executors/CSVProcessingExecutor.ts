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

        // Find the most appropriate agent for processing
        const supportedAgents = params.agents?.filter(a => a.supportsDelegation);
        const researcherAgent = supportedAgents?.find(a => a.messagingHandle === 'researcher');
        const defaultAgent = supportedAgents?.[0];
        const assignedAgent = researcherAgent || defaultAgent;

        if (!assignedAgent) {
            return {
                type: StepResultType.Error,
                finished: true,
                response: {
                    message: 'No available agents to process the CSV'
                }
            };
        }

        const projectName = `CSV Processing - ${csvArtifact.name}`;
        const projectGoal = `Process ${rows.length} rows from ${csvArtifact.name}`;
        const responseMessage = `Created a task to process ${rows.length} rows from ${csvArtifact.name}. Assigned to ${assignedAgent.messagingHandle}.`;

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
