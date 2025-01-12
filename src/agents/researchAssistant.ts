import { StepBasedAgent } from './stepBasedAgent';
import { Project, Task } from '../tools/taskManager';
import { WebSearchExecutor } from './research/WebResearchExecutor';
import SearchHelper from '../helpers/searchHelper';
import ScrapeHelper from '../helpers/scrapeHelper';
import Logger from '../helpers/logger';
import { KnowledgeCheckExecutor } from './executors/checkKnowledgeExecutor';
import { ValidationExecutor } from './executors/ValidationExecutor';
import { FinalResponseExecutor } from './executors/FinalResponseExecutor';
import { AgentConstructorParams } from './interfaces/AgentConstructorParams';


export interface ResearchProject extends Project<Task> {
    postId: string;
}

export class ResearchAssistant extends StepBasedAgent {
    private searchHelper: SearchHelper;
    private scrapeHelper: ScrapeHelper;

    constructor(params: AgentConstructorParams) {
        super(params);

        this.searchHelper = SearchHelper.create(params.settings, this.artifactManager);
        this.scrapeHelper = new ScrapeHelper(this.artifactManager, params.settings);

        this.modelHelpers.setPurpose("You are a research assistant who thoroughly summarizes web results.");
        this.modelHelpers.setFinalInstructions("PROPER PROCESS: do a 'check-knowledge' first, then a 'validation' step to see if you can meet the goals. If not, then add 'web_search' and 'validation' as needed until you get the answer. Make sure your final step is a `final_response`");

        // Create standardized params
        const executorParams = {
            llmService: params.llmService,
            taskManager: params.taskManager,
            artifactManager: this.artifactManager,
            vectorDBService: params.vectorDBService,
            userId: params.userId,
            searchHelper: this.searchHelper,
            scrapeHelper: this.scrapeHelper,
            modelHelpers: this.modelHelpers
        };

        // Register step executors
        this.registerStepExecutor(new WebSearchExecutor(executorParams));
        this.registerStepExecutor(new ValidationExecutor(executorParams));
        this.registerStepExecutor(new KnowledgeCheckExecutor(executorParams));
        this.registerStepExecutor(new FinalResponseExecutor(executorParams));
    }
    
    public async initialize(): Promise<void> {
        Logger.info(`Initializing scraper for research assistant`);
        await this.scrapeHelper.initialize();

        // TODO BRING BACK WHEN SAFER check for old tasks on boot and keep working on them
        this.processTaskQueue();
    }
}
