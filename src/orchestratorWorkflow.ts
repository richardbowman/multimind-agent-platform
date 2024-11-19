import LMStudioService from "./lmstudioService";
import ResearchAssistant from "./assistant";
import ChromaDBService from "./chromaService";
import JSON5 from 'json5';
import { CHAT_MODEL, CHROMA_COLLECTION, ORCHESTRATOR_USER_ID } from './config';
import { Post } from "@mattermost/types/posts";
import { randomUUID } from 'crypto';

const lmstudioService = new LMStudioService();
lmstudioService.initializeLlamaModel(CHAT_MODEL).catch(err => {
    console.error("Failed to initialize LLaMA model:", err);
});

class OrchestratorWorkflow {
    private researchActivity: string;
    private promptsWithIds: { prompt: string, taskId: string }[] = [];
    private chromaDBService: ChromaDBService;
    private projectId: string;

    constructor(projectId: string, researchActivity: string) {
        this.projectId = Math.random().toString();
        this.researchActivity = researchActivity;
        this.chromaDBService = new ChromaDBService();
        this.projectId = projectId;
    }

    async decomposeTask(task: string) {
        this.researchActivity = task;
        try {
            const systemPrompt = `
You are a research orchestrator. Follow the following steps:
1) Analyze the user's request and develop an overarching strategy for satisyfing the request.
2) Decompose the goal from the user into projects and tasks. Each individual task will be provided
   to research assistants who will perform internet searches for your request.

Provide only a JSON object in the format:
{
    "strategy": "",
    "projects": [
        {
            "name": "",
            "description": "",
            "tasks": [
                {
                    "name": "",
                    "description": ""
                }
            ]
        }
    ]
}
`;
            const userPrompt = task;
            const history = [
                { role: "system", content: systemPrompt }
            ];
            const response = await lmstudioService.sendMessageToLLM(userPrompt, history, "{");
            // console.log("Response:", response);


            // Parse the response to extract prompts
            const responseJSON = JSON5.parse(response);
            if (responseJSON.strategy) {
                this.researchActivity = responseJSON.strategy;
            }
            if (responseJSON.projects) {
                for (const project of responseJSON.projects) {
                    if (project.tasks) {
                        for (const task of project.tasks) {
                            const taskId = randomUUID();
                            this.promptsWithIds.push({ prompt: `${task.name}: ${task.description}`, taskId });
                        }
                    }
                }
            } else {
                throw new Error('Invalid response from LM Studio API');
            }
        } catch (error) {
            console.error('Error decomposing task:', error);
            process.exit(1);
        }

        // console.log('Decomposed Prompts:', this.prompts);
    }

    distributeTasks(assistant: ResearchAssistant) {
        for (const { prompt, taskId } of this.promptsWithIds) {
            assistant.receiveTask(prompt, taskId); // Pass the task ID to the ResearchAssistant
        }
    }

    async aggregateResults(): Promise<string> {
        await this.chromaDBService.initializeCollection(CHROMA_COLLECTION);

        console.log('Aggregating results...', this.projectId);

        // Save the original research activity to ChromaDB

        // Query ChromaDB for related documents
        const queryTexts = [this.researchActivity];
        const where: any = {
            "$and": [
                { "type": { "$eq": "summary" } },
                { "projectId": { "$eq": this.projectId } }
            ]
        };
        const nResults = 10;

        try {
            const response = await this.chromaDBService.query(queryTexts, where, 3);
            console.log("Query Results:", response);

            // Combine the original aggregated data with query results
            return response.documents.join("\n\n");
        } catch (error) {
            console.error('Error querying ChromaDB:', error);
            throw error;
        }
    }

    async createFinalReport(aggregatedData: string): Promise<string> {
        try {
            const systemPrompt = `
You are a research manager. Your team of research assistants have done web searches to look up things based on your task list. Generate a comprehensive report based on the aggregated data and the user's original prompt.

Provide as a detailed explanation of the findings, including relevant details from the aggregated data. Do not make up information not provided in the aggregated data.
`;
            const userPrompt = `Original Prompt: ${this.researchActivity}\nAggregated Data:\n${aggregatedData}`;
            const history = [
                { role: "system", content: systemPrompt }
            ];
            const response = await lmstudioService.sendMessageToLLM(userPrompt, history, undefined, 4096, 8192);

            // Return the generated report
            return response;
        } catch (error) {
            console.error('Error generating final report:', error);
            throw error;
        }
    }

    async generateReply(chatHistory: Post[], message: string): Promise<string> {
        try {
            await this.chromaDBService.initializeCollection(CHROMA_COLLECTION);

            const systemPrompt = `
You are a research manager. Your team of research assistants have done web searches to look up things based on the original task list. Generate a comprehensive report based on the aggregated data and the user's original prompt.

You've already provided a detailed explanation of the findings. Now the user is responding with questions or followups. Do not make up information not specified previous or provided in query results.
`;
            const userPrompt = message;

            // Query ChromaDB for related documents
            const queryTexts = [message];
            const where: any = {
                "$and": [
                    { "type": { "$eq": "summary" } },
                    { "projectId": { "$eq": this.projectId } }
                ]
            };
            const nResults = 10;

            // console.log(JSON.stringify(where, null, 2));

            let history = [
                { role: "system", content: systemPrompt }
            ];

            // Append existing chat history
            history = [...history, ...(chatHistory.map((chat) => (chat.user_id === ORCHESTRATOR_USER_ID ?
                { role: "assistant", content: chat.message } :
                { role: "user", content: chat.message })))
            ];

            try {
                const response = await this.chromaDBService.query(queryTexts, where, 3);
                console.log("Query Results:", response);

                // Append query results to chat history
                if (response.documents.length > 0) {
                    history.push({ role: "assistant", content: response.documents.join("\n\n") });
                }
            } catch (error) {
                console.error('Error querying ChromaDB:', error);
            }

            console.log(JSON.stringify(history, null, 2));

            const response = await lmstudioService.sendMessageToLLM(userPrompt, history, undefined, 4096);

            // Return the generated report
            return response;
        } catch (error) {
            console.error('Error generating final report:', error);
            throw error;
        }
    }

    public getTasks() {
        return this.promptsWithIds;
    }

    public getStrategy() {
        return this.researchActivity;
    }
}

export default OrchestratorWorkflow;