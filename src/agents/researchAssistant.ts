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
import { ExecutorType } from './interfaces/ExecutorType';
import { SearchExecutor } from './executors/WebSearchExecutor';
import { LinkSelectionExecutor } from './executors/LinkSelectionExecutor';
import { WebScrapeExecutor } from './executors/WebScrapeExecutor';


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

Once, you've done an existing knowledge check and need to search:
1) ${ExecutorType.WEB_SEARCH}
2) ${ExecutorType.SELECT_LINKS}
3) ${ExecutorType.WEB_SCRAPE}
4) ${ExecutorType.FINAL_RESPONSE}
`);

        // Register step executors
        this.registerStepExecutor(new SearchExecutor(this.getExecutorParams());
        this.registerStepExecutor(new LinkSelectionExecutor(this.getExecutorParams());
        this.registerStepExecutor(new WebScrapeExecutor(this.getExecutorParams());
        // this.registerStepExecutor(new ValidationExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new KnowledgeCheckExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new FinalResponseExecutor(this.getExecutorParams()));
    }
    
    public async initialize(): Promise<void> {
        Logger.info(`Initializing scraper for research assistant`);
        await this.scrapeHelper.initialize();

        // TODO BRING BACK WHEN SAFER check for old tasks on boot and keep working on them
        this.processTaskQueue();
    }
}
