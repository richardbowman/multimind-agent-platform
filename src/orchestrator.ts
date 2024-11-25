import Logger from "src/helpers/logger";
import ResearchWorkflow from './researchWorkflow';
import ResearchAssistant from './assistant';
import LMStudioService from './llm/lmstudioService'; // Import the LMStudioService
import { CHAT_MODEL, EMBEDDING_MODEL, WEB_RESEARCH_CHANNEL_ID } from './config';
import { randomUUID } from 'crypto';
import EmailWorkflow from './emailWorkflow';
import { ChatClient, ChatPost, ConversationContext, ProjectChainResponse } from './chat/chatClient';
import 'reflect-metadata';
import { Agent, HandleActivity, ResponseType } from "./agents/agents";

enum ActivityType {
    DraftEmail = "draft-email",
    WebResearch = "web-research"
}

interface OrchestratorContext extends ConversationContext {
    activityType: ActivityType;
}

export class MainOrchestrator extends Agent {
    private USER_TOKEN: string;
    private PROJECTS_CHANNEL: string;
    private researchAssistant: ResearchAssistant;

    constructor(chatUserToken: string, userId: string, chatClient: ChatClient, researchAssistant: ResearchAssistant, projectsChannel: string, lmStudioService: LMStudioService) {
        super(chatClient, lmStudioService, userId);
        this.USER_TOKEN = chatUserToken;
        this.PROJECTS_CHANNEL = projectsChannel;
        this.researchAssistant = researchAssistant;
    }

    public async initialize() {
        super.setupChatMonitor(this.PROJECTS_CHANNEL);
    }

    // private getMethodForActivity(activityType: string): ((channelId: string, post: ChatPost) => Promise<void>) | null {
    //     for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(this))) {
    //         const handlerMethod = this[key];
    //         if (typeof handlerMethod === 'function') {
    //             const methodActivityType = Reflect.getMetadata('activityType', this, key);
    //             if (methodActivityType === activityType) {
    //                 return handlerMethod.bind(this);
    //             }
    //         }
    //     }
    //     return null;
    // }

    // private async classifyActivity(message: string): Promise<string> {
    //     const prompt = `
    //         You classify what type of message the agent just recevied.
            
    //         Please choose one of the following activity types for the given request:
    //         - web-research: write an answer that requires Internet research
    //         - web-research-complete: a response from the reserch team that they completed the research
            
    //         Respond with only the activity type.
    //     `;
    //     Logger.info(prompt);
        
    //     const history = [{ role: "system", content: prompt }]; // Initialize history with the prompt
    //     const response = await this.lmStudioService.sendMessageToLLM(message, history);
    //     Logger.info(response);
    //     return response;
    // }

    private async replyWithProjectId(activityType: ActivityType, projectId: string, channelId: string, post: ChatPost) : Promise<ChatPost> {
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

    private async postTaskList(workflow: ResearchWorkflow, channelId: string, projectPost: ChatPost) : Promise<ChatPost> {
        // Send details back to the channel
        const taskListMessage = `
Strategy: ${workflow.getStrategy()}

Tasks distributed successfully:
${workflow.getTasks().map(({ description: prompt, taskId }) => ` - ${prompt}`).join("\n")}`;

        const taskPost = await this.chatClient.postReply(projectPost.id, channelId, taskListMessage);
        return taskPost;
    }    

    @HandleActivity('web-research', "Initiate research for user request", ResponseType.CHANNEL)
    private async handleWebResearch(channelId: string, post: ChatPost) {
        const projectId = randomUUID();

        const workflow = new ResearchWorkflow(projectId, post.message);
        await workflow.decomposeTask(post.message);

        const projectPost = await this.replyWithProjectId(ActivityType.WebResearch, projectId, channelId, post);
        await this.postTaskList(workflow, channelId, projectPost);

        // post each task to researchers in research channel
        workflow.distributeTasks(this, this.researchAssistant);
    }

    @HandleActivity('web-research-complete', "Received completed research for analysis.", ResponseType.CHANNEL)
    private async createFinalReport(channelId: string, post: ChatPost) {
        const workflow = new ResearchWorkflow(post.props['project-id'], post.message);
        const aggregatedData = await workflow.aggregateResults();
        const answer2 = await workflow.createFinalReport(aggregatedData);
        // workflow.generateReply(projectChain.posts, )

        await this.chatClient.postReply(post.id, this.PROJECTS_CHANNEL, answer2);

    }

    @HandleActivity('draft-email', "Perform copy-editing to create an email draft.", ResponseType.CHANNEL)
    private async handleDraftEmail(channelId: string, post: ChatPost) {
        const projectId = randomUUID();
        Logger.info("Kicking off draft email workflow");
        
        const emailDraftWorkflow = new ResearchWorkflow(projectId, post.message);
        await emailDraftWorkflow.decomposeTask(post.message);

        // Initialize a ResearchAssistant for the email draft
        emailDraftWorkflow.distributeTasks(this, this.researchAssistant);

        const projectPost = await this.replyWithProjectId(ActivityType.DraftEmail, projectId, channelId, post);

        const taskListMessage = await this.postTaskList(emailDraftWorkflow, channelId, projectPost);
    }

    @HandleActivity('web-research', "Response to initial web research", ResponseType.RESPONSE)
    private async continueWebResearch(projectChain: ProjectChainResponse, post: ChatPost): Promise<void> {
        if (post.getRootId()) {
            const workflow = new ResearchWorkflow(projectChain.projectId, post.message);
            const reply = await workflow.generateResearchReply(projectChain.posts);
            await this.chatClient.postReply(post.getRootId()||"", post.channel_id, reply);
        } else {
            Logger.error("No root ID found in the project chain.")
        }
    }

    @HandleActivity('draft-email', "Alter the originalemail based on comments", ResponseType.RESPONSE)
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