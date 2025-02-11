import { Agent, HandlerParams } from './agents';
import { SchemaType } from '../schemas/SchemaTypes';
import { ContentType } from 'src/llm/promptBuilder';
import { Project, Task } from '../tools/taskManager';
import { ModelResponse } from '../schemas/ModelResponse';
import { StructuredOutputPrompt } from '../llm/ILLMService';
import { AgentConstructorParams } from './interfaces/AgentConstructorParams';
import { ChatPost } from 'src/chat/chatClient';
import { ChannelData } from 'src/shared/channelTypes';
import { createUUID, UUID } from 'src/types/uuid';
import { Artifact } from 'src/tools/artifact';
import { getGeneratedSchema } from 'src/helpers/schemaUtils';
import { RoutingResponse } from 'src/schemas/RoutingResponse';

export interface RoutingContext {
    channelData: Partial<ChannelData>;
    project: Project | null;
    agentOptions: Agent[];
    projectTasks: Task[];
    conversationContext: string;
    artifacts?: Artifact[]
}

export class RouterAgent extends Agent {
    protected async handlerThread(params: HandlerParams): Promise<void> {
        return this.handleMessage(params);
    }

    protected async handleChannel(params: HandlerParams): Promise<void> {
        return this.handleMessage(params);
    }
    private confirmationTimeouts: Map<string, NodeJS.Timeout> = new Map();

    constructor(params: AgentConstructorParams) {
        super(params);
        this.modelHelpers.setPurpose("YOU ARE THE ROUTER AGENT (@router). Your job is help route to other agents.");
        this.modelHelpers.setFinalInstructions("Your ONLY goal is to TRANSFER USERS to the best agent to solve their needs, not try and solve their needs.");
    }

    async initialize(): Promise<void> {
    }

    // Required abstract method implementations
    protected async processTask(task: Task): Promise<void> {
        // Router agent doesn't process tasks
        throw new Error("Router is not configured to handle task assignment");
    }



    private async getRoutingContext(params: HandlerParams) : Promise<RoutingContext> {
        const { userPost, threadPosts = [] } = params;

        // Get channel data including any project goals
        const channelData = await this.chatClient.getChannelData(userPost.channel_id);
        const project = channelData?.projectId
            ? this.projects.getProject(channelData.projectId)
            : null;

        // Get agent descriptions from settings for channel members
        const agentOptions = (channelData.members || [])
            .filter(memberId => this.userId !== memberId)
            .map(memberId => {
                return this.agents.agents[memberId];
            });          

        // Get project tasks if exists
        const projectTasks = project ? Object.values(project.tasks) : [];

        // Get conversation context from thread posts if available
        const conversationContext = threadPosts.length > 0
            ? threadPosts.map(p => `${p.user_id === this.userId ? 'Assistant' : 'User'}: ${p.message}`).join('\n')
            : userPost.message;

        return {
            channelData,
            project,
            agentOptions,
            projectTasks,
            conversationContext,
            artifacts: params.artifacts
        };
    }

    private async handleRoutingResponse(
        userPost: ChatPost, response: ModelResponse, threadPosts: ChatPost[], context: RoutingContext) {
        // Handle different next steps based on LLM's decision
        if (!response.nextStep) {
            // Default to provide-information if no nextStep specified
            response.nextStep = 'provide-information';
        }

        switch (response.nextStep) {
            case 'start-goal':
                await this.reply(userPost, {
                    message: response.response
                }, {
                    "project-tasks": context.projectTasks
                        .filter(t => !t.complete)
                        .map(t => t.description)
                        .join('\n')
                });
                break;

            case 'propose-transfer':
                if (response.selectedAgent) {
                    await this.reply(userPost, {
                        message: response.response
                    }, {
                        "routing-suggested": true,
                        "proposed-agent": response.selectedAgent
                    });
                }
                break;

            case 'execute-transfer':
                if (response.selectedAgent) {
                    await this.chatClient.postInChannel(
                        createUUID(userPost.channel_id),
                        `${response.selectedAgent} ${response.response}`,
                        {
                            "routed-from": userPost.user_id,
                            "routed-by": this.userId,
                            "routed-agent": response.selectedAgent,
                            ...(context.artifacts && context.artifacts.length > 0 ? {
                                artifactIds: context.artifacts.map(a => a.id)
                            } : {})
                        }
                    );
                    break;
                }

            case 'ask-clarification':
            case 'provide-information':
            default:
                // Check if we've already suggested this agent in this thread
                const hasSuggested = threadPosts.some(post =>
                    post.user_id === this.userId && post.props["routing-suggested"]
                );

                if (!hasSuggested) {
                    await this.reply(userPost, {
                        message: response.response,
                    }, {
                        "routing-suggested": true
                    });
                } else {
                    await this.reply(userPost, {
                        message: response.response
                    });
                }
                break;
        }
    }

    protected async handleMessage(params: HandlerParams): Promise<void> {
        const { userPost, rootPost, threadPosts = [] } = params;
        const context = await this.getRoutingContext(params);

        const schema = await getGeneratedSchema(SchemaType.RoutingResponse);

        const promptBuilder = this.modelHelpers.createPrompt();
        promptBuilder.addContext({contentType: ContentType.ABOUT});

        // Add available agents with their capabilities
        promptBuilder.addContext({contentType: ContentType.CHANNEL_AGENT_CAPABILITIES, agents: context.agentOptions});

        // Add project details if exists
        if (context.project) {
            promptBuilder.addContext({contentType: ContentType.CHANNEL_GOALS, tasks: Object.values(context.project.tasks)});
        }

        // Add routing instructions
        promptBuilder.addInstruction(`You must explicitly choose one of these next steps:

1. propose-transfer: When you have a good candidate agent but want user confirmation
   - Explain why they're the best choice. Make sure to ask clearly in your message for user confirmation.

2. execute-transfer: When you're highly confident, should immediately transfer, or have already proposed and the user has accepted.
   - Develop a complete transfer note to the agent so they can successfully respond to the user. Make sure to repeat all pertinent information to the other agent, they will not see the original user's message.

3. ask-clarification: ONLY If you do NOT know how to route the user already.
   - Politely ask specific clarifying questions, explain what information is missing

4. start-goal: When there are outstanding project tasks and the user seems unsure what to do
   - Suggest starting or continuing work on the project goals
   - Only available when there are incomplete tasks in the project
   - Use this especially when the user is greeting you or seems unsure what to do next
   - Make sure to share the first outstanding goal that you propose them starting`);

        // Add artifacts if present
        if (params.artifacts) {
            promptBuilder.addContext({contentType: ContentType.ARTIFACTS_EXCERPTS, artifacts: params.artifacts});
        }

        // Add response format
        promptBuilder.addInstruction(`Respond with:
- selectedAgent: The best agent to handle this (optional if not yet clear)
- response: Your message to the user (or message to the transferring agent for execute-transfer)
- confidence: Your confidence level (0-1) in this selection`);

        const posts = [rootPost, ...threadPosts].filter(p => p !== undefined);
        const response = await this.modelHelpers.generate<RoutingResponse>({
            message: userPost.message,
            instructions: new StructuredOutputPrompt(schema, promptBuilder.build()),
            threadPosts: posts
        });

        await this.handleRoutingResponse(userPost, response, threadPosts, context);
    }

    protected projectCompleted(project: Project): void {
        // Router agent doesn't handle projects
    }
}
