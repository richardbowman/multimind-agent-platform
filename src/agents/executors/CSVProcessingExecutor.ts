import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { TaskNotification } from '../interfaces/StepExecutor';
import { BaseStepExecutor } from '../interfaces/BaseStepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { ReplanType, StepResponse, StepResult, StepResultType } from '../interfaces/StepResult';
import { ModelHelpers } from '../../llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { Project, Task, TaskManager, TaskType } from '../../tools/taskManager';
import Logger from '../../helpers/logger';
import { asUUID, createUUID, UUID } from 'src/types/uuid';
import { Agent } from '../agents';
import { TaskEventType } from "../../shared/TaskEventType";
import { ContentType, OutputType } from 'src/llm/promptBuilder';
import { Artifact, ArtifactType, SpreadsheetSubType } from '../../tools/artifact';
import { CSVUtils } from 'src/utils/CSVUtils';
import { ArtifactManager } from 'src/tools/artifactManager';
import { ExecutorType } from '../interfaces/ExecutorType';
import { StringUtils } from 'src/utils/StringUtils';
import { ChatClient } from 'src/chat/chatClient';
import { TaskStatus } from 'src/schemas/TaskStatus';
import { StepTask } from '../interfaces/ExecuteStepParams';
import { response } from 'express';
import { getGeneratedSchema } from 'src/helpers/schemaUtils';
import { SchemaType } from 'src/schemas/SchemaTypes';
import { CSVProcessingResponse, ExtractColumnsResponse } from 'src/schemas/CSVProcessingSchema';
import { RetryError, withRetry } from 'src/helpers/retry';

interface CSVProcessingStepResponse extends StepResponse {
    data?: {
        csvArtifactId?: UUID;
        processedArtifactId?: UUID;
    }
}

@StepExecutorDecorator(ExecutorType.CSV_PROCESSOR, 'Start task for each row in CSV spreadsheet and add new result columns')
export class CSVProcessingExecutor extends BaseStepExecutor<CSVProcessingStepResponse> {
    private modelHelpers: ModelHelpers;
    private taskManager: TaskManager;
    private artifactManager: ArtifactManager;
    private chatClient: ChatClient;

    constructor(params: ExecutorConstructorParams) {
        super(params);
        this.modelHelpers = params.modelHelpers;
        this.taskManager = params.taskManager!;
        this.artifactManager = params.artifactManager!;
        this.chatClient = params.chatClient;
    }

    async execute(params: ExecuteParams): Promise<StepResult<CSVProcessingStepResponse>> {
        const schema = await getGeneratedSchema(SchemaType.CSVProcessingResponse);

        // Find the first CSV artifact
        const csvArtifact = params.context?.artifacts?.find(a => a.type === ArtifactType.Spreadsheet && a.metadata?.subtype !== SpreadsheetSubType.EvaluationCriteria && a.metadata?.subtype !== SpreadsheetSubType.Template);
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
            const csv = await CSVUtils.fromCSV(content);
            rows.push(...csv.rows);
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

        // Get CSV headers from the artifact
        let csvHeaders: string[] = [];
        try {
            if (csvArtifact) {
                // Parse just the first row to get headers
                const firstRow = CSVUtils.getColumnHeaders(csvArtifact.content.toString());
                csvHeaders = firstRow;
            }
        } catch (error) {
            Logger.error('Error reading CSV headers:', error);
        }

                
        // Create prompt for agent selection
        const instructions = this.startModel(params);
        instructions.addInstruction(`Select the most appropriate agent to perform processing on the data in the spreadsheet for the desired goal.
            The CSV contains ${rows.length} rows of data and contains these columns: ${csvHeaders.join(", ")}.
            Consider the agents' capabilities and the nature of the data when making your selection.
            JSON Output should include:
            - projectName: A short overall project name
            - taskDescription: A description of the specific task to perform on the provided row of data. Make sure the task description supplies any broader business context. Do not explain that you are working on a spreadsheet (this can cause the task to think it should process the entire spreadsheet again). The task will be provided with the field and values of the particular row.
                each specific row.
                Your description might start with "The overall goals is ... For the provided data, generate..."
            - assignedAgent: The handle of the selected agent
            - resultColumns: An explanation of the columns you want filled by the task

            Also respond with a message explaining the selection to the user.`);
        
        if (supportedAgents) {
            instructions.addContext({
                contentType: ContentType.AGENT_OVERVIEWS, 
                agents: supportedAgents
            });
        }

        instructions.addOutputInstructions({outputType: OutputType.JSON_WITH_MESSAGE, schema});

        try {
            const rawResponse = await instructions.generate({
                message: params.stepGoal
            });

            const responseJSON = StringUtils.extractAndParseJsonBlock<CSVProcessingResponse>(rawResponse.message, schema);
            const message = StringUtils.extractNonCodeContent(rawResponse.message);

            const { projectName, taskDescription, assignedAgent: selectedAgentHandle, resultColumns } = responseJSON;

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

            // Initialize processed CSV
            const processedArtifact = await this.initializeProcessedCSV(csvArtifact);
            
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
                
                // Create task description with headers
                const taskData = `The data from row ${i + 1} from ${csvArtifact.metadata?.title || 'CSV file'}:\n` +
                    Object.keys(row).map((header: string) => 
                        `${header}: ${row[header] || ''}`
                    ).join('\n');

                // Scan row data for artifact links
                const artifactLinks = Object.values(row).flatMap(value => {
                    if (typeof value === 'string') {
                        const matches = value.match(/\/artifact\/([a-f0-9-]{36})/gi);
                        return matches ? matches.map(m => asUUID(m.split('/')[2])) : [];
                    }
                    return [];
                });

                const { id: taskId } = await this.taskManager.addTask(project, {
                    description: `This task has been initiated from a csv-processor step. Your goal is to process a single row of data. Processing Context: ${taskDescription}. Data: ${taskData}`,
                    creator: params.agentId,
                    type: TaskType.Standard,
                    props: {
                        rowIndex: i,
                        csvArtifactId: csvArtifact.id,
                        processedArtifactId: processedArtifact.id,
                        rowData: row,
                        resultColumns: resultColumns,
                        attachedArtifactIds: [
                            // Exclude spreadsheets other than eval criteria/templates
                            ...(params.context?.artifacts
                                ?.filter(a => a.type !== ArtifactType.Spreadsheet ||  (a.metadata?.subtype === SpreadsheetSubType.EvaluationCriteria || a.metadata?.subtype === SpreadsheetSubType.Template))
                                .map(a => a.id) || []),
                            ...artifactLinks
                        ]
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
                artifactIds: [processedArtifact.id],
                response: {
                    status: message,
                    data: {
                        csvArtifactId: csvArtifact.id,
                        processedArtifactId: processedArtifact.id
                    }
                }
            };

        } catch (error) {
            Logger.error('Error in CSVProcessingExecutor:', error);
            return {
                type: StepResultType.Delegation,
                finished: true,
                response: {
                    status: 'Failed to create the CSV processing project. Please try again later.'
                }
            };
        }
    }

    async initializeProcessedCSV(originalArtifact: Artifact): Promise<Artifact> {
        if (originalArtifact.type !== ArtifactType.Spreadsheet) {
            throw new Error('Can only process spreadsheet artifacts');
        }

        // Create initial processed artifact
        const processedArtifact = {
            type: originalArtifact.type,
            metadata: {
                ...originalArtifact.metadata,
                title: `${originalArtifact.metadata?.title || 'processed'} - Processing ${new Date().toISOString().split('T')[0]}`,
                originalArtifactId: originalArtifact.id,
                processingStartedAt: new Date().toISOString()
            },
            content: originalArtifact.content // Start with original content
        };

        const savedArtifact = await this.artifactManager.saveArtifact(processedArtifact, {index: false, summarize: false});
        return savedArtifact;
    }

    async updateCSVWithResults(currentContent: string, result: any): Promise<string> {
        const csv = await CSVUtils.fromCSV(currentContent);

        // Merge results with existing rows
        const rowIndex = result.rowIndex;
        if (rowIndex >= 0 && rowIndex < csv.rows.length) {
            // Add new columns while preserving existing data
            csv.rows[rowIndex] = { 
                ...csv.rows[rowIndex], 
                ...result.data,
                __processedAt: new Date().toISOString() 
            };
        }

        return CSVUtils.toCSV(csv);
    }

    private async processTaskResult(params: Partial<ExecuteParams>, task: Task, csvArtifact: Artifact): Promise<any> {
        if (task.status !== TaskStatus.Completed) {
            return [];
        }

        // Get the original goal from the parent task
        const project = await this.taskManager.getProject(task.projectId);
        const parentTask = project?.metadata?.parentTaskId 
            ? await this.taskManager.getTaskById(project.metadata.parentTaskId)
            : null;
        const originalGoal = parentTask?.description || '';

        // Use the predefined schema for result extraction
        const schema = await getGeneratedSchema(SchemaType.ExtractColumnsResponse);

        // Create prompt for result processing
        const instructions = this.startModel(params, "processTaskResult");
        instructions.addInstruction(`Analyze the completed tasks and extract key insights that should be added as new columns in the CSV file.
The original goal for this project was: ${originalGoal}
            
You are expected to populate the following new result columns: 
${task?.props?.resultColumns?.map(c => ` - ${c.name}: ${c.description}`).join("\n")}
            `);
        instructions.addOutputInstructions({outputType: OutputType.JSON_WITH_MESSAGE, schema, specialInstructions: "'resultColumns' key: Return an array of key value pairs to add as new columns. To add a link to an artifact created by the tasks, use a Markdown link with the link format of [Title](/artifact/XXXX-XXXX)."});

        // Get the task's response data
        const responseData = task.props?.result || {};
        
        const artifacts = responseData.artifactIds && await this.artifactManager.bulkLoadArtifacts(responseData.artifactIds);
        artifacts && instructions.addContext({contentType: ContentType.ARTIFACTS_EXCERPTS, artifacts});

        try {
            const { response, message, traceId } = await withRetry(async () => {
                const rawResponse = await instructions.generate({
                    message: `Task Description: ${task.description}\n\nTask Response Data: ${responseData.response?.message}`
                });

                const response = StringUtils.extractAndParseJsonBlock<ExtractColumnsResponse>(rawResponse, schema);
                return {
                    response,
                    message: rawResponse.message,
                    traceId: rawResponse.metadata?._id
                }
            }, () => true, { timeoutMs: 180000, maxAttempts: 2 });

            if (response && Array.isArray(response.resultColumns)) {
                return {
                    rowIndex: task.props?.rowIndex,
                    data: response.resultColumns.reduce((acc, insight) => {
                        acc[insight.name] = insight.value;
                        return acc;
                    }, {} as Record<string, any>), // Initialize accumulator as empty object
                    artifacts: responseData.artifactIds,
                    traceId
                };
            }
        } catch (error) {
            Logger.error('Error processing task result:', error);
        }

        return {};
    }

    async onChildProjectComplete(stepTask: StepTask<CSVProcessingStepResponse>, project: Project): Promise<StepResult<CSVProcessingStepResponse>> {
        // Get the final processed CSV columns
        const artifactId = stepTask.props.result?.response.data?.processedArtifactId;
        const artifact = artifactId && await this.artifactManager.loadArtifact(artifactId);
        const processedContent = artifact && artifact.content.toString();

        if (!artifact || !processedContent) {
            const error = new Error("No artifact");
            Logger.error("No artifact could be found for child project completion.", error);
            throw error;
        }

        const csvData = CSVUtils.getSheet(processedContent);
        const csvColumns = Object.keys(csvData[0]);

        const processedRows = csvData.filter(c => c["__processedAt"] !== undefined);

        // Generate a summary using the LLM
        const prompt = this.modelHelpers.createPrompt();
        prompt.addInstruction(`Explain that the CSV processing project is complete in a concise chat message including
            statistics about the results of processing (new columns added, new artifacts created, etc)

            The final processed CSV contains these columns:
            ${csvColumns.map(col => `- ${col}`).join('\n')}`);

        prompt.addContext({
            contentType: ContentType.TASKS,
            tasks: Object.values(project.tasks).map(t => ({
                ...t,
                props: t.props && {
                    ...t.props,
                    response: {
                        ...t.props?.response,
                        result: {
                            message: t.props?.result?.response?.message||t.props?.result?.response?.status
                        }
                    }
                }
            }))
        });

        const rawResponse = await this.modelHelpers.generateMessage({
            message: `Processed CSV artifact ID: ${artifact.id}`,
            instructions: prompt
        });

        return {
            type: StepResultType.FinalResponse,
            finished: true,
            async: false,
            replan: ReplanType.Allow,
            artifactIds: [artifact?.id],
            response: {
                status: rawResponse.message,
                data: {
                    processedArtifactId: artifact?.id
                }
            }
        };
    }

    async handleTaskNotification(notification: TaskNotification): Promise<void> {
        const { task, childTask, eventType, statusPost } = notification;
        const artifactId = (task as StepTask<CSVProcessingStepResponse>).props.result?.response.data?.processedArtifactId;
        
        // Cancel all child tasks if we get a cancellation
        if (eventType === TaskEventType.Cancelled && task.props?.childProjectId) {
            const project = await this.taskManager.getProject(task.props?.childProjectId);
            if (project) {
                const taskList = Object.keys(project.tasks) as UUID[];
                for (const taskId of taskList) {
                    if (project.tasks[taskId].status !== TaskStatus.Cancelled) {
                        await this.taskManager.cancelTask(taskId);
                    }
                }
            }
            return;
        }

        // Load the CSV artifact once
        let csvArtifact = artifactId && await this.artifactManager.loadArtifact(artifactId);
        let newContent : string|undefined = undefined;

        if (!csvArtifact) {
            Logger.error(`CSV artifact ${artifactId} not found`);
            return;
        }
        
        if (artifactId && statusPost && task.props?.childProjectId) {            
            // Parse the CSV
            const headers = CSVUtils.getColumnHeaders(csvArtifact.content.toString())
            const { rows } = await CSVUtils.fromCSV(csvArtifact.content.toString());

            if (headers.indexOf('ID') == -1) {
                headers.unshift('ID');
                // Add IDs starting from 1
                rows.forEach((row, index) => {
                    row.ID = index + 1;
                });
            }

            // Add status column if it doesn't exist
            if (!headers.includes('Status')) {
                headers.push('Status');
            }

            // Get all tasks in the child project
            const project = await this.taskManager.getProject(task.props?.childProjectId);
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
                    // Ensure ID column is maintained
                    if (!rows[i].ID) {
                        rows[i].ID = i + 1;
                    }
                }
            }

            // Generate status update as a string
            const statusUpdate = await CSVUtils.toCSV({ rows, metadata: {} }, headers);

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

        // Process results when a task completes
        if (eventType === TaskEventType.Completed && childTask) {
            const result = await this.processTaskResult({
                step: ExecutorType.CSV_PROCESSOR,
                agentId: this.params.userId,
                goal: task.description
            }, childTask, csvArtifact);

            newContent = await this.updateCSVWithResults(newContent||csvArtifact.content.toString(), result);
        }

        if (newContent) {
            await this.artifactManager.saveArtifact({
                ...csvArtifact,
                content: newContent
            }, {index: false, summarize: false});
        }
    }
}
