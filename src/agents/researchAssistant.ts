import { StepBasedAgent } from './stepBasedAgent';
import { HandleActivity, HandlerParams, ResponseType } from './agents';
import { ChatClient, ChatPost } from '../chat/chatClient';
import LMStudioService from '../llm/lmstudioService';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { TaskManager } from '../tools/taskManager';
import { Project, Task } from '../tools/taskManager';
import { WebSearchExecutor } from './research/WebResearchExecutor';
import SearchHelper, { DuckDuckGoProvider } from '../helpers/searchHelper';
import ScrapeHelper from '../helpers/scrapeHelper';
import SummaryHelper from '../helpers/summaryHelper';
import Logger from '../helpers/logger';
import { CHROMA_COLLECTION, MAX_SEARCHES, RESEARCHER_TOKEN, WEB_RESEARCH_CHANNEL_ID } from '../helpers/config';
import { Artifact } from 'src/tools/artifact';
import { ModelMessageResponse, RequestArtifacts, CreateArtifact } from '../schemas/ModelResponse';
import ChromaDBService from 'src/llm/chromaService';
import { KnowledgeCheckExecutor } from './executors/checkKnowledgeExecutor';
import { ValidationExecutor } from './executors/ValidationExecutor';
import { FinalResponseExecutor } from './executors/FinalResponseExecutor';
import { ModelHelpers } from 'src/llm/helpers';
import { AgentConstructorParams } from './interfaces/AgentConstructorParams';


export interface ResearchProject extends Project<Task> {
    postId: string;
}

class ResearchAssistant extends StepBasedAgent<ResearchProject, Task> {
    private searchHelper = new SearchHelper(new DuckDuckGoProvider(this.artifactManager));
    private scrapeHelper = new ScrapeHelper(this.artifactManager);
    private summaryHelper = new SummaryHelper();

    constructor(params: AgentConstructorParams) {
        super(params);
        this.modelHelpers = new ModelHelpers(params.llmService, params.userId);
        this.modelHelpers.setPurpose("You are a research assistant who thoroughly summarizes web results.");
        this.modelHelpers.setFinalInstructions("PROPER PROCESS: do a 'check-knowledge' first, then a 'validation' step to see if you can meet the goals. If not, then add 'web_search' and 'validation' as needed until you get the answer. Make sure your final step is a `final_response`");

        // Register step executors
        this.registerStepExecutor(new WebSearchExecutor(
            this.searchHelper,
            this.scrapeHelper,
            this.summaryHelper,
            params.llmService,
            this.artifactManager,
            this.modelHelpers
        ));
        this.registerStepExecutor(new ValidationExecutor(params.llmService));
        this.registerStepExecutor(new KnowledgeCheckExecutor(
            params.llmService, params.vectorDBService
        ));
        this.registerStepExecutor(new FinalResponseExecutor(this.modelHelpers));
    }
    
    public async initialize(): Promise<void> {
        Logger.info(`Initialized Research Assistant ${RESEARCHER_TOKEN}`);
        await this.scrapeHelper.initialize();
        await super.setupChatMonitor(WEB_RESEARCH_CHANNEL_ID, "@researchteam");

        // asynchronously check for old tasks and keep working on them
        this.processTaskQueue();
    }

    async processTask(task: Task) {
        Logger.info(`Notification for task ${task.id}: ${task.description}`);
        await this.scrapeUrl(task.projectId, task.description, task.description, task.id, []);
        await this.projects.completeTask(task.id);
    }

    protected projectCompleted(project: ResearchProject): void {
        Logger.info(`Project ${project.id} completed`);
    }

}

export default ResearchAssistant;
