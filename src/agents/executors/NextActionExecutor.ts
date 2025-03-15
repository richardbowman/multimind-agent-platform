import { NextActionResponse } from '../../schemas/NextActionResponse';
import { AddTaskParams, TaskType } from '../../tools/taskManager';
import { TaskManager } from '../../tools/taskManager';
import Logger from '../../helpers/logger';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { getGeneratedSchema } from 'src/helpers/schemaUtils';
import { SchemaType } from 'src/schemas/SchemaTypes';
import { EXECUTOR_METADATA_KEY, StepExecutorDecorator } from '../decorators/executorDecorator';
import { ChatClient } from 'src/chat/chatClient';
import { ContentType, OutputType } from 'src/llm/promptBuilder';
import { ModelType } from 'src/llm/LLMServiceFactory';
import { BaseStepExecutor, StepExecutor } from '../interfaces/StepExecutor';
import { ExecutorType } from '../interfaces/ExecutorType';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResponse, StepResponseType, StepResult } from '../interfaces/StepResult';
import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StringUtils } from 'src/utils/StringUtils';
import { withRetry } from 'src/helpers/retry';
import { ModelResponse } from 'src/schemas/ModelResponse';
import { ArtifactManager } from 'src/tools/artifactManager';
import { ArtifactType, DocumentSubtype } from 'src/tools/artifact';

export type WithReasoning<T extends ModelResponse> = T & {
    reasoning?: string;
    message?: string;
};

@StepExecutorDecorator(ExecutorType.NEXT_STEP, 'Generate focused questions to understand user goals', false)
export class NextActionExecutor extends BaseStepExecutor<StepResponse> {
    readonly allowReplan: boolean = false;
    readonly alwaysComplete: boolean = true;

    private projects: TaskManager;
    private userId?: string;
    private modelHelpers: ModelHelpers;
    private stepExecutors: Map<string, StepExecutor<StepResponse>> = new Map();
    private chatClient: ChatClient;
    private artifactManager: ArtifactManager;
    private agentName?: string;

    constructor(params: ExecutorConstructorParams, stepExecutors: Map<string, StepExecutor<StepResponse>>) {
        super(params);
        this.projects = params.taskManager;
        this.userId = params.userId;
        this.modelHelpers = params.modelHelpers;
        this.stepExecutors = stepExecutors;
        this.chatClient = params.chatClient;
        this.artifactManager = params.artifactManager;
        this.agentName = params.agentName;
    }

    public async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        const agentList = params.agents?.filter(a => a?.userId !== this.userId);
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
        const prompt = this.startModel(params);

        prompt.addContext(ContentType.PURPOSE);
        prompt.addContext({ contentType: ContentType.INTENT, params })
        prompt.addContext({ contentType: ContentType.AGENT_HANDLES, agents: agentList || [] });
        prompt.addContext({ contentType: ContentType.GOALS_FULL, params })

        params.context?.artifacts && prompt.addContext({ contentType: ContentType.ARTIFACTS_TITLES, artifacts: params.context?.artifacts });
        params.steps && prompt.addContext({ contentType: ContentType.STEPS, steps: params.steps, posts: params.context?.threadPosts });

        // Get procedure guides already in use from previous responses
        const pastGuideIds = params.previousResponses?.flatMap(response =>
            response.data?.steps?.flatMap(step =>
                step.procedureGuide?.artifactId ? [step.procedureGuide.artifactId] : []
            ) || []
        ) || [];

        // Get procedure guides from search, excluding any already in use
        const searchedGuides = (await this.artifactManager.searchArtifacts(
            params.stepGoal,
            {
                type: ArtifactType.Document,
                subtype: DocumentSubtype.Procedure
            },
            10
        )).filter(guide => !pastGuideIds.includes(guide.artifact.id));

        // Load all guides in a single bulk operation
        const allGuides = await this.artifactManager.bulkLoadArtifacts([
            ...searchedGuides.map(p => p.artifact.id),
            ...pastGuideIds
        ]);

        // Filter by agent if specified
        const procedureGuides = this.agentName ?
            allGuides.filter(a => a.metadata?.agent === this.agentName) :
            allGuides;

        // Format searched guides for prompt
        const filtered = searchedGuides.filter(g => procedureGuides.find(p => p.id === g.artifact.id));
        prompt.addContext({ contentType: ContentType.PROCEDURE_GUIDES, guideType: "searched", guides: filtered.map(f => procedureGuides.find(p => p.id === f.artifact.id)).filter(f => !!f) });
        prompt.addContext({ contentType: ContentType.PROCEDURE_GUIDES, guideType: "in-use", guides: pastGuideIds.map(f => procedureGuides.find(p => p.id === f)).filter(f => !!f) });

        const completionAction = params.executionMode === 'conversation' ? 'REPLY' : 'DONE';

        prompt.addContext(`### AVAILABLE ACTION TYPES:\n${executorMetadata
            .filter(metadata => metadata.planner)
            .map(({ key, description }) => `[${key}]: ${description}`)
            .join("\n")}\n[${completionAction}]: ${params.executionMode === 'conversation' ? 'Send your reply message to the user' : 'Mark the task as complete with your message containing the final data.'}`);


        prompt.addInstruction(`
- IN YOUR REASONING, describe this process:
- Review the STEP HISTORY to see what you've already done, don't keep repeating your action.
- Review the user's message, and see if their goal has changed from the original intent. If so restate their new goal in the "revisedUserGoal" field.
- Explain each step and why it would or would not make sense to be the next action.
- If you have acheived the goal or need to reply to the user with questions, set the Action Type to ${completionAction}.
- If you need to continue working, determine the next Action Type from the AVAILABLE ACTION TYPES to continue to achieve the goal.
- Consider Procedure Guides for help on step order required to be successful. If you use a guide, use the 'procedureGuideTitle' field to share the title.`);

        prompt.addContext({ contentType: ContentType.FINAL_INSTRUCTIONS });

        prompt.addOutputInstructions({ outputType: OutputType.JSON_WITH_MESSAGE_AND_REASONING, schema });

        const response: WithReasoning<Partial<NextActionResponse>> = await withRetry(
            async () => {
                const result = await prompt.generate({
                    message: params.message || params.stepGoal,
                    instructions: prompt,
                    modelType: ModelType.ADVANCED_REASONING
                });

                return {
                    ...StringUtils.hasJsonBlock(result.message) && StringUtils.extractAndParseJsonBlock<NextActionResponse>(result.message, schema) || {},
                    reasoning: StringUtils.extractXmlBlock(result.message, "thinking"),
                    message: StringUtils.extractNonCodeContent(result.message, ["thinking"], ["json"])
                };
            },
            (result) => !!result && (!!result.nextAction || !!result.message), // Validate we got a proper response
            {
                maxRetries: 3,
                initialDelayMs: 100,
                backoffFactor: 2,
                timeoutMs: 20000
            }
        );

        Logger.verbose(`NextActionResponse: ${JSON.stringify(response, null, 2)}`);

        // Create new task for the next action
        if (response.nextAction && response.nextAction !== completionAction) {
            // Find the procedure guide if one is being followed
            const procedureGuide = response.procedureGuideTitle !== "none"
                ? procedureGuides.find(g => g.metadata?.title === response.procedureGuideTitle)
                : undefined;

            const newTask: AddTaskParams = {
                type: TaskType.Step,
                description: response.taskDescription || response.nextAction,
                creator: this.userId,
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
                    status: response.message,
                    data: {
                        steps: response.nextAction ? [{
                            actionType: response.nextAction,
                            context: response.taskDescription,
                            ...(response.procedureGuideTitle !== "none" && {
                                procedureGuide: {
                                    title: response.procedureGuideTitle,
                                    // Only include artifactId if we found a matching guide
                                    ...(procedureGuides.some(g => g.metadata?.title === response.procedureGuideTitle) && {
                                        artifactId: procedureGuides.find(g => g.metadata?.title === response.procedureGuideTitle)?.id
                                    }
                                    )
                                }
                            })
                        }] : []
                    }
                }
            };
        } else if ((response.nextAction && response.nextAction === completionAction) ||
            (!response.nextAction && response.message)) {
            return {
                finished: true,
                artifactIds: params.context?.artifacts?.map(a => a.id),
                response: {
                    type: StepResponseType.CompletionMessage,
                    reasoning: response.reasoning,
                    message: response.message
                }
            };
        } else {
            throw new Error("Planner returned unexpected state: No next action and no completion message");
        }
    }
}
