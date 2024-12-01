import LMStudioService from "./llm/lmstudioService";
import Logger from "src/helpers/logger";
import JSON5 from 'json5';
import { CHAT_MODEL, CHROMA_COLLECTION, ORCHESTRATOR_USER_ID } from './helpers/config';
import { randomUUID } from 'crypto';
import Workflow from "./workflow";
import { ChatPost } from "./chat/chatClient";

export default class EmailWorkflow extends Workflow {

    constructor(projectId: string, researchActivity: string, lmStudioService: LMStudioService) {
        super(projectId, researchActivity, lmStudioService)
    }

    async decomposeTask(task: string) {
        this.goal = task;
        try {
            const systemPrompt = `
You are a content editor. Follow the following steps:
1) Analyze the user's request and develop an overarching strategy for satisyfing the request.
2) Decompose the goal from the user into tasks. For each individual task you list, we will give you more thinking time to accomplish it.

Provide only a JSON object in the format:
{
    "strategy": "",
    "tasks": [
        {
            "name": "",
            "description": ""
        }
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
            if (responseJSON.tasks) {
                for (const task of responseJSON.tasks) {
                    const taskId = randomUUID();
                    this.tasks.push({ description: `${task.name}: ${task.description}`, taskId });
                }
            } else {
                throw new Error('Invalid response from LM Studio API');
            }
        } catch (error) {
            Logger.error('Error decomposing task:', error);
            process.exit(1);
        }
    }

    async generateEmailReply(chatHistory: ChatPost[]): Promise<string> {
        try {
            const systemPrompt = `
You are a copy editor. Generate the email requested by the user's original prompt.

You've already designed the overall goals for the email.
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

    public getGoal() {
        return this.goal;
    }
}