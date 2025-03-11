import { NextActionResponse } from '../../schemas/NextActionResponse';
import { PlanStepsResponse } from '../../schemas/PlanStepsResponse';
import { AddTaskParams, Task, TaskType } from '../../tools/taskManager';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { TaskManager } from '../../tools/taskManager';
import Logger from '../../helpers/logger';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { ILLMService } from 'src/llm/ILLMService';
import { getGeneratedSchema } from 'src/helpers/schemaUtils';
import { SchemaType } from 'src/schemas/SchemaTypes';
import { EXECUTOR_METADATA_KEY, StepExecutorDecorator } from '../decorators/executorDecorator';
import { ChatClient } from 'src/chat/chatClient';
import { ContentType, OutputType } from 'src/llm/promptBuilder';
import { StepTask } from '../interfaces/ExecuteStepParams';
import { ModelType } from 'src/llm/LLMServiceFactory';
import { StepExecutor } from '../interfaces/StepExecutor';
import { ExecutorType } from '../interfaces/ExecutorType';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResponse, StepResponseType, StepResult } from '../interfaces/StepResult';
import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StringUtils } from 'src/utils/StringUtils';
import { ModelResponse } from 'src/schemas/ModelResponse';
import { ArtifactManager } from 'src/tools/artifactManager';
import { ArtifactType } from 'src/tools/artifact';

export type WithReasoning<T extends ModelResponse> = T & {
    reasoning?: string;
    message?: string;
};

@StepExecutorDecorator(ExecutorType.NEXT_STEP, 'Generate focused questions to understand user goals', false)
export class NextActionExecutor implements StepExecutor<StepResponse> {
    readonly allowReplan: boolean = false;
    readonly alwaysComplete: boolean = true;
    
    private llmService: ILLMService;
    private projects: TaskManager;
    private userId?: string;
    private modelHelpers: ModelHelpers;
    private stepExecutors: Map<string, StepExecutor<StepResponse>> = new Map();
    private chatClient: ChatClient;
    private artifactManager: ArtifactManager;
    private agentName?: string;

    constructor(params: ExecutorConstructorParams, stepExecutors: Map<string, StepExecutor<StepResponse>>) {
        this.llmService = params.llmService;
        this.projects = params.taskManager;
        this.userId = params.userId;
        this.modelHelpers = params.modelHelpers;
        this.stepExecutors = stepExecutors;
        this.chatClient = params.chatClient;
        this.artifactManager = params.artifactManager;
        this.agentName = params.agentName;
    }
    
    public async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        // Get channel data including any project goals
        const channelData = params.context?.channelId ? await this.chatClient.getChannelData(params.context?.channelId) : undefined;

        const agentList = params.agents?.filter(a => a?.userId !== this.userId);

        // Get agent descriptions from settings for channel members
        const agentOptions = (channelData?.members || [])
            .filter(memberId => this.userId !== memberId)
            .map(memberId => {
                return params.agents[memberId];
            });


        const executorMetadata = Array.from(this.stepExecutors.entries())
            .map(([key, executor]) => {
                const metadata = Reflect.getMetadata(EXECUTOR_METADATA_KEY, executor.constructor);
                return {
                    key,
                    description: metadata?.description || 'No description available',
                    planner: metadata?.planner !== false // Default to true if not specified
                };
            })
            .filter(metadata => metadata.planner); // Only include executors marked for planner

        const schema = await getGeneratedSchema(SchemaType.NextActionResponse);

        const project = this.projects.getProject(params.projectId);
        const tasks = project ? this.projects.getProjectTasks(project.id) : [];

        const formatCompletedTasks = (tasks: Task[]) => {
            return tasks.map(t => {
                const type = t.type === TaskType.Step ? `**Step Type**: ${(t as StepTask<StepResponse>).props.stepType}` : '**Task Type**: ${t.type}';
                return `- ${type}: ${t.description}`;
            }).join('\n');
        };

        const completedTasks = tasks.filter(t => t.complete);
        const currentTasks = tasks.filter(t => !t.complete);

        const completedSteps = completedTasks.length > 0 ?
            formatCompletedTasks(completedTasks) :
            `*No completed tasks yet*`;

        const stepDescriptions = executorMetadata
            .filter(metadata => metadata.planner)
            .map(({ key, description }) => `[${key}]: ${description}`)
            .join("\n");

        // Get all available sequences
        const sequences = this.modelHelpers.getStepSequences();

        const prompt = this.modelHelpers.createPrompt();
        prompt.addContext(ContentType.PURPOSE);
        prompt.addContext({ contentType: ContentType.INTENT, params })
        prompt.addContext({ contentType: ContentType.AGENT_OVERVIEWS, agents: agentList||[]});
        prompt.addContext({ contentType: ContentType.GOALS_FULL, params })

        params.context?.artifacts && prompt.addContext({ contentType: ContentType.ARTIFACTS_TITLES, artifacts: params.context?.artifacts });
        params.steps && prompt.addContext({contentType: ContentType.STEPS, steps: params.steps});

        // Search for relevant procedure guides
        const procedureGuideList = await this.artifactManager.searchArtifacts(params.stepGoal, { type: ArtifactType.ProcedureGuide }, 10);
        const allProcedureGuides = await this.artifactManager.bulkLoadArtifacts(procedureGuideList.map(p => p.artifact));
        const procedureGuides = this.agentName ? allProcedureGuides.filter(a => a.metadata?.agent === this.agentName) : allProcedureGuides;
        if (procedureGuides.length === 0) {
            Logger.warn(`No procedure guides found for agent ${this.agentName} ${params.agentId}`);
        }
        
        // Format procedure guides for prompt
        const guidesPrompt = procedureGuides.length > 0 ?
            `# RELEVANT PROCEDURE GUIDES:\n` +
            procedureGuideList.filter((guide, i) => i < 3).map((guide, i) => 
                `## Guide ${i+1} (${guide.score.toFixed(2)} relevance):\n` +
                `###: ${guide.artifact.metadata?.title}\n` +
                `<guide>${procedureGuides.find(p => p.id === guide.artifact.id)?.content}</guide>\n`
            ).join('\n\n') :
            `### RELEVANT PROCEDURE GUIDES:\n*No relevant procedure guides found*`;

        // const sequencesPrompt =     sequences.map((seq, i) => {
        //     const seqText = seq.getAllSteps().map((step, i) => `${i + 1}. [${step.type}]: ${step.description} ${(params.executionMode === 'conversation' && step.interaction) ?? ""}`).join("\n");
        //     return `### SEQUENCE ${i+1} of ${sequences.length}: ID: [${seq.getName()}] (${seq.getDescription()}):\n${seqText}`;
        // }).join('\n\n');

        // Add procedure guides to prompt
    prompt.addContext(guidesPrompt);
            
        // prompt.addInstruction(sequencesPrompt);

        prompt.addContext(`### AVAILABLE ACTION TYPES:\n${executorMetadata
            .filter(metadata => metadata.planner)
            .map(({ key, description }) => `[${key}]: ${description}`)
            .join("\n")}`);
        prompt.addInstruction(`
- IN YOUR REASONING, describe this process:
- Review the STEP HISTORY to see what you've already done, don't keep repeating your action.
- Review the user's message, and see if their goal has changed from the original intent. If so restate their new goal in the "revisedUserGoal" field.
- Explain each step and why it would or would not make sense to be the next action.
- Make sure you don't go into a loop, don't do the same action over and over again.
- If you have acheived the goal, set the Action Type to DONE.
- If you need to continue working, determine the next Action Type from the AVAILABLE ACTION TYPES to continue to achieve the goal.
- Consider the sequences for guidance on the order for steps to be successful. If you decide a sequence makes sense, use the 'sequence' field to share the ID.`);

        prompt.addContext({contentType: ContentType.FINAL_INSTRUCTIONS, instructions: this.modelHelpers.getFinalInstructions()||""});

        await prompt.addOutputInstructions(OutputType.JSON_WITH_MESSAGE_AND_REASONING, schema);

        // Try once more with the same prompt
        const responseText = await this.modelHelpers.generate({
            message: params.message||params.stepGoal,
            instructions: prompt,
            modelType: ModelType.ADVANCED_REASONING
        });

        let response: WithReasoning<NextActionResponse>;
         try {
             response = {
                 ...StringUtils.extractAndParseJsonBlock<NextActionResponse>(responseText.message, schema),
                 reasoning: StringUtils.extractXmlBlock(responseText.message, "thinking"),
                 message: StringUtils.extractNonCodeContent(responseText.message, ["thinking"])
             };
         } catch (error) {
             Logger.warn('Failed to parse initial response, retrying once...');

             // Try once more with the same prompt
             const retryResponseText = await this.modelHelpers.generate({
                 message: params.message||params.stepGoal,
                 instructions: prompt,
                 modelType: ModelType.ADVANCED_REASONING
             });

             response = {
                 ...StringUtils.extractAndParseJsonBlock<NextActionResponse>(retryResponseText.message, schema),
                 reasoning: StringUtils.extractXmlBlock(responseText.message, "thinking"),
                 message: StringUtils.extractNonCodeContent(responseText.message, ["thinking"])
             };
         }

        Logger.verbose(`NextActionResponse: ${JSON.stringify(response, null, 2)}`);

        // Create new task for the next action
        if (response.nextAction && response.nextAction !== "DONE") {
            // Find the procedure guide if one is being followed
            const procedureGuide = response.sequence !== "none" 
                ? procedureGuides.find(g => g.metadata?.title === response.sequence)
                : undefined;

            const newTask: AddTaskParams = {
                type: TaskType.Step,
                description: response.taskDescription || response.nextAction,
                creator: this.userId,
                order: currentTasks.length, // Add to end of current tasks
                props: {
                    stepType: response.nextAction,
                    ...(procedureGuide && { procedureGuideId: procedureGuide.id })
                }
            };
            await this.projects.addTask(project, newTask);

            return {
                finished: true,
                goal: response.revisedUserGoal,
                response: {
                    type: StepResponseType.Plan,
                    reasoning: response.reasoning,
                    data: {
                        steps: response.nextAction ? [{
                            actionType: response.nextAction,
                            context: response.taskDescription,
                            ...(response.sequence !== "none" && { 
                                procedureGuide: {
                                    title: response.sequence,
                                    // Only include artifactId if we found a matching guide
                                    ...(procedureGuides.some(g => g.metadata?.title === response.sequence) && {
                                        artifactId: procedureGuides.find(g => g.metadata?.title === response.sequence)?.id
                                    }
                                )}
                            })
                        }] : []
                    }
                }
            };            
        } else if (response.nextAction && response.nextAction === "DONE") {
            return {
                finished: true,
                artifactIds: params.context?.artifacts?.map(a => a.id),
                response: {
                    type: StepResponseType.Plan,
                    reasoning: response.reasoning,
                    message: response.message
                }
            };
        } else {
            throw new Error("Planner returned unexpected state");
        }
    }
}
