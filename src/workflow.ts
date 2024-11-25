import LMStudioService from "./llm/lmstudioService";
import ResearchAssistant from "./assistant";
import ChromaDBService from "./llm/chromaService";
import Logger from "src/helpers/logger";
import { CHAT_MODEL, CHROMA_COLLECTION, ORCHESTRATOR_USER_ID } from './config';
import { ChatPost } from "./chat/chatClient";

const lmstudioService = new LMStudioService();
lmstudioService.initializeLlamaModel(CHAT_MODEL).catch(err => {
    Logger.error("Failed to initialize LLaMA model:", err);
});

export interface Task {
    description: string;
    taskId: string;
}

class Workflow {
    protected chromaDBService: ChromaDBService;

    protected goal: string;
    protected tasks: Task[] = [];
    protected projectId: string;

    constructor(projectId: string, researchActivity: string) {
        this.chromaDBService = new ChromaDBService();

        this.projectId = Math.random().toString();
        this.goal = researchActivity;
        this.projectId = projectId;
    }

    protected async generateReply(systemPrompt: string, chatHistory: ChatPost[]): Promise<string> {
        try {
            await this.chromaDBService.initializeCollection(CHROMA_COLLECTION);

    
            // Query ChromaDB for related documents
            const queryTexts = chatHistory.map(h => h.message.slice(0, 100));
            Logger.info(`QUERY TEXTS: ${chatHistory.length}`, queryTexts)
            const where: any = {
                "$and": [
                    { "type": { "$eq": "summary" } },
                    { "projectId": { "$eq": this.projectId } }
                ]
            };
            const nResults = 10;
            try {
                Logger.info(`Querying ChromaDB filter ${JSON.stringify(where)} for ${JSON.stringify(queryTexts)} queries`);
                
                const query = await this.chromaDBService.query(queryTexts, where, 3);

                let history = [
                    { role: "system", content: `${systemPrompt} Context:\n\n${query.documents.join("\n\n")} `  }
                ];
    
                // Append existing chat history
                history = [...history, ...(chatHistory.map((chat) => (chat.user_id === ORCHESTRATOR_USER_ID ?
                    { role: "assistant", content: chat.message } :
                    { role: "user", content: chat.message })))
                ];
    
                // Append query results to chat history
                // if (query.documents.length > 0) {
                //     history[history.length-1].content = `${history[history.length-1].content}`;
                // }

                const response = await lmstudioService.sendMessageToLLM(history.slice(-1)[0].content, history.slice(0, -1), undefined, 4096);

                // Return the generated report
                return response;
    
            } catch (error) {
                Logger.error('Error querying ChromaDB:', error);
            }
        } catch (error) {
            Logger.error('Error generating final report:', error);
            throw error;
        }
    }

    distributeTasks(assistant: ResearchAssistant) {
        Logger.info(`Distributing ${this.tasks.length} tasks`);
        for (const { description: prompt, taskId } of this.tasks) {
            assistant.receiveTask(prompt, taskId); // Pass the task ID to the ResearchAssistant
        }
    }
    
    public getTasks() {
        return this.tasks;
    }

    public getStrategy() {
        return this.goal;
    }
}

export default Workflow;