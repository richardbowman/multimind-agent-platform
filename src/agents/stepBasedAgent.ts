import { Agent } from './agents';
import { ChatClient, ChatPost } from '../chat/chatClient';
import { HandleActivity, HandlerParams, ResponseType } from './agents';
import LMStudioService, { StructuredOutputPrompt } from '../llm/lmstudioService';
import { Task, TaskManager } from '../tools/taskManager';
import Logger from '../helpers/logger';
import { CreateArtifact, ModelResponse } from './schemas/ModelResponse';
import crypto from 'crypto';
//import { PlanStepsResponse } from './schemas/agent';

export interface StepResult {
    type?: string;
    projectId?: string;
    taskId?: string;
    finished?: boolean;
    [key: string]: any;
    needsUserInput?: boolean;
    response: ModelResponse;
}

export interface StepExecutor {
    execute(goal: string, step: string, projectId: string): Promise<StepResult>;
}

export abstract class StepBasedAgent<P, T> extends Agent<P, T> {
    protected stepExecutors: Map<string, StepExecutor> = new Map();

    constructor(
        chatClient: ChatClient,
        lmStudioService: LMStudioService,
        userId: string,
        projects: TaskManager
    ) {
        super(chatClient, lmStudioService, userId, projects);
    }

    protected registerStepExecutor(stepType: string, executor: StepExecutor): void {
        this.stepExecutors.set(stepType, executor);
    }

    protected async planSteps(projectId: string, latestGoal: string): Promise<PlanStepsResponse> {
        const registeredSteps = Array.from(this.stepExecutors.keys());
        
        const schema = {
            type: "object",
            properties: {
                steps: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            type: {
                                type: "string",
                                enum: registeredSteps,
                                description: "Type of step to execute"
                            },
                            description: {
                                type: "string",
                                description: "Description of what this step will accomplish"
                            },
                            existingId: {
                                type: "string",
                                description: "ID of existing step if this updates one"
                            }
                        },
                        required: ["type", "description"]
                    }
                }
            },
            required: ["steps"]
        };

        const systemPrompt = `You are planning the steps needed to accomplish a goal.
Break down the goal into logical steps using the available step types.
Consider dependencies and order of operations.
Each step should move closer to the final goal.`;

        const instructions = new StructuredOutputPrompt(schema, systemPrompt);
        
        return await this.generate({
            message: latestGoal,
            instructions
        });
    }

    protected async executeNextStep(projectId: string, userPost: ChatPost): Promise<void> {
        const task = this.projects.getNextTask(projectId);
        if (!task) {
            Logger.warn('No tasks found to execute');
            return;
        }
        this.projects.markTaskInProgress(task);
        await this.executeStep(projectId, task, userPost);
    }
    
    protected async executeStep(projectId: string, task: Task, userPost: ChatPost): Promise<void> {
        try {
            const currentStep = task.type;
            const executor = this.stepExecutors.get(currentStep);
            if (!executor) {
                throw new Error(`No executor found for step type: ${currentStep}`);
            }

            const project = this.projects.getProject(projectId);
            if (!project) {
                throw new Error(`Project ${projectId} not found`);
            }

            const stepResult = await executor.execute(project.name, currentStep, projectId);
            
            // // Create a task for this step result if one was returned
            // if (stepResult.taskId) {
            //     await this.projects.markTaskInProgress({
            //         id: stepResult.taskId,
            //         description: `${currentStep}: ${stepResult.description || 'Step completed'}`,
            //         creator: this.userId,
            //         projectId: projectId
            //     });
            // }
            if (stepResult.finished) {
                this.projects.completeTask(task.id);
            }

            // // Determine next steps
            // const nextAction = await this.determineNextAction(projectId, stepResult);
            
            if (stepResult.needsUserInput && stepResult.response) {
                await this.reply(userPost, stepResult.response, {
                    "project-id": projectId
                });
                return;
            }

            // if (nextAction.isComplete) {
            //     await this.generateAndSendFinalResponse(projectId, userPost);
            //     return;
            // }

            // Continue with next step
            await this.executeNextStep(projectId, userPost);

        } catch (error) {
            Logger.error("Error in step execution:", error);
            await this.reply(userPost, { message: "Sorry, I encountered an error while processing your request." });
        }
    }

    private async determineNextAction(projectId: string, lastStepResult: StepResult): Promise<{
        needsUserInput: boolean;
        question?: string;
        isComplete: boolean;
        nextStep?: string;
    }> {
        const registeredSteps = Array.from(this.stepExecutors.keys());
        
        const schema = {
            type: "object",
            properties: {
                needsUserInput: {
                    type: "boolean",
                    description: "Whether we need to ask the user a question"
                },
                question: {
                    type: "string",
                    description: "Question to ask the user if needed"
                },
                isComplete: {
                    type: "boolean",
                    description: "Whether we have enough information to generate final response"
                },
                nextStep: {
                    type: "string",
                    enum: registeredSteps,
                    description: `Next step to execute. Must be one of: ${registeredSteps.join(', ')}`
                }
            },
            required: ["needsUserInput", "isComplete"]
        };

        const systemPrompt = `You are an AI assistant analyzing intermediate results.
Based on the current state and results, determine if we:
1. Need to ask the user a question
2. Have enough information to generate a final response
3. Should continue with another step

Consider the original goal and what we've learned so far.`;

        const instructions = new StructuredOutputPrompt(schema, systemPrompt);
        const project = this.projects.getProject(projectId);
        const context = JSON.stringify({
            originalGoal: project.name,
            currentStep: lastStepResult.type,
            results: lastStepResult
        }, null, 2);

        return await this.generate({
            message: context,
            instructions
        });
    }

    protected async generateAndSendFinalResponse(projectId: string, userPost: ChatPost): Promise<void> {
        const project = this.projects.getProject(projectId);
        const finalResponse = await this.generateFinalResponse(project);
        
        const artifactId = crypto.randomUUID();
        const artifact = await this.artifactManager.saveArtifact({
            id: artifactId,
            type: 'summary',
            content: finalResponse.message,
            metadata: {
                title: `Summary: ${project.name}`,
                query: project.name,
                type: 'summary',
                steps: Object.values(project.tasks).map(t => t.description)
            }
        });

        const response: CreateArtifact = {
            message: `${finalResponse.message}\n\n---\nYou can ask follow-up questions by replying with your question.`,
            artifactId: artifact.id,
            artifactTitle: artifact.metadata?.title
        };

        await this.reply(userPost, response);
    }

    private async generateFinalResponse(project: Project<Task>): Promise<ModelResponse> {
        const schema = {
            type: "object",
            properties: {
                message: {
                    type: "string",
                    description: "Final comprehensive response in Markdown format."
                }
            },
            required: ["message"]
        };

        const systemPrompt = `You are an AI assistant generating a final response.
Synthesize all the intermediate results into a clear, comprehensive answer that addresses the original goal.
Include relevant details from all steps while maintaining clarity and coherence.
You will respond inside of the message key in Markdown format.`;

        const instructions = new StructuredOutputPrompt(schema, systemPrompt);
        const context = JSON.stringify({
            originalGoal: project.name,
            tasks: Object.values(project.tasks),
            results: Object.values(project.tasks).map(t => t.description)
        }, null, 2);

        return await this.generate({
            message: context,
            instructions,
            maxTokens: 16384
        });
    }

    protected async handleUserInput(projectId: string, currentStep: string, userPost: ChatPost): Promise<void> {
        const project = this.projects.getProject(projectId);
        if (!project) {
            throw new Error(`Project ${projectId} not found`);
        }

        // Create a task for the user input with order=0 to make it first
        const task = {
            id: randomUUID(),
            description: `User response: ${userPost.message}`,
            creator: this.userId,
            projectId: projectId,
            type: 'user_input',
            complete: true,
            order: 0 // This ensures it appears first
        };
        
        // Update order of existing tasks to make room
        for (const existingTask of Object.values(project.tasks)) {
            if (existingTask.order === undefined) {
                existingTask.order = 1;
            } else {
                existingTask.order += 1;
            }
        }
        
        await this.projects.addTask(project, task);
        
        // Continue execution
        await this.executeStep(projectId, currentStep, userPost);
    }
}
    @HandleActivity("start-thread", "Start conversation with user", ResponseType.CHANNEL)
    protected async handleConversation(params: HandlerParams): Promise<void> {
        const { projectId } = await this.addNewProject({
            projectName: params.userPost.message,
            tasks: [{
                type: "reply",
                description: "Initial response to user query."
            }]
        });

        const plan = await this.planSteps(projectId, params.userPost.message);
        await this.executeNextStep(projectId, params.userPost);
    }

    @HandleActivity("response", "Handle responses on the thread", ResponseType.RESPONSE)
    protected async handleThreadResponse(params: HandlerParams): Promise<void> {
        const project = params.projects?.[0];
        if (!project) {
            await this.reply(params.userPost, { 
                message: "No active session found. Please start a new conversation." 
            });
            return;
        }

        const currentTask = Object.values(project.tasks).find(t => t.inProgress);
        if (!currentTask) {
            await this.reply(params.userPost, { 
                message: "I wasn't expecting a response right now. What would you like to discuss?" 
            });
            return;
        }

        const plan = await this.planSteps(project.id, params.userPost.message);
        await this.executeNextStep(project.id, params.userPost);
    }
}

export { PlanStepsResponse };

