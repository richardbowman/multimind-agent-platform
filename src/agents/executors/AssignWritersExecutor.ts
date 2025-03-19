import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { BaseStepExecutor, TaskNotification } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { ReplanType, StepResponse, StepResponseType, StepResult, StepResultType } from '../interfaces/StepResult';
import { TaskEventType } from "../../shared/TaskEventType";
import { StepTask } from '../interfaces/ExecuteStepParams';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { Project, Task, TaskManager, TaskType } from 'src/tools/taskManager';
import Logger from 'src/helpers/logger';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import { WritingSection } from '../../schemas/writing';
import { ExecutorType } from '../interfaces/ExecutorType';
import { TaskCategories } from '../interfaces/taskCategories';
import { TaskStatus } from 'src/schemas/TaskStatus';
import { ContentType, globalRegistry, OutputType } from 'src/llm/promptBuilder';
import { StringUtils } from 'src/utils/StringUtils';
import { UUID } from 'src/types/uuid';
import { ArtifactType, DocumentSubtype } from 'src/tools/artifact';

export interface DraftContentStepResponse extends StepResponse {
    type: StepResponseType.DraftContent,
    data?: {
        sections: SectionResponse[]
    }
}

export interface SectionResponse {
    sectionGoal: string;
    sectionOutput: {
        status?: string;
        artifactIds?: UUID[];
    }
}

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

        globalRegistry.stepResponseRenderers.set(StepResponseType.DraftContent, (stepResponse) => {
            return stepResponse.data?.sections && JSON.stringify(stepResponse.data?.sections, null, 2);
        });
    }

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        const schema = await getGeneratedSchema(SchemaType.WritingSection);

        const instructions = this.startModel(params);
        instructions.addInstruction(`You are planning content writing tasks.
Break down the content into sections that can be assigned to writers.
For each section, provide a clear title, description, key points to cover, and relevant research findings.`);
        instructions.addContext({contentType: ContentType.GOALS_FULL, params});
        params.previousResponses && instructions.addContext({contentType: ContentType.STEP_RESPONSE, responses:params.previousResponses});

        // Get procedure guides already in use from previous responses
        const pastGuideIds = params.previousResponses?.flatMap(response => 
            response.data?.steps?.flatMap(step => 
                step.procedureGuide?.artifactId ? [step.procedureGuide.artifactId] : []
            ) || []
        ) || [];
        
        // Get procedure guides from search, excluding any already in use
        const searchedGuides = (await this.params.artifactManager.searchArtifacts(
            params.stepGoal, 
            { 
                type: ArtifactType.Document, 
                subtype: DocumentSubtype.Procedure 
            }, 
            3 + pastGuideIds.length // Get extra in case we need to filter some out
        )).filter(guide => !pastGuideIds.includes(guide.artifact.id))
          .slice(0, 3); // Take top 3 after filtering
        
        // Load all guides in a single bulk operation
        const allGuides = await this.params.artifactManager.bulkLoadArtifacts([
            ...searchedGuides.map(p => p.artifact.id),
            ...pastGuideIds
        ]);
        
        // Filter by agent if specified
        const procedureGuides = this.params.agentName ? 
            allGuides.filter(a => a.metadata?.agent === this.params.agentName) : 
            allGuides;
            
        // Format searched guides for prompt
        const filtered = searchedGuides.filter(g => procedureGuides.find(p => p.id === g.artifact.id));
        instructions.addContext({contentType: ContentType.PROCEDURE_GUIDES, guideType: "searched", guides: filtered.map(f => procedureGuides.find(p => p.id === f.artifact.id)).filter(f => !!f)});
        instructions.addContext({contentType: ContentType.PROCEDURE_GUIDES, guideType: "in-use", guides: pastGuideIds.map(f => procedureGuides.find(p => p.id === f)).filter(f => !!f)});
        
        instructions.addOutputInstructions({outputType: OutputType.MULTIPLE_JSON_WITH_MESSAGE, schema, specialInstructions: "Create a single fenced code block for EACH indepedent section to assign to a writer."});

        const rawResult = await instructions.generate({
            message: params.message||params.stepGoal
        });

        const sections = StringUtils.extractAndParseJsonBlocks(rawResult.message).map(json => StringUtils.mapToTyped<WritingSection>(json, schema));

        // Create a new project and writing tasks for each section
        try {
            const newProjectId = this.taskManager.newProjectId();
            
            const writingProject = await this.taskManager.addProject({
                id: newProjectId,
                name: `Writing project: ${params.stepGoal}`,
                tasks: {},
                metadata: {
                    owner: params.agentId,
                    description: params.goal,
                    parentTaskId: params.stepId
                }
            });

            for (const section of sections) {
                const index = sections.indexOf(section);
                const task = await this.taskManager.addTask(writingProject, {
                    creator: params.agentId,
                    type: TaskType.Standard,
                    category: TaskCategories.Writing,
                    description: `TASK GOAL: ${section.taskGoal}
# YOUR SECTION HEADER (SECTION ${index+1} OF ${sections.length}):
${section.title}

# YOUR SECTION DESCRIPTION
${section.description}

# INSTRUCTIONS:
${section.instructions?.map(p => `- ${p}`).join('\n')||"None provided"}

# BROADER OVERALL CONTEXT (OUTSIDE OF SCOPE OF THIS TASK):
${params.overallGoal||params.goal}.

# OVERALL OUTLINE (JUST FOR CONTEXT ON YOUR SECTION):
${sections.map((s, i) => `${i+1} of ${sections.length}: ${s.title}${i === index ? "[YOUR SECTION]" : ""}`).join('\n')}`,
                    props: {
                        order: index,
                        attachedArtifactIds: params.context?.artifacts?.map(a => a.id)
                    }
                });

                const writer = params.agents.find(a => a.messagingHandle === "@writer")?.userId;
                writer && await this.taskManager.assignTaskToAgent(task.id, writer);
            }

            return {
                type: StepResultType.Delegation,
                finished: false,
                async: true,
                projectId: writingProject.id,
                response: {
                    message: `Created ${sections.length} writing tasks:\n\n${
                        sections.map(s => `- ${s.title}`).join('\n')
                    }`,
                    data: sections
                }
            };
        } catch (error) {
            Logger.error('Error creating writing tasks:', error);
            throw error;
        }
    }

    async processTaskResult(params: Partial<ExecuteParams>, task: Task): Promise<SectionResponse> {
        if (task.status !== TaskStatus.Completed) {
            return null;
        }

        // Get the task's response data
        const responseData = task.props?.result || {};
        
        // Create schema for result extraction
        const schema = await getGeneratedSchema(SchemaType.WritingResponse);

        try {
            return {
                sectionGoal: task.description,
                sectionOutput: {
                    status: responseData.response.message,
                    artifactIds: responseData.artifactIds?.filter(item => !task.props?.attachedArtifactIds?.includes(item))
                }
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
            sections: processedResults.filter(r => r !== null)
        };

        // Get section artifacts
        const artifacts = finalDocument.sections.map(s => s.sectionOutput.artifactIds).flat().filter(a => !!a);

        // Generate a summary using the LLM
        const prompt = this.modelHelpers.createPrompt();
        prompt.addInstruction(`Explain that the writers finished their sections in a concise status message for the agent including
statistics about the results (sections completed, total word count, etc). The final combined document has not been created, 
a separate combining step is required.`);

        prompt.addContext({
            contentType: ContentType.TASKS,
            tasks: completedTasks
        });

        const rawResponse = await this.modelHelpers.generateMessage({
            message: `Section results created: ${JSON.stringify(finalDocument, null, 2)}`,
            instructions: prompt
        });

        return {
            finished: true,
            async: false,
            replan: ReplanType.Allow,
            artifactIds: artifacts,
            response: {
                type: StepResponseType.DraftContent,
                status: rawResponse.message,
                data: finalDocument
            }
        };
    }

    async handleTaskNotification(notification: TaskNotification): Promise<void> {
        const { task, childTask, eventType, statusPost } = notification;
        
        // Cancel all child tasks if we get a cancellation
        if (eventType === TaskEventType.Cancelled && task.props?.childProjectId) {
            const project = await this.taskManager.getProject(task.props?.childProjectId);
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
            const project = await this.taskManager.getProject(task.props?.childProjectId);
            if (project) {
                const completedCount = Object.values(project.tasks).filter(t => t.status === TaskStatus.Completed).length;
                const totalCount = Object.keys(project.tasks).length;

                const progressMessage = `Writing progress:\n` +
                    `Completed ${completedCount} of ${totalCount} sections\n\n` +
                    `A final document will be generated when all sections are complete.`;

                await this.params.chatClient.updatePost(statusPost.id, progressMessage, {
                    partial: true
                });
            }
        }
    }
}
