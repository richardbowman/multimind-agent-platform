import LMStudioService from "../../llm/lmstudioService";
import ChromaDBService from "../../llm/chromaService";
import Logger from "src/helpers/logger";
import { ORCHESTRATOR_USER_ID } from '../../helpers/config';
import { ChatPost } from "../../chat/chatClient";
import { TaskManager } from "src/tools/taskManager";

class Workflow<Project, Task, Agent> {
    protected lmStudioService: LMStudioService;

    protected goal: string;
    protected tasks: Task[] = [];
    protected projectId: string;

    protected taskManager: TaskManager;
    protected chromaDBService: ChromaDBService;

    constructor(
            projectId: string,
            researchActivity: string,
            lmStudioService: LMStudioService,
            taskManager: TaskManager,
            chromaDBService: ChromaDBService
        ) {
        this.taskManager = taskManager;

        this.projectId = Math.random().toString();
        this.goal = researchActivity;
        this.projectId = projectId;
        this.lmStudioService = lmStudioService;
        this.chromaDBService = chromaDBService;
    }

    protected async generateReply(systemPrompt: string, chatHistory: ChatPost[]): Promise<string> {
        try {
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

                const response = await this.lmStudioService.sendMessageToLLM(history.slice(-1)[0].content, history.slice(0, -1), undefined, 4096);

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

    distributeTasks(assistant: Agent) {
        Logger.info(`Distributing ${this.tasks.length} tasks`);
        for (const { description: prompt, taskId } of this.tasks) {
            assistant.receiveTask(prompt, taskId); // Pass the task ID to the ResearchAssistant
        }
    }
    
    public getTasks() : Task[] {
        return this.tasks;
    }

    public getGoal() {
        return this.goal;
    }
}

export default Workflow;