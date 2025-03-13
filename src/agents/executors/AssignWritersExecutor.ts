import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor, TaskNotification } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { ReplanType, StepResponse, StepResult, StepResultType } from '../interfaces/StepResult';
import { BaseStepExecutor } from '../interfaces/BaseStepExecutor';
import { TaskEventType } from '../agents';
import { StepTask } from '../interfaces/ExecuteStepParams';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ILLMService } from '../../llm/ILLMService';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { Project, ProjectMetadata, Task, TaskManager, TaskType } from 'src/tools/taskManager';
import Logger from 'src/helpers/logger';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import { WritingResponse } from '../../schemas/writing';
import { ExecutorType } from '../interfaces/ExecutorType';
import { TaskCategories } from '../interfaces/taskCategories';
import { createUUID } from 'src/types/uuid';

/**
 * Executor that manages content writing task assignments and coordination.
 * Key capabilities:
 * - Breaks down content outlines into assignable sections
 * - Creates structured writing tasks with clear objectives
 * - Assigns tasks to appropriate content writers
 * - Tracks task dependencies and sequencing
 * - Provides section-specific context and requirements
 * - Manages writing project workflow
 * - Coordinates multiple writer contributions
 * - Ensures consistent content style
 * - Preserves research context in assignments
 * - Maintains project-wide content strategy
 */
@StepExecutorDecorator(ExecutorType.WRITING, 'Take an existing outline and break out sections to writers.')
export class AssignWritersExecutor extends BaseStepExecutor<StepResponse> {
    private modelHelpers: ModelHelpers;
    private taskManager: TaskManager;

    constructor(params: ExecutorConstructorParams) {
        super(params);
        this.modelHelpers = params.modelHelpers;
        this.taskManager = params.taskManager!;
    }

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        const schema = await getGeneratedSchema(SchemaType.WritingResponse);

        const prompt = `You are planning content writing tasks.
Break down the content into sections that can be assigned to writers.
For each section, provide a clear title, description, key points to cover, and relevant research findings.

${params.previousResponses ? `Use these materials to inform the task planning:\n${JSON.stringify(params.previousResponses, null, 2)}` : ''}`;

        const instructions = new StructuredOutputPrompt(schema, prompt);
        const result = await this.modelHelpers.generate<WritingResponse>({
            message: params.goal,
            instructions
        });

        // Create a new project and writing tasks for each section
        try {
            const newProjectId = this.taskManager.newProjectId();
            
            const writingProject = await this.taskManager.addProject({
                id: newProjectId,
                name: `Writing project: ${params.goal}`,
                tasks: {},
                metadata: {
                    owner: params.agentId,
                    description: params.goal,
                    parentTaskId: params.stepId
                }
            });

            for (const section of result.sections) {
                const task = await this.taskManager.addTask(writingProject, {
                    id: createUUID(),
                    creator: params.agentId,
                    type: TaskType.Standard,
                    category: TaskCategories.Writing,
                    description: `Write a section for the overall document.

OVERALL GOAL:
${params.overallGoal||params.goal}.

OVERALL OUTLINE:
${result.sections.map(s => `- ${s.title}`).join('\n')}

SECTION HEADRR:
${section.title}

SECTION DESCRIPTION
${section.description}

KEY POINTS TO COVER IN YOUR SECTION:
${section.keyPoints?.map(p => `- ${p}`).join('\n')||"None provided"}

RESEARCH TO SUPPORT YOUR SECTION:
${section.researchFindings?.map(f => `- ${f.finding}\n  Source: ${f.source}`).join('\n')||"None provided"}`,
                    order: result.sections.indexOf(section),
                    props: {
                        attachedArtifactIds: params.context?.artifacts?.map(a => a.id)
                    }
                });

                //TODO: need to find way to get other user id
                await this.taskManager.assignTaskToAgent(task.id, "66025743-45bc-4625-a27f-52aa09dde128");
            }

            return {
                type: StepResultType.Delegation,
                finished: false,
                async: true,
                projectId: writingProject.id,
                response: {
                    message: `Created ${result.sections.length} writing tasks:\n\n${
                        result.sections.map(s => `- ${s.title}`).join('\n')
                    }`,
                    data: result
                }
            };
        } catch (error) {
            Logger.error('Error creating writing tasks:', error);
            throw error;
        }
    }

    async processTaskResult(params: Partial<ExecuteParams>, task: Task): Promise<any> {
        if (task.status !== TaskStatus.Completed) {
            return null;
        }

        // Get the task's response data
        const responseData = task.props?.result || {};
        
        // Create schema for result extraction
        const schema = await getGeneratedSchema(SchemaType.WritingResponse);

        // Create prompt for result processing
        const instructions = this.startModel(params, "processTaskResult");
        instructions.addInstruction(`Analyze the completed writing task and extract key insights that should be included in the final document.
            The original goal for this section was: ${task.description}
            
            Return the structured writing response with any additional insights or improvements.`);
        instructions.addOutputInstructions({outputType: OutputType.JSON, schema});

        const rawResponse = await instructions.generate({
            message: `Task Response Data: ${JSON.stringify(responseData, null, 2)}`
        });

        try {
            const response = StringUtils.extractAndParseJsonBlock(rawResponse.message, schema);
            return {
                section: response,
                traceId: rawResponse.metadata?._id
            };
        } catch (error) {
            Logger.error('Error processing writing task result:', error);
            return null;
        }
    }

    async onChildProjectComplete(stepTask: StepTask<StepResponse>, project: Project): Promise<StepResult<StepResponse>> {
        // Get all completed writing tasks
        const completedTasks = Object.values(project.tasks).filter(t => t.status === TaskStatus.Completed);
        
        // Process each task's result
        const processedResults = await Promise.all(
            completedTasks.map(task => this.processTaskResult({
                step: ExecutorType.WRITING,
                agentId: this.params.userId,
                goal: task.description
            }, task))
        );

        // Generate final document structure
        const finalDocument = {
            sections: processedResults.filter(r => r !== null).map(r => r.section)
        };

        // Generate a summary using the LLM
        const prompt = this.modelHelpers.createPrompt();
        prompt.addInstruction(`Explain that the writing project is complete in a concise chat message including
            statistics about the results (sections completed, total word count, etc)`);

        prompt.addContext({
            contentType: ContentType.TASKS,
            tasks: completedTasks
        });

        const rawResponse = await this.modelHelpers.generateMessage({
            message: `Writing project ID: ${project.id}`,
            instructions: prompt
        });

        return {
            type: StepResultType.FinalResponse,
            finished: true,
            async: false,
            replan: ReplanType.Allow,
            response: {
                message: rawResponse.message,
                data: finalDocument
            }
        };
    }

    async handleTaskNotification(notification: TaskNotification): Promise<void> {
        const { task, childTask, eventType, statusPost } = notification;
        
        // Cancel all child tasks if we get a cancellation
        if (eventType === TaskEventType.Cancelled && task.props?.childProjectId) {
            const project = this.taskManager.getProject(task.props?.childProjectId);
            if (project) {
                const taskList = Object.keys(project.tasks);
                for (const taskId of taskList) {
                    if (project.tasks[taskId].status !== TaskStatus.Cancelled) {
                        await this.taskManager.cancelTask(taskId);
                    }
                }
            }
            return;
        }

        // Update progress when tasks complete
        if (statusPost && task.props?.childProjectId) {
            const project = this.taskManager.getProject(task.props?.childProjectId);
            if (project) {
                const completedCount = Object.values(project.tasks).filter(t => t.status === TaskStatus.Completed).length;
                const totalCount = Object.keys(project.tasks).length;

                const progressMessage = `Writing progress:\n` +
                    `Completed ${completedCount} of ${totalCount} sections\n\n` +
                    `A final document will be generated when all sections are complete.`;

                await this.chatClient.updatePost(statusPost.id, progressMessage, {
                    partial: true
                });
            }
        }
    }
}
