import MattermostClient from './mattermostClient';
import OrchestratorWorkflow from './orchestratorWorkflow';
import ResearchAssistant from './assistant';
import { Post } from '@mattermost/types/posts';
import { ORCHESTRATOR_USER_ID, WEB_RESEARCH_CHANNEL_ID } from './config';
import { randomUUID } from 'crypto';

interface ConversationContext {
    projectId: string;
    assistant: ResearchAssistant;
    workflow: OrchestratorWorkflow;
}

export class MainOrchestrator {
    private USER_TOKEN: string;
    private PROJECTS_CHANNEL: string;
    private chatClient: MattermostClient;
    private conversations: Map<string, ConversationContext>;

    constructor(chatUserToken: string, projectsChannel: string) {
        this.USER_TOKEN = chatUserToken;
        this.PROJECTS_CHANNEL = projectsChannel;
        this.chatClient = new MattermostClient(this.USER_TOKEN, ORCHESTRATOR_USER_ID);
        this.conversations = new Map();
    }

    public initialize() {
        // Initialize the WebSocket client for real-time message listening
        this.chatClient.initializeWebSocket(async (post: Post) => {
            // Get the channel ID and user ID
            const channelId = post.channel_id;
            const userId = post.user_id;

            console.log(`Received message: ${post.message} in ${channelId} from ${userId}, with root id ${post.root_id}`);

            if (channelId === this.PROJECTS_CHANNEL) {
                let context: ConversationContext | undefined;

                if (!post.root_id) {
                    // New conversation
                    const projectId = randomUUID();

                    const workflow = new OrchestratorWorkflow(projectId, post.message);
                    await workflow.decomposeTask(post.message);

                    const assistant = new ResearchAssistant(projectId, post.message);
                    await assistant.initialize();
                    workflow.distributeTasks(assistant);

                    // Store context for the conversation
                    context = { projectId, assistant, workflow };
                    this.conversations.set(post.id, context);

                    const postProps: Record<string, any> = {
                        'project-id': projectId,
                        'conversation-root': post.id // Store the root post ID for future reference
                    };
    
                    // Send a response back to the channel
                    const responseMessage = `I've received your request for a project! \n\n### Project ID: **${projectId}**`;
                    const projectPost = await this.chatClient.createPost(channelId, responseMessage, postProps);

                    // Send a response back to the channel
                    const taskListMessage = `
Strategy: ${workflow.getStrategy()}

Tasks distributed successfully:
${workflow.getTasks().map(({ prompt, taskId }) => ` - Task ID: ${taskId} | ${prompt}`).join("\n")}`;

                    const taskPost = await this.chatClient.postReply(projectPost.id, channelId, taskListMessage);

                    // Continue conversation
                    await context.assistant.performSearchAndScrape();

                    const aggregatedData = await context.workflow.aggregateResults();

                    const answer = await context.workflow.createFinalReport(aggregatedData);
                    await this.chatClient.postReply(projectPost.id, channelId, answer);

                } else {
                    const projectChain = await this.chatClient.findProjectChain(post.channel_id, post.root_id)

                    const workflow = new OrchestratorWorkflow(projectChain.projectId, post.message);
                    const answer = await workflow.generateReply(projectChain.posts, post.message);
                    
                    await this.chatClient.postReply(post.root_id, channelId, answer);
                }
            }
        });

        this.chatClient.ws.on('open', () => {
            console.log('WebSocket connection opened');
        });
    
        this.chatClient.ws.on('close', () => {
            console.log('WebSocket connection closed');
        });
    
        this.chatClient.ws.on('error', (err) => {
            console.error('WebSocket error:', err);
        });
    }

    private async fetchResearcherMessages(): Promise<Post[]> {
        return this.chatClient.fetchPreviousMessages(WEB_RESEARCH_CHANNEL_ID);
    }
}