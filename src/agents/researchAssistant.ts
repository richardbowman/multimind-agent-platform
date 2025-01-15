import { StepBasedAgent } from './stepBasedAgent';
import { Project, Task } from '../tools/taskManager';
import { WebSearchExecutor } from './executors/WebResearchExecutor';
import SearchHelper from '../helpers/searchHelper';
import ScrapeHelper from '../helpers/scrapeHelper';
import Logger from '../helpers/logger';
import { KnowledgeCheckExecutor } from './executors/checkKnowledgeExecutor';
import { ValidationExecutor } from './executors/ValidationExecutor';
import { FinalResponseExecutor } from './executors/FinalResponseExecutor';
import { AgentConstructorParams } from './interfaces/AgentConstructorParams';
import { ExecutorType } from './executors/ExecutorType';


export interface ResearchProject extends Project {
    postId: string;
}

export class ResearchAssistant extends StepBasedAgent {
    private searchHelper: SearchHelper;
    private scrapeHelper: ScrapeHelper;

    constructor(params: AgentConstructorParams) {
        super(params);

        this.searchHelper = SearchHelper.create(params.settings, this.artifactManager);
        this.scrapeHelper = new ScrapeHelper(this.artifactManager, params.settings);

        this.modelHelpers.setPurpose("You are a research assistant who performs web searches to meet the goal.");
        this.modelHelpers.setFinalInstructions(`
For incoming new user requests, you should typically follow this order:
1) ${ExecutorType.CHECK_KNOWLEDGE}
2) ${ExecutorType.VALIDATION}
3) ${ExecutorType.FINAL_RESPONSE}

If you've already done this, you should follow this order:
1) ${ExecutorType.WEB_RESEARCH}
2) ${ExecutorType.VALIDATION}
3) ${ExecutorType.FINAL_RESPONSE}
`);

        // Create standardized params
        const executorParams = {
            llmService: params.llmService,
            taskManager: params.taskManager,
            artifactManager: this.artifactManager,
            vectorDBService: params.vectorDBService,
            userId: params.userId,
            searchHelper: this.searchHelper,
            scrapeHelper: this.scrapeHelper,
            modelHelpers: this.modelHelpers,
            vectorDB: params.vectorDBService,
            settings: params.settings
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
