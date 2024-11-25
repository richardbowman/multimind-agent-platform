import LMStudioService from "./llm/lmstudioService";
import ResearchAssistant from "./assistant";
import Logger from "src/helpers/logger";
import JSON5 from 'json5';
import { CHAT_MODEL, CHROMA_COLLECTION, ORCHESTRATOR_USER_ID, WEB_RESEARCH_CHANNEL_ID } from './config';
import { randomUUID } from 'crypto';
import Workflow from "./workflow";
import { ChatPost } from "./chat/chatClient";
import { MainOrchestrator } from "./orchestrator";

const lmstudioService = new LMStudioService();
lmstudioService.initializeLlamaModel(CHAT_MODEL).catch(err => {
    Logger.error("Failed to initialize LLaMA model:", err);
});

class ResearchWorkflow extends Workflow {

    constructor(projectId: string, researchActivity: string) {
        super(projectId, researchActivity);
    }

    async decomposeTask(task: string) {
        this.goal = task;
        try {
            const systemPrompt = `
You are a research orchestrator. Follow the following steps:
1) Analyze the user's request and explain how you will satisfy the request.
2) Specify a maximum of ${process.env.MAX_RESEARCH_REQUESTS} Internet research requests as possible to accomplish the goal.

Provide only a JSON object in the format:
{
    "strategy": "",
    "researchRequested": [
        "search query text"
    ]
}
`;

            const userPrompt = task;
            const history = [
                { role: "system", content: systemPrompt }
            ];
            const response = await lmstudioService.sendMessageToLLM(userPrompt, history, "{");

            // Parse the response to extract prompts
            const responseJSON = JSON5.parse(response);
            if (responseJSON.strategy) {
                this.goal = responseJSON.strategy;
            }
            if (responseJSON.researchRequested) {
                for (const task of responseJSON.researchRequested) {
                    const taskId = randomUUID();
                    this.tasks.push({ description: task, taskId });
                }
            } else {
                throw new Error('Invalid response from LM Studio API');
            }
        } catch (error) {
            Logger.error('Error decomposing task:', error);
            process.exit(1);
        }
    }

    async distributeTasks(orchestrator: MainOrchestrator, assistant: ResearchAssistant) {
        Logger.info(`Distributing ${this.tasks.length} tasks`);
        await orchestrator.chatClient.createPost(
            WEB_RESEARCH_CHANNEL_ID,
            `The goal is: ${this.goal}
            
            Please research to help find the right answer: \n\n` + this.tasks.map(task => `- ${task.description}`).join('\n'),
            { 
                'project-id': this.projectId,
                'user-id': ORCHESTRATOR_USER_ID,
                'activity-type': 'WebResearch'
            }
        )
    }

    async aggregateResults(): Promise<string> {
        await this.chromaDBService.initializeCollection(CHROMA_COLLECTION);

        Logger.info('Aggregating results...', this.projectId);

        // Save the original research activity to ChromaDB

        // Query ChromaDB for related documents
        const queryTexts = [this.goal];
        const where: any = {
            "$and": [
                { "type": { "$eq": "summary" } },
                { "projectId": { "$eq": this.projectId } }
            ]
        };
        const nResults = 10;

        try {
            const response = await this.chromaDBService.query(queryTexts, where, 3);
            Logger.info("Query Results:", response);

            // Combine the original aggregated data with query results
            return response.documents.join("\n\n");
        } catch (error) {
            Logger.error('Error querying ChromaDB:', error);
            throw error;
        }
    }

    async createFinalReport(aggregatedData: string): Promise<string> {
        try {
            const systemPrompt = `
You are a research manager. Your team of research assistants have done web searches to look up things based on your task list. Generate a comprehensive report based on the aggregated data and the user's original prompt.

Provide as a detailed explanation of the findings, including relevant details from the aggregated data. Do not make up information not provided in the aggregated data.
`;
            const userPrompt = `Original Prompt: ${this.goal}\nAggregated Data:\n${aggregatedData}`;
            const history = [
                { role: "system", content: systemPrompt }
            ];
            const response = await lmstudioService.sendMessageToLLM(userPrompt, history, undefined, 4096, 8192);

            // Return the generated report
            return response;
        } catch (error) {
            Logger.error('Error generating final report:', error);
            throw error;
        }
    }

    async generateResearchReply(chatHistory: ChatPost[]): Promise<string> {
        try {
            const systemPrompt = `
You are a research manager. Your team of research assistants have done web searches to look up things based on the original task list. Generate a comprehensive report based on the aggregated data and the user's original prompt.

You've already provided a detailed explanation of the findings. Now the user is responding with questions or followups. Do not make up information not specified previous or provided in query results.
`;

            return this.generateReply(systemPrompt, chatHistory);
        } catch (error) {
            Logger.error('Error generating final report:', error);
            throw error;
        }
    }

    public getTasks() {
        return this.tasks;
    }

    public getStrategy() {
        return this.goal;
    }
}

export default ResearchWorkflow;