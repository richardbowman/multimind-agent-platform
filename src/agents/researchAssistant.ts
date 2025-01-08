import { StepBasedAgent } from './stepBasedAgent';
import { Project, Task } from '../tools/taskManager';
import { WebSearchExecutor } from './research/WebResearchExecutor';
import SearchHelper, { DuckDuckGoProvider } from '../helpers/searchHelper';
import ScrapeHelper from '../helpers/scrapeHelper';
import Logger from '../helpers/logger';
import { RESEARCHER_TOKEN, WEB_RESEARCH_CHANNEL_ID } from '../helpers/config';
import { KnowledgeCheckExecutor } from './executors/checkKnowledgeExecutor';
import { ValidationExecutor } from './executors/ValidationExecutor';
import { FinalResponseExecutor } from './executors/FinalResponseExecutor';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { AgentConstructorParams } from './interfaces/AgentConstructorParams';


export interface ResearchProject extends Project<Task> {
    postId: string;
}

export class ResearchAssistant extends StepBasedAgent<ResearchProject, Task> {
    private searchHelper = new SearchHelper(new DuckDuckGoProvider(this.artifactManager));
    private scrapeHelper = new ScrapeHelper(this.artifactManager);

    constructor(params: AgentConstructorParams) {
        super(params);

        this.modelHelpers.setPurpose("You are a research assistant who thoroughly summarizes web results.");
        this.modelHelpers.setFinalInstructions("PROPER PROCESS: do a 'check-knowledge' first, then a 'validation' step to see if you can meet the goals. If not, then add 'web_search' and 'validation' as needed until you get the answer. Make sure your final step is a `final_response`");

        // Register step executors
        this.registerStepExecutor(new WebSearchExecutor(
            this.searchHelper,
            this.scrapeHelper,
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

        // TODO BRING BACK WHEN SAFER check for old tasks on boot and keep working on them
        this.processTaskQueue();
    }
}
