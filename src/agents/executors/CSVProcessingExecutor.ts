import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResponse, StepResult, StepResultType } from '../interfaces/StepResult';
import { JSONSchema, StructuredOutputPrompt } from "../../llm/ILLMService";
import { ModelHelpers } from '../../llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { Task, TaskManager, TaskType } from '../../tools/taskManager';
import Logger from '../../helpers/logger';
import { createUUID } from 'src/types/uuid';
import { Agent } from '../agents';
import { ContentType, OutputType } from 'src/llm/promptBuilder';
import { Artifact, ArtifactType } from '../../tools/artifact';
import { parse } from 'csv-parse';
import * as fs from 'fs';
import { stringify } from 'csv-stringify/sync';
import { ArtifactManager } from 'src/tools/artifactManager';
import { ExecutorType } from '../interfaces/ExecutorType';
import { ModelMessageResponse } from 'src/schemas/ModelResponse';
import { StringUtils } from 'src/utils/StringUtils';

@StepExecutorDecorator(ExecutorType.CSV_PROCESSOR, 'Process each row of a CSV spreadsheet')
export class CSVProcessingExecutor implements StepExecutor<StepResponse> {
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
            
            // Parse CSV with headers
            const parser = parse(artifact.content.toString(), {
                columns: true,
                skip_empty_lines: true,
                trim: true,
                relax_quotes: true,
                relax_column_count: true,
                bom: true
            });
            
            // Store headers separately
            const headers = Object.keys(parser.options.columns || {});
            
            for await (const record of parser) {
                rows.push({ headers, data: record });
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
        const supportedAgents = [{...params.self, messagingHandle: "@self"}, ...params.agents?.filter(a => a.supportsDelegation)??[]].filter(a => a !== undefined);

        const schema : JSONSchema = {
            type: 'object',
            properties: {
                projectName: { type: 'string' },
                taskDescription: { type: 'string' },
                assignedAgent: { 
                    type: 'string',
                    enum: supportedAgents.map(a => a.messagingHandle) ?? []
                },
                responseMessage: { type: 'string' }
            }
        };

        // Create prompt for agent selection
        const prompt = this.modelHelpers.createPrompt();
        prompt.addInstruction(`Select the most appropriate agent to perform processing on the data in the spreadsheet for the desired goal.
            The CSV contains ${rows.length} rows of data.
            Consider the agents' capabilities and the nature of the data when making your selection.
            JSON Output should include:
            - projectName: A short overall project name
            - taskDescription: A description of the specific task to perform that is stand alone and provides broad and thorough
                context on the goal. This is the only information the agent will receive in addition to the field and values of the
                each specific row.
                Your description might start with "The overall goals is ... For the provided data, generate..."
            - assignedAgent: The handle of the selected agent

            Also respond with a message explaining the selection to the user.`);
        
        if (supportedAgents) {
            prompt.addContext({
                contentType: ContentType.AGENT_OVERVIEWS, 
                agents: supportedAgents
            });
        }

        prompt.addOutputInstructions(OutputType.JSON_WITH_MESSAGE, schema);

        try {
            const rawResponse = await this.modelHelpers.generate<ModelMessageResponse>({
                message: params.stepGoal,
                instructions: prompt
            });

            const responseJSON = StringUtils.extractAndParseJsonBlock(rawResponse.message);
            const message = StringUtils.extractNonCodeContent(rawResponse.message);


            const { projectName, taskDescription, assignedAgent: selectedAgentHandle } = responseJSON;

            // Find the assigned agent (self or delegated)
            const assignedAgent = selectedAgentHandle === '@self' 
                ? params.self 
                : supportedAgents?.find(a => a.messagingHandle === selectedAgentHandle);
            
            if (!assignedAgent) {
                return {
                    type: StepResultType.Error,
                    finished: true,
                    response: {
                        message: `Unable to assign tasks to agent ${selectedAgentHandle}`
                    }
                };
            }

            // Create the project
            const project = await this.taskManager.createProject({
                name: projectName,
                metadata: {
                    status: 'active',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    parentTaskId: params.stepId
                }
            });

            // Create and assign tasks for each row
            const taskDetails: string[] = [];
            
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const taskId = createUUID();
                
                // Create task description with headers
                const taskData = `The data from row ${i + 1} from ${csvArtifact.metadata?.title || 'CSV file'}:\n` +
                    Object.keys(row.data).map((header: string) => 
                        `${header}: ${row.data[header] || ''}`
                    ).join('\n');

                await this.taskManager.addTask(project, {
                    id: taskId,
                    description: `GOAL: ${taskDescription} DATA: ${taskData}`,
                    creator: params.agentId,
                    type: TaskType.Standard,
                    props: {
                        rowIndex: i,
                        csvArtifactId: csvArtifact.id,
                        originalRowData: row.data,
                        attachedArtifactIds: params.context?.artifacts?.map(a => a.id)
                    }
                });

                // Assign to agent (self or delegated)
                await this.taskManager.assignTaskToAgent(taskId, assignedAgent.userId);
                
                taskDetails.push(`Row ${i + 1} [${taskId}] -> ${assignedAgent.messagingHandle || '@self'}`);
            }

            return {
                type: StepResultType.Delegation,
                projectId: project.id,
                finished: false,
                async: true,
                response: {
                    message
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

    async handleTaskNotification(notification: TaskNotification): Promise<void> {
        const { task, eventType } = notification;
        
        // Only handle task updates for our CSV processing tasks
        if (task.type !== TaskType.Standard || !task.props?.csvArtifactId) {
            return;
        }

        // Load the CSV artifact
        const csvArtifact = await this.artifactManager.loadArtifact(task.props.csvArtifactId);
        if (!csvArtifact) {
            Logger.error(`CSV artifact ${task.props.csvArtifactId} not found`);
            return;
        }

        // Parse the CSV
        const rows: any[] = [];
        const parser = parse(csvArtifact.content.toString(), {
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

        // Add status column if it doesn't exist
        const headers = Object.keys(rows[0] || {});
        if (!headers.includes('Status')) {
            headers.push('Status');
        }

        // Update the row status
        const rowIndex = task.props.rowIndex;
        if (rowIndex >= 0 && rowIndex < rows.length) {
            rows[rowIndex].Status = task.status;
        }

        // Generate status update as a string
        let statusUpdate = '';
        const stringifier = stringify(rows, {
            header: true,
            columns: headers
        });
        
        // Collect the stream output
        for await (const chunk of stringifier) {
            statusUpdate += chunk;
        }

        // Update the progress message with CSV in code block
        const progressMessage = `Processing CSV ${csvArtifact.metadata?.title || ''}:\n` +
            `Completed ${rows.filter(r => r.Status === TaskStatus.Completed).length} of ${rows.length} rows\n\n` +
            `Current status:\n\`\`\`csv\n${statusUpdate}\n\`\`\``;

        // If we have a partial post ID, update the progress message
        if (task.props?.partialPostId) {
            await this.chatClient.updatePost(task.props.partialPostId, progressMessage, {
                partial: true
            });
        }

        // Update the task description with the current status
        await this.taskManager.updateTask(task.id, {
            description: `Current status:\n${statusUpdate}`
        });
    }
}
