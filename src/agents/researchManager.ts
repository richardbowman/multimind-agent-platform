import Logger from "src/helpers/logger";
import LMStudioService from '../llm/lmstudioService'; // Import the LMStudioService
import { WEB_RESEARCH_CHANNEL_ID, PROJECTS_CHANNEL_ID, CHROMA_COLLECTION } from '../helpers/config';
import { randomUUID } from 'crypto';
import { ChatClient, ChatPost, ConversationContext, ProjectChainResponse } from '../chat/chatClient';
import 'reflect-metadata';
import { Agent, HandleActivity, ResponseType } from "./agents";
import { saveToFile } from "../tools/storeToFile";
import ResearchWorkflow from "./workflows/researchWorkflow";
import EmailWorkflow from "./workflows/emailWorkflow";
import { Project, TaskManager } from "src/tools/taskManager";
import { ResearchProject, ResearchTask } from "./assistant";

enum ActivityType {
    DraftEmail = "draft-email",
    WebResearch = "web-research"
}

interface ResearchManagerContext extends ConversationContext {
    activityType: ActivityType;
}

export class ResearchManager extends Agent<ResearchProject, ResearchTask> {
    private USER_TOKEN: string;

    constructor(chatUserToken: string, userId: string, chatClient: ChatClient, lmStudioService: LMStudioService, projects: TaskManager) {
        super(chatClient, lmStudioService, userId, projects);
        this.USER_TOKEN = chatUserToken;
    }

    public async initialize() {
        await this.chromaDBService.initializeCollection(CHROMA_COLLECTION);
        await super.setupChatMonitor(PROJECTS_CHANNEL_ID, "@research");
    }

    protected taskNotification(task: ResearchTask): void {
        
    }

    protected async projectCompleted(project: ResearchProject): Promise<void> {
        const workflow = new ResearchWorkflow(project.id, project.name, this.lmStudioService, this, this.projects, this.chromaDBService);
        const aggregatedData = await workflow.aggregateResults();
        const overallSummary = await workflow.createFinalReport(aggregatedData);

        await this.chatClient.postReply(project.postId, PROJECTS_CHANNEL_ID, overallSummary);

        // Save the report to a file
        const filePath = await saveToFile(project.id, "report", "v1", overallSummary);

        Logger.info(`Report saved to ${filePath}`);
    }

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

    @HandleActivity('web-research', "Initiate research for user request", ResponseType.CHANNEL)
    private async handleWebResearch(channelId: string, post: ChatPost) {
        const projectId = randomUUID();

        const workflow = new ResearchWorkflow(projectId, post.message, this.lmStudioService, this, this.projects, this.chromaDBService);
        await workflow.decomposeTask(post.message);

        const projectPost = await this.replyWithProjectId(ActivityType.WebResearch, projectId, channelId, post);
        
        // tell the user
        await workflow.postTaskList(workflow, channelId, projectPost);

        // post each task to researchers in research channel
        await workflow.postTasksToResearchers();
    }

    @HandleActivity('draft-email', "Perform copy-editing to create an email draft.", ResponseType.CHANNEL)
    private async handleDraftEmail(channelId: string, post: ChatPost) {
        const projectId = randomUUID();
        Logger.info("Kicking off draft email workflow");
        
        const emailDraftWorkflow = new ResearchWorkflow(projectId, post.message, this.lmStudioService, this, this.projects, this.chromaDBService);
        await emailDraftWorkflow.decomposeTask(post.message);

        // Initialize a ResearchAssistant for the email draft
        emailDraftWorkflow.distributeTasks(this);

        const projectPost = await this.replyWithProjectId(ActivityType.DraftEmail, projectId, channelId, post);

        const taskListMessage = await this.postTaskList(emailDraftWorkflow, channelId, projectPost);
    }

    @HandleActivity('web-research', "Response to initial web research", ResponseType.RESPONSE)
    private async continueWebResearch(projectChain: ProjectChainResponse, post: ChatPost): Promise<void> {
        if (post.getRootId()) {
            const workflow = new ResearchWorkflow(projectChain.projectId, post.message, this.lmStudioService, this, this.projects, this.chromaDBService);
            const reply = await workflow.generateResearchReply(projectChain.posts);
            await this.chatClient.postReply(post.getRootId()||"", post.channel_id, reply);
        } else {
            Logger.error("No root ID found in the project chain.")
        }
    }

    @HandleActivity('draft-email', "Alter the original email based on comments", ResponseType.RESPONSE)
    private async continueDraftEmail(projectChain: ProjectChainResponse, post: ChatPost): Promise<void> {
        // Generate a draft email based on the conversation history and the new message
        // const response = await this.lmStudioService.sendMessageToLLM(`Please draft an email based on this conversation: ${post.message}`, projectChain.posts);

        const workflow = new EmailWorkflow(projectChain.projectId, post.message, this.lmStudioService);
        const response = await workflow.generateEmailReply(projectChain.posts);
        //projectChain.posts.slice(1), projectChain.posts[0].message

        // Send the draft email back to the user
        await this.chatClient.postReply(post.getRootId(), post.channel_id, `Here is your draft email:\n\n${response}`);
    }

    private async fetchResearcherMessages(): Promise<ChatPost[]> {
        return this.chatClient.fetchPreviousMessages(WEB_RESEARCH_CHANNEL_ID);
    }

    public addProject() : ResearchProject {
        const p : ResearchProject = {
            id: randomUUID(),
            name: "New Project",
            tasks: {}
        };
        this.projects.addProject(p);
        return p;
    }
}