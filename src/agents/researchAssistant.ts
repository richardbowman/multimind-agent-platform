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
STEP STRATEGIES YOU SHOULD CONSIDER:

NEW-USER: For incoming new user requests, you can look for existing information in our knowledge base:
1) ${ExecutorType.CHECK_KNOWLEDGE}
2) ${ExecutorType.VALIDATION}

PROVIDED-URL: If the goal includes a specific complete URL, download it directly and then assess relevant links to also process:
1) ${ExecutorType.WEB_SCRAPE}: Scrape provided URL
2) ${ExecutorType.SELECT_LINKS}: Select child links from this page
3) ${ExecutorType.WEB_SCRAPE}: Scrape selected child links 

NO-EXISTING-KNOWLEDGE: Once, you've done an existing knowledge check and need to search:
1) ${ExecutorType.WEB_SEARCH}
2) ${ExecutorType.SELECT_LINKS}
3) ${ExecutorType.WEB_SCRAPE}
4) ${ExecutorType.FINAL_RESPONSE}

FOLLOW-UP: For follow-up requests where you've scraped some pages already, you can go deeper:
1) ${ExecutorType.SELECT_LINKS}: Select child links from this page
2) ${ExecutorType.WEB_SCRAPE}: Scrape selected child links 
3) ${ExecutorType.FINAL_RESPONSE}

IN YOUR REASONING, Explain the step strategies you considered.
`);

        // Register step executors
        this.registerStepExecutor(new SearchExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new LinkSelectionExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new WebScrapeExecutor(this.getExecutorParams()));
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
