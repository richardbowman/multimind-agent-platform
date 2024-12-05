// import LMStudioService from "../../llm/lmstudioService";
// import ResearchAssistant, { ResearchProject, ResearchTask } from "../assistant";
// import Logger from "src/helpers/logger";
// import JSON5 from 'json5';
// import { CHAT_MODEL, CHROMA_COLLECTION, ORCHESTRATOR_USER_ID, RESEARCHER_USER_ID, WEB_RESEARCH_CHANNEL_ID } from '../../helpers/config';
// import { randomUUID } from 'crypto';
// import Workflow from "./workflow";
// import { ChatPost } from "../../chat/chatClient";
// import { ResearchManager } from "../researchManager";
// import { SystemPromptBuilder } from "../../helpers/systemPrompt";
// import { TaskManager } from "src/tools/taskManager";
// import ChromaDBService from "src/llm/chromaService";

// class ResearchWorkflow extends Workflow<ResearchProject, ResearchTask, ResearchAssistant> {
//     private orchestrator: ResearchManager;

//     constructor(
//             projectId: string,
//             researchActivity: string,
//             lmStudioService: LMStudioService,
//             orchestrator: ResearchManager,
//             projects: TaskManager,
//             chromaDBService: ChromaDBService
//         ) {
//         super(projectId, researchActivity, lmStudioService, projects, chromaDBService);
//         this.orchestrator = orchestrator;
//     }

//     async decomposeTask(task: string) {
//         this.goal = task;
//         try {
//             const systemPrompt = new SystemPromptBuilder().build(`
// You are a research orchestrator. Follow the following steps:
// 1) Restate the user's goal.
// 2) Analyze the user's request and explain how you will satisfy the request.
// 3) Specify a MAXIMUM of ${process.env.MAX_RESEARCH_REQUESTS} research requests. Use as FEW AS POSSIBLE to satisfy the request.

// Provide only a JSON object in the format:
// {
//     "goal": "User wants to ...",
//     "strategy": "I will search for ...",
//     "researchRequested": [
//         "Please look for X",
//         ...
//     ]
// }
// `);

//             const userPrompt = task;
//             const history = [
//                 { role: "system", content: systemPrompt }
//             ];
//             const response = await this.lmStudioService.sendMessageToLLM(userPrompt, history, "{");

//             // Parse the response to extract prompts
//             const responseJSON = JSON5.parse(response);
//             if (responseJSON.goal) {
//                 this.goal = responseJSON.goal;
//             }
//             if (responseJSON.researchRequested) {
//                 for (const task of responseJSON.researchRequested) {
//                     const taskId = randomUUID();
//                     this.tasks.push(new ResearchTask(taskId, this.projectId, task, ORCHESTRATOR_USER_ID));
//                 }
//             } else {
//                 throw new Error('Invalid response from LM Studio API');
//             }
//         } catch (error) {
//             Logger.error('Error decomposing task:', error);
//             process.exit(1);
//         }
//     }

//     async postTaskList(workflow: ResearchWorkflow, channelId: string, projectPost: ChatPost) : Promise<ChatPost> {
//         // Send details back to the channel
//         const taskListMessage = `
// Goal: ${workflow.getGoal()}
// Project Type: Web Research
// Tasks distributed successfully:
// ${workflow.getTasks().map(({ description }) => ` - ${description}`).join("\n")}`;

//         const taskPost = await this.orchestrator.chatClient.postReply(projectPost.id, channelId, taskListMessage);
//         return taskPost;
//     }    


//     async postTasksToResearchers() {
//         const p = await this.orchestrator.addProject();
//         p.name = this.goal;

//         Logger.info(`Distributing ${Object.keys(p.tasks).length} tasks`);
//         for (const task of this.getTasks()) {
//             p.tasks[task.id] = task;
//             this.orchestrator.projects.addTask(p, task);
//             this.orchestrator.projects.assignTaskToAgent(task.id, RESEARCHER_USER_ID);
//         }
//     }

//     async aggregateResults(): Promise<string> {
//         Logger.info(`Aggregating results for ${this.projectId}`);

//         // Save the original research activity to ChromaDB

//         // Query ChromaDB for related documents
//         const queryTexts = [this.goal];
//         const where: any = {
//             "$and": [
//                 { "type": { "$eq": "summary" } },
//                 { "projectId": { "$eq": this.projectId } }
//             ]
//         };
//         const nResults = 10;

//         try {
//             const response = await this.chromaDBService.query(queryTexts, where, 3);
//             Logger.info(`Query Results: ${response.documents.join("\n\n")}`);
            
//             // Combine the original aggregated data with query results
//             return response.documents.join("\n\n");
//         } catch (error) {
//             Logger.error('Error querying ChromaDB:', error);
//             throw error;
//         }
//     }

//     async createFinalReport(aggregatedData: string): Promise<string> {
//         try {
//             const systemPrompt = `
// You are a research manager. Your team of research assistants have done web searches to look up things based on your task list. Generate a comprehensive report based on the aggregated data and the user's original prompt.

// Provide as a detailed explanation of the findings, including relevant details from the aggregated data. Do not make up information not provided in the aggregated data.
// `;
//             const userPrompt = `Original Prompt: ${this.goal}\nAggregated Data:\n${aggregatedData}`;
//             const history = [
//                 { role: "system", content: systemPrompt }
//             ];
//             const response = await this.lmStudioService.sendMessageToLLM(userPrompt, history, undefined, 4096, 8192);

//             // Return the generated report
//             return response;
//         } catch (error) {
//             Logger.error('Error generating final report:', error);
//             throw error;
//         }
//     }

//     async generateResearchReply(chatHistory: ChatPost[]): Promise<string> {
//         try {
//             const systemPrompt = `
// You are a research manager. Your team of research assistants have done web searches to look up things based on the original task list. Generate a comprehensive report based on the aggregated data and the user's original prompt.

// You've already provided a detailed explanation of the findings. Now the user is responding with questions or followups. Do not make up information not specified previous or provided in query results.
// `;

//             return this.generateReply(systemPrompt, chatHistory);
//         } catch (error) {
//             Logger.error('Error generating final report:', error);
//             throw error;
//         }
//     }

//     public getTasks() {
//         return this.tasks;
//     }

//     public getGoal() {
//         return this.goal;
//     }
// }

// export default ResearchWorkflow;