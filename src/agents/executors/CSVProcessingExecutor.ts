import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor, TaskNotification } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResponse, StepResult, StepResultType } from '../interfaces/StepResult';
import { JSONSchema, StructuredOutputPrompt } from "../../llm/ILLMService";
import { ModelHelpers } from '../../llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { Task, TaskManager, TaskType } from '../../tools/taskManager';
import Logger from '../../helpers/logger';
import { createUUID } from 'src/types/uuid';
import { Agent, TaskEventType } from '../agents';
import { ContentType, OutputType } from 'src/llm/promptBuilder';
import { Artifact, ArtifactType } from '../../tools/artifact';
import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import { stringify } from 'csv-stringify/sync';
import { ArtifactManager } from 'src/tools/artifactManager';
import { ExecutorType } from '../interfaces/ExecutorType';
import { ModelMessageResponse } from 'src/schemas/ModelResponse';
import { StringUtils } from 'src/utils/StringUtils';
import { ChatClient } from 'src/chat/chatClient';
import { TaskStatus } from 'src/schemas/TaskStatus';
import { StepBasedAgent } from '../stepBasedAgent';
import { StepTask } from '../interfaces/ExecuteStepParams';

@StepExecutorDecorator(ExecutorType.CSV_PROCESSOR, 'Process each row of a CSV spreadsheet')
export class CSVProcessingExecutor implements StepExecutor<StepResponse> {
    private modelHelpers: ModelHelpers;
    private taskManager: TaskManager;
    private artifactManager: ArtifactManager;
    private chatClient: ChatClient;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;
        this.taskManager = params.taskManager!;
        this.artifactManager = params.artifactManager!;
        this.chatClient = params.chatClient;
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
            const content = artifact.content.toString();
            const parser = parse(content, {
                columns: true,
                skip_empty_lines: true,
                trim: true,
                relax_quotes: true,
                relax_column_count: true,
                bom: true
            });
            
            // Get headers from first row
            const firstRow = parse(content, {
                columns: true,
                skip_empty_lines: true,
                trim: true,
                relax_quotes: true,
                relax_column_count: true,
                bom: true,
                to_line: 1
            })[0];
            
            const headers = Object.keys(firstRow || {});
            
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
        const supportedAgents = [{...params.self, messagingHandle: "@self"} as Agent, ...params.agents?.filter(a => a.supportsDelegation)??[]].filter(a => a !== undefined);

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
            - taskDescription: A description of the specific task to perform on the provided row of data. Make sure the task description supplies any broader business context. Do not explain that you are working on a spreadsheet (this can cause the task to think it should process the entire spreadsheet again). The task will be provided with the field and values of the particular row.
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

            // Initialize processed CSV
            await this.initializeProcessedCSV(csvArtifact);

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
                    description: `This task has been initiated from a csv-processor step. Your goal is to process a single row of the spreadsheet that is provided in DATA. Processing Context: ${taskDescription} DATA: ${taskData}`,
                    creator: params.agentId,
                    type: TaskType.Standard,
                    props: {
                        rowIndex: i,
                        csvArtifactId: csvArtifact.id,
                        originalRowData: {
                            ...row.data,
                            __taskId: taskId // Store task ID with row data
                        },
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
                    message,
                    data: {
                        csvArtifactId: csvArtifact.id
                    }
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

    private processedArtifact: Artifact | null = null;

    async initializeProcessedCSV(originalArtifact: Artifact): Promise<void> {
        if (originalArtifact.type !== ArtifactType.Spreadsheet) {
            throw new Error('Can only process spreadsheet artifacts');
        }

        // Create initial processed artifact
        this.processedArtifact = {
            ...originalArtifact,
            id: createUUID(),
            metadata: {
                ...originalArtifact.metadata,
                title: `${originalArtifact.metadata?.title || 'processed'} - Processing ${new Date().toISOString().split('T')[0]}`,
                originalArtifactId: originalArtifact.id,
                processingStartedAt: new Date().toISOString()
            },
            content: originalArtifact.content // Start with original content
        };

        await this.artifactManager.saveArtifact(this.processedArtifact);
    }

    async updateCSVWithResults(originalArtifact: Artifact, results: any[]): Promise<void> {
        if (!this.processedArtifact) {
            await this.initializeProcessedCSV(originalArtifact);
        }

        if (!this.processedArtifact) {
            throw new Error('Processed CSV artifact not initialized');
        }

        // Read current processed CSV
        const rows: any[] = [];
        const parser = parse(this.processedArtifact.content.toString(), {
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

        // Merge results with existing rows
        for (const result of results) {
            const rowIndex = result.rowIndex;
            if (rowIndex >= 0 && rowIndex < rows.length) {
                // Add new columns while preserving existing data
                rows[rowIndex] = { 
                    ...rows[rowIndex], 
                    ...result.data,
                    __processedAt: new Date().toISOString() 
                };
            }
        }

        // Update the processed artifact
        const output = stringify(rows, { header: true });
        this.processedArtifact = {
            ...this.processedArtifact,
            content: output,
            metadata: {
                ...this.processedArtifact.metadata,
                lastUpdatedAt: new Date().toISOString()
            }
        };

        await this.artifactManager.saveArtifact(this.processedArtifact);
    }

    private async processTaskResult(task: Task): Promise<any[]> {
        if (task.status !== TaskStatus.Completed) {
            return [];
        }

        // Get the original goal from the parent task
        const project = this.taskManager.getProject(task.projectId);
        const parentTask = project?.metadata?.parentTaskId 
            ? this.taskManager.getTaskById(project.metadata.parentTaskId)
            : null;
        const originalGoal = parentTask?.description || '';

        // Get CSV headers from the artifact
        let csvHeaders: string[] = [];
        const csvArtifactId = task.props?.csvArtifactId;
        if (csvArtifactId) {
            try {
                const csvArtifact = await this.artifactManager.loadArtifact(csvArtifactId);
                if (csvArtifact) {
                    // Parse just the first row to get headers
                    const firstRow = parse(csvArtifact.content.toString(), {
                        columns: true,
                        skip_empty_lines: true,
                        trim: true,
                        relax_quotes: true,
                        relax_column_count: true,
                        bom: true,
                        to_line: 1
                    })[0];
                    csvHeaders = Object.keys(firstRow || {});
                }
            } catch (error) {
                Logger.error('Error reading CSV headers:', error);
            }
        }

        // Create schema for result extraction
        const schema: JSONSchema = {
            type: 'object',
            properties: {
                columns: { 
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string', required: true },
                            value: { type: 'string', required: true }
                        },
                        required: ['name', 'value']
                    }
                },
                required: ['columns']
            }
        };

        // Create prompt for result processing
        const prompt = this.modelHelpers.createPrompt();
        prompt.addInstruction(`Analyze the completed tasks and extract key insights that should be added as new columns in the CSV file.
            The original goal for this project was: ${originalGoal}
            
            The CSV file currently has these columns: ${csvHeaders.join(', ')}
            
            For each task, identify the most relevant data points that should be preserved in the spreadsheet.
            Pay special attention to any specific columns or data types mentioned in the original goal.
            Consider how the new columns will relate to the existing ones.
            
            'columns' key: Return an array of key value pairs to add as new columns
            
            To add a link to a created artifact, use a Markdown link with the link format of [Title](artifactId:XXXX-XXXX)

            `);
        prompt.addOutputInstructions(OutputType.JSON_WITH_MESSAGE, schema);

        // Get the task's response data
        const responseData = task.props?.result || {};
        
        const rawResponse = await this.modelHelpers.generate<ModelMessageResponse>({
            message: `Task Description: ${task.description}\n\nTask Response Data: ${JSON.stringify(responseData, null, 2)}`,
            instructions: prompt
        });

        try {
            const response = StringUtils.extractAndParseJsonBlock(rawResponse.message);
            if (response && Array.isArray(response.columns)) {
                return [{
                    rowIndex: task.props?.rowIndex,
                    data: response.columns.reduce((acc, insight) => {
                        acc[insight.name] = insight.value;
                        return acc;
                    }, {
                        rowIndex: task.props?.rowIndex
                    })
                }];
            }
        } catch (error) {
            Logger.error('Error processing task result:', error);
        }

        return [];
    }

    async handleTaskNotification(notification: TaskNotification): Promise<void> {
        const { task, childTask, eventType, statusPost } = notification;
        const artifactId = (task as StepTask<StepResponse>).props.result?.response.data?.csvArtifactId;

        // Load the CSV artifact once
        const csvArtifact = await this.artifactManager.loadArtifact(artifactId);
        if (!csvArtifact) {
            Logger.error(`CSV artifact ${artifactId} not found`);
            return;
        }

        // Process results when a task completes
        if (eventType === TaskEventType.Completed && childTask) {
            const results = await this.processTaskResult(childTask);
            if (results.length > 0) {
                await this.updateCSVWithResults(csvArtifact, results);
            }
        }


        if (artifactId && statusPost && task.props?.childProjectId) {            

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

            // Get all tasks in the child project
            const project = this.taskManager.getProject(task.props?.childProjectId);
            if (project) {
                // Create a map of rowIndex to task status
                const rowStatusMap = new Map<number, TaskStatus>();
                
                // Find all tasks that have a rowIndex
                for (const task of Object.values(project.tasks)) {
                    if (typeof task.props?.rowIndex === 'number') {
                        rowStatusMap.set(task.props.rowIndex, task.status);
                    }
                }

                // Update status for all rows based on their tasks
                for (let i = 0; i < rows.length; i++) {
                    if (rowStatusMap.has(i)) {
                        rows[i].Status = rowStatusMap.get(i);
                    }
                }
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
                `Current status preview:\n\`\`\`csv\n${statusUpdate}\n\`\`\`\n` +
                `A new processed CSV will be created when all rows are complete.`;

            // If we have a partial post ID, update the progress message
            await this.chatClient.updatePost(statusPost.id, progressMessage, {
                partial: true
            });
        }
    }
}
