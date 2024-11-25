import Logger from "src/helpers/logger";
import ResearchWorkflow from './researchWorkflow';
import ResearchAssistant from './assistant';
import LMStudioService from './llm/lmstudioService'; // Import the LMStudioService
import { Post } from '@mattermost/types/posts';
import { CHAT_MODEL, EMBEDDING_MODEL, ORCHESTRATOR_USER_ID, WEB_RESEARCH_CHANNEL_ID } from './config';
import { randomUUID } from 'crypto';
import EmailWorkflow from './emailWorkflow';
import { InMemoryTestClient } from './chat/testClient';
import { ChatClient, ChatPost, ProjectChainResponse } from './chat/chatClient';

enum ActivityType {
    DraftEmail = "draft-email",
    WebResearch = "web-research"
}

interface ConversationContext extends Record<string, any> {
    "project-id": string;
    "conversation-root": string;
    "activity-type": ActivityType;
}

export class MainOrchestrator {
    private USER_TOKEN: string;
    private PROJECTS_CHANNEL: string;
    private chatClient: ChatClient;
    private lmStudioService: LMStudioService;
    private researchAssistant: ResearchAssistant;
    private userId: string;

    constructor(chatUserToken: string, userId: string, chatClient: ChatClient, researchAssistant: ResearchAssistant, projectsChannel: string, lmStudioService: LMStudioService) {
        this.chatClient = chatClient;
        this.userId = userId;
        this.USER_TOKEN = chatUserToken;
        this.PROJECTS_CHANNEL = projectsChannel;
        this.researchAssistant = researchAssistant;
        this.lmStudioService = lmStudioService; // Inject LMStudioService
    }

    public async initialize() {
        // Initialize the WebSocket client for real-time message listening
        this.chatClient.initializeWebSocket(async (post: ChatPost) => {
            // Get the channel ID and user ID
            const channelId = post.channel_id;
            const userId = post.user_id;

            if (channelId === this.PROJECTS_CHANNEL && userId !== this.userId) {
                Logger.info(`Received project message: ${post.message.slice(0,100)}... in ${channelId} from ${userId}, with root id ${post.getRootId()}`);

                let context: ConversationContext | undefined;

                if (!post.getRootId()) {
                    // Determine the type of activity using an LLM
                    const activityType = await this.classifyActivity(post.message);

                    switch (activityType.trim()) {
                        case 'web-research':
                            await this.handleWebResearch(channelId, post);
                            break;
                        case 'draft-email':
                            await this.handleDraftEmail(channelId, post);
                            break; // Add new case for draft email
                        case 'web-research-complete': 
                            await this.createFinalReport(post);
                            break;
                        default:
                            Logger.info(`Unsupported activity type: ${activityType}`);
                            await this.chatClient.createPost(channelId, `Sorry, I don't support ${activityType} yet.`, {});
                            return;
                    }

                } else {
                    Logger.info(`Received thread message: ${post.message} in ${channelId} from ${userId}, with root id ${post.getRootId()}`);

                    const projectChain = await this.chatClient.findProjectChain(post.channel_id, post.getRootId());
                    const activityType = projectChain.activityType||'web-research';

                    Logger.info(`Activity type: ${activityType}`);

                    switch (activityType) {
                        case 'web-research':
                        case 'unknown':
                            await this.continueWebResearch(projectChain, post);
                            break;
                        case 'draft-email':
                            await this.continueDraftEmail(projectChain, post);
                            break; // Add new case for draft email
                        default:
                            Logger.info(`Unsupported activity type: ${activityType}`);
                            return;
                    }
                }
            } else {
                // Logger.info(`Ignoring message: ${post.message} in ${channelId} from ${userId}, with root id ${post.root_id}`);
            }
        });

        // Initialize the embedding and LLaMA models
        await this.lmStudioService.initializeEmbeddingModel(EMBEDDING_MODEL);
        await this.lmStudioService.initializeLlamaModel(CHAT_MODEL);
    }

    private async classifyActivity(message: string): Promise<string> {
        const prompt = `
            You classify what type of message the agent just recevied.
            
            Please choose one of the following activity types for the given request:
            - web-research: write an answer that requires Internet research
            - web-research-complete: a response from the reserch team that they completed the research
            
            Respond with only the activity type.
        `;
        Logger.info(prompt);
        
        const history = [{ role: "system", content: prompt }]; // Initialize history with the prompt
        const response = await this.lmStudioService.sendMessageToLLM(message, history);
        Logger.info(response);
        return response;
    }

    private async replyWithProjectId(activityType: ActivityType, projectId: string, channelId: string, post: Post) : Promise<Post> {
        // Send a response back to the channel
        const postProps: ConversationContext = {
            'project-id': projectId,
            'conversation-root': post.id, // Store the root post ID for future reference
            'activity-type': activityType
        };
        const responseMessage = `I've received your request for a project!
Project ID: **${projectId}**
Activity Type: **${activityType}**`;
        return this.chatClient.createPost(channelId, responseMessage, postProps);
    }

    private async postTaskList(workflow: ResearchWorkflow, channelId: string, projectPost: Post) : Promise<Post> {
        // Send details back to the channel
        const taskListMessage = `
Strategy: ${workflow.getStrategy()}

Tasks distributed successfully:
${workflow.getTasks().map(({ description: prompt, taskId }) => ` - Task ID: ${taskId} | ${prompt}`).join("\n")}`;

        const taskPost = await this.chatClient.postReply(projectPost.id, channelId, taskListMessage);
        return taskPost;
    }    

    private async handleWebResearch(channelId: string, post: ChatPost) {
        const projectId = randomUUID();

        const workflow = new ResearchWorkflow(projectId, post.message);
        await workflow.decomposeTask(post.message);

        const projectPost = await this.replyWithProjectId(ActivityType.WebResearch, projectId, channelId, post);
        const taskListMessage = await this.postTaskList(workflow, channelId, projectPost);


        // post each task to researchers in research channel
        workflow.distributeTasks(this, this.researchAssistant);
    }

    private async createFinalReport(post: ChatPost) {
        const workflow = new ResearchWorkflow(post.props['project-id'], post.message);
        const aggregatedData = await workflow.aggregateResults();
        const answer2 = await workflow.createFinalReport(aggregatedData);
        // workflow.generateReply(projectChain.posts, )

        await this.chatClient.postReply(post.id, this.PROJECTS_CHANNEL, answer2);

    }

    private async handleDraftEmail(channelId: string, post: ChatPost) {
        const projectId = randomUUID();
        Logger.info("Kicking off draft email workflow");
        
        const emailDraftWorkflow = new ResearchWorkflow(projectId, post.message);
        await emailDraftWorkflow.decomposeTask(post.message);

        // Initialize a ResearchAssistant for the email draft
        emailDraftWorkflow.distributeTasks(this.researchAssistant);

        const projectPost = await this.replyWithProjectId(ActivityType.DraftEmail, projectId, channelId, post);

        const taskListMessage = await this.postTaskList(emailDraftWorkflow, channelId, projectPost);
    }

    private async continueWebResearch(projectChain: ProjectChainResponse, post: ChatPost): Promise<void> {
        const workflow = new ResearchWorkflow(projectChain.projectId, post.message);

        const reply = await workflow.generateResearchReply(projectChain.posts);

        await this.chatClient.postReply(post.getRootId(), post.channel_id, reply);
    }

    private async continueDraftEmail(projectChain: ProjectChainResponse, post: ChatPost): Promise<void> {
        // Generate a draft email based on the conversation history and the new message
        // const response = await this.lmStudioService.sendMessageToLLM(`Please draft an email based on this conversation: ${post.message}`, projectChain.posts);

        const workflow = new EmailWorkflow(projectChain.projectId, post.message);
        const response = await workflow.generateEmailReply(projectChain.posts);
        //projectChain.posts.slice(1), projectChain.posts[0].message

        // Send the draft email back to the user
        await this.chatClient.postReply(post.getRootId(), post.channel_id, `Here is your draft email:\n\n${response}`);
    }

    private async fetchResearcherMessages(): Promise<ChatPost[]> {
        return this.chatClient.fetchPreviousMessages(WEB_RESEARCH_CHANNEL_ID);
    }
}