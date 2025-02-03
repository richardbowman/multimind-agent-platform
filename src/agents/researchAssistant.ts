import { StepBasedAgent } from './stepBasedAgent';
import { Project, Task } from '../tools/taskManager';
import { WebSearchExecutor } from './executors/WebResearchExecutor';
import SearchHelper from '../helpers/searchHelper';
import ScrapeHelper from '../helpers/scrapeHelper';
import Logger from '../helpers/logger';
import { KnowledgeCheckExecutor } from './executors/KnowledgeCheckExecutor';
import { ValidationExecutor } from './executors/ValidationExecutor';
import { FinalResponseExecutor } from './executors/FinalResponseExecutor';
import { AgentConstructorParams } from './interfaces/AgentConstructorParams';
import { ExecutorType } from './interfaces/ExecutorType';
import { SearchExecutor } from './executors/WebSearchExecutor';
import { LinkSelectionExecutor } from './executors/LinkSelectionExecutor';
import { WebScrapeExecutor } from './executors/WebScrapeExecutor';
import { ModelHelpers } from '../llm/modelHelpers';
import { GoalConfirmationExecutor } from './executors/GoalConfirmationExecutor';
import { UrlExecutor } from './executors/UrlExecutor';

export interface ResearchProject extends Project {
    postId: string;
}

export class ResearchAssistant extends StepBasedAgent {
    private searchHelper: SearchHelper;
    private scrapeHelper: ScrapeHelper;

    constructor(params: AgentConstructorParams) {
        super(params);
        this.supportsDelegation = true;

        this.searchHelper = SearchHelper.create(params.settings, this.artifactManager);
        this.scrapeHelper = new ScrapeHelper(this.artifactManager, params.settings);

        this.modelHelpers.setPurpose("You are a research assistant who performs web searches to meet the goal.");
        this.modelHelpers.setFinalInstructions(`
IN YOUR REASONING, Explain the step strategies you considered.
`);

        // Define step sequences
        this.modelHelpers.addStepSequence("NEW-USER", "For incoming new user requests, check existing knowledge base and validate.", [
            { type: ExecutorType.GOAL_CONFIRMATION, description: "Confirm and restate the user's goal clearly with context for other steps." },
            { type: ExecutorType.CHECK_KNOWLEDGE, description: "Check existing knowledge base" },
            { type: ExecutorType.VALIDATION, description: "Validate information" }
        ]);

        this.modelHelpers.addStepSequence("PROVIDED-URL", "If the goal includes a specific complete URL, download and process relevant links.", [
            { type: ExecutorType.URL_EXTRACT, description: "Extract the URLs from the task information" },
            { type: ExecutorType.WEB_SCRAPE, description: "Scrape provided URL" },
            { type: ExecutorType.SELECT_LINKS, description: "Select child links from this page" },
            { type: ExecutorType.WEB_SCRAPE, description: "Scrape selected child links" },
            { type: ExecutorType.FINAL_RESPONSE, description: "Provide final response" }
        ]);

        this.modelHelpers.addStepSequence("NO-EXISTING-KNOWLEDGE", "Search, process links, and provide final response.", [
            { type: ExecutorType.WEB_SEARCH, description: "Perform web search" },
            { type: ExecutorType.SELECT_LINKS, description: "Select child links from search results" },
            { type: ExecutorType.WEB_SCRAPE, description: "Scrape selected child links" },
            { type: ExecutorType.FINAL_RESPONSE, description: "Provide final response" }
        ]);

        this.modelHelpers.addStepSequence("FOLLOW-UP", "For follow-up requests, process deeper.", [
            { type: ExecutorType.SELECT_LINKS, description: "Select child links from this page" },
            { type: ExecutorType.WEB_SCRAPE, description: "Scrape selected child links" },
            { type: ExecutorType.FINAL_RESPONSE, description: "Provide final response" }
        ]);

        // Register step executors
        this.registerStepExecutor(new UrlExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new GoalConfirmationExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new SearchExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new LinkSelectionExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new WebScrapeExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new ValidationExecutor(this.getExecutorParams()));
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
