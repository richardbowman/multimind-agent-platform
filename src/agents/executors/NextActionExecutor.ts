import { NextActionResponse } from '../../schemas/NextActionResponse';
import { AddTaskParams, TaskType } from '../../tools/taskManager';
import { TaskManager } from '../../tools/taskManager';
import Logger from '../../helpers/logger';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { getGeneratedSchema } from 'src/helpers/schemaUtils';
import { SchemaType } from 'src/schemas/SchemaTypes';
import { EXECUTOR_METADATA_KEY, StepExecutorDecorator } from '../decorators/executorDecorator';
import { ChatClient } from 'src/chat/chatClient';
import { ContentType, globalRegistry, OutputType } from 'src/llm/promptBuilder';
import { ModelType } from "src/llm/types/ModelType";
import { StepExecutor } from '../interfaces/StepExecutor';
import { BaseStepExecutor } from '../interfaces/BaseStepExecutor';
import { ExecutorType } from '../interfaces/ExecutorType';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResponse, StepResponseType, StepResult } from '../interfaces/StepResult';
import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StringUtils } from 'src/utils/StringUtils';
import { withRetry } from 'src/helpers/retry';
import { ModelResponse } from 'src/schemas/ModelResponse';
import { ArtifactManager } from 'src/tools/artifactManager';
import { asError } from 'src/types/types';
import { ModelResponseError } from '../stepBasedAgent';
import { UUID } from 'src/types/uuid';

export type WithReasoning<T extends ModelResponse> = T & {
    reasoning?: string;
    message?: string;
};

@StepExecutorDecorator(ExecutorType.NEXT_STEP, 'Generate focused questions to understand user goals', false)
export class NextActionExecutor extends BaseStepExecutor<StepResponse> {
    readonly allowReplan: boolean = false;
    readonly alwaysComplete: boolean = true;

    private projects: TaskManager;
    private userId?: UUID;
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
        try {
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
            const project = await this.projects.getProject(params.projectId);
            const prompt = this.startModel(params);

            prompt.addContext({ contentType: ContentType.PURPOSE });
            // prompt.addContext({ contentType: ContentType.INTENT, params })
            prompt.addContext({ contentType: ContentType.AGENT_HANDLES, agents: agentList || [] });
            prompt.addContext({ contentType: ContentType.GOALS_FULL, params })

            params.context?.artifacts && prompt.addContext({ contentType: ContentType.ARTIFACTS_TITLES, artifacts: params.context?.artifacts });
            params.steps && prompt.addContext({ contentType: ContentType.STEPS, steps: params.steps, posts: params.context?.threadPosts });

            const procedureGuides = await prompt.addProcedures(this.agentName ? { 'metadata.agent': this.agentName }: {});

            const isConversation = params.executionMode === 'conversation'
            const completionAction = isConversation ? 'reply' : 'done';

            prompt.addContext(`# AVAILABLE ACTION TYPES:\n${executorMetadata
                .filter(metadata => metadata.planner)
                .map(({ key, description }) => `[${key}]: ${description}`)
                .join("\n")}\n[${completionAction}]: ${isConversation ? 'Send your provided message to the user' : 'Mark the task as complete with your message containing the final data.'}`);


            // TODO: proabably integrate this cleaner into typical step context renderers
            const pastActionSteps = params.previousResponses?.filter(r => r.type && [StepResponseType.Plan, StepResponseType.CompletionMessage].includes(r.type) && r.data?.conversationSummary);
            pastActionSteps?.length||0 > 0 && prompt.addContext(`# CONVERSATION SUMMARY: ${pastActionSteps!.slice(-1)[0].data?.conversationSummary}`);

            prompt.addContext({ contentType: ContentType.FINAL_INSTRUCTIONS });

            prompt.addOutputInstructions({ outputType: OutputType.ALL_XML_MESSAGE_REASONING_DATA, schema, status: false, specialInstructions: `
    IN <thinking>, describe this process:
    - Review the STEPS COMPLETED FOR POST to see what you've already done.
    - Consider Procedure Guides for help on step order required to be successful. 
    - Consider the best Action Type from the AVAILABLE ACTION TYPES to achieve the goal.
    - Explain each step and why it would or would not make sense to be the next action.
    THEN IN <data>:
    - If you need to continue working, set the "nextAction" to one of the AVAILABLE ACTION TYPES.
    - If you achieved the goal${isConversation ? " or need to reply to the user with questions" : ""}, set the Action Type to ${completionAction}.
    - In "procedureGuideTitle", share the title of the guide you are following or "NONE".
    - Summarize the conversation into "conversationSummary"
    FINALLY IN <message>:
    - For reply: Respond in a friendly and concise chat message.
    - For other actions: Provide a clear description of the user's goals as well as a complete task description for the step, repeating all necessary information the step needs including the details of the user's message.

    YOU MUST ALWAYS FOLLOW THE OUTPUT FORMAT WITH 3 SEPARATE XML-ENCLOSED SECTIONS: <thinking>...</thinking>, <data>...</data>, and <message>...</message>.
    `});

            const validActions = new Set([
                ...executorMetadata.map(m => m.key),
                completionAction
            ]);

            const response: WithReasoning<Partial<NextActionResponse>> = await withRetry(
                async ({ previousError, previousResult} ) => {
                    if (previousError) {
                        prompt.setLastError(`YOU PROVIDED AN IMPROPER RESPONSE IN YOUR LAST ATTEMPT. MAKE SURE TO FOLLOW RESPONSE FORMAT.
                            Previous Response: ${(previousError as ModelResponseError).modelResponse||JSON.stringify(previousResult)||"(unknown)"}
                            Previous Error: ${previousError.message} `);
                    }

                    const result = await prompt.generate({
                        modelType: ModelType.REASONING
                    });

                    const response = {
                        reasoning: StringUtils.extractXmlBlock(result.message, "thinking"),
                        message: StringUtils.extractXmlBlock(result.message, "message"),
                        ...StringUtils.extractAndParseXmlJsonBlock<NextActionResponse>(result.message, "data", schema) || StringUtils.extractAndParseJsonBlock<NextActionResponse>(result.message, schema)
                    };

                    // Validate nextAction is one of the available types
                    if (!response.nextAction || !validActions.has(response.nextAction)) {
                        throw new ModelResponseError(`Error: Invalid nextAction: ${response.nextAction||"None provided"}. Must be one of: ${Array.from(validActions).join(', ')}`, result.message);
                    }

                    if (StringUtils.isEmptyString(response.message)) {
                        throw new ModelResponseError(`Error: No message provided.`, result.message);
                    }

                    return response;
                },
                () => true,
                {
                    maxAttempts: 3,
                    initialDelayMs: 100,
                    backoffFactor: 2,
                    timeoutMs: 20000
                }
            );

            Logger.verbose(`NextActionResponse: ${JSON.stringify(response, null, 2)}`);

            const retainedProcedureGuides = response.procedureGuideTitle !== "none" ? {
                procedureGuide: {
                    title: response.procedureGuideTitle,
                    // Only include artifactId if we found a matching guide
                    ...(procedureGuides.some(g => g.metadata?.title === response.procedureGuideTitle) && {
                        artifactId: procedureGuides.find(g => g.metadata?.title === response.procedureGuideTitle)?.id
                    }
                    )
                }
            } : {};

            // Create new task for the next action
            if (response.nextAction && response.nextAction !== completionAction && response.message) {
                // Find the procedure guide if one is being followed
                const procedureGuide = response.procedureGuideTitle !== "none"
                    ? procedureGuides.find(g => g.metadata?.title === response.procedureGuideTitle)
                    : undefined;

                const newTask: AddTaskParams = {
                    type: TaskType.Step,
                    description: response.message,
                    creator: this.userId||'system',
                    props: {
                        stepType: response.nextAction,
                        ...(procedureGuide && { procedureGuideId: procedureGuide.id })
                    }
                };
                await this.projects.addTask(project, newTask);

                return {
                    finished: true,
                    response: {
                        type: StepResponseType.Plan,
                        reasoning: response.reasoning,
                        status: response.message,
                        data: {
                            conversationSummary: response.conversationSummary,
                            steps: response.nextAction ? [{
                                actionType: response.nextAction,
                                context: response.message,
                                ...retainedProcedureGuides
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
                        message: response.message,
                        data: {
                            conversationSummary: response.conversatonSummary,
                            steps: [retainedProcedureGuides]
                        }
                    }
                };
            } else {
                throw new Error("Planner returned unexpected state: No next action and no completion message");
            }
        } catch (error) {
            const errorMsg = `Failed to determine next action: ${asError(error).message}`;
            Logger.error(errorMsg, error);
            return {
                finished: true,
                response: {
                    type: StepResponseType.Error,
                    status: `AN ERROR OCCURED: ${errorMsg}`
                }
            }
        }
    }
}
