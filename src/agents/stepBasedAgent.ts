import { Agent, HandlerParams, ResponseType } from './agents';
import { ChatClient, ChatPost } from '../chat/chatClient';
import LMStudioService, { StructuredOutputPrompt } from '../llm/lmstudioService';
import { TaskManager } from '../tools/taskManager';
import Logger from '../helpers/logger';
import { CreateArtifact, ModelResponse, RequestArtifacts } from './schemas/ModelResponse';
import { Artifact } from '../tools/artifact';
import crypto from 'crypto';

export interface StepResult {
    type: string;
    [key: string]: any;
}

export interface AgentState {
    originalGoal: string;
    currentStep: string;
    intermediateResults: StepResult[];
    needsUserInput?: boolean;
    userQuestion?: string;
    existingArtifacts?: {
        id: string;
        title?: string;
        content: string;
        underlyingData?: any;
    }[];
}

export interface StepExecutor {
    execute(goal: string, step: string, state: AgentState): Promise<StepResult>;
}

export abstract class StepBasedAgent<P, T> extends Agent<P, T> {
    protected activeStates: Map<string, AgentState> = new Map();
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

    protected abstract planSteps(goal: string): Promise<{
        steps: string[];
        requiresUserInput: boolean;
        userQuestion?: string;
        existingArtifacts?: AgentState['existingArtifacts'];
    }>;

    protected async executeStep(state: AgentState, userPost: ChatPost): Promise<void> {
        try {
            let stepResult: StepResult;
            const executor = this.stepExecutors.get(state.currentStep);

            if (!executor) {
                throw new Error(`No executor found for step type: ${state.currentStep}`);
            }

            stepResult = await executor.execute(state.originalGoal, state.currentStep, state);
            state.intermediateResults.push(stepResult);

            // Determine next steps
            const nextAction = await this.determineNextAction(state);
            
            if (nextAction.needsUserInput) {
                state.needsUserInput = true;
                state.userQuestion = nextAction.question;
                if (nextAction.question) {
                    await this.reply(userPost, { message: nextAction.question });
                    return;
                }
            }

            if (nextAction.isComplete) {
                await this.generateAndSendFinalResponse(state, userPost);
                return;
            }

            // Continue with next step
            state.currentStep = nextAction.nextStep!;
            await this.executeStep(state, userPost);

        } catch (error) {
            Logger.error("Error in step execution:", error);
            await this.reply(userPost, { message: "Sorry, I encountered an error while processing your request." });
        }
    }

    private async determineNextAction(state: AgentState): Promise<{
        needsUserInput: boolean;
        question?: string;
        isComplete: boolean;
        nextStep?: string;
    }> {
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
                    description: "Next step if not complete"
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
        const context = JSON.stringify({
            originalGoal: state.originalGoal,
            currentStep: state.currentStep,
            results: state.intermediateResults
        }, null, 2);

        return await this.generate({
            message: context,
            instructions
        });
    }

    protected async generateAndSendFinalResponse(state: AgentState, userPost: ChatPost): Promise<void> {
        const finalResponse = await this.generateFinalResponse(state);
        
        const artifactId = crypto.randomUUID();
        const artifact = await this.artifactManager.saveArtifact({
            id: artifactId,
            type: 'summary',
            content: finalResponse.message,
            metadata: {
                title: `Summary: ${state.originalGoal}`,
                query: state.originalGoal,
                type: 'summary',
                steps: state.intermediateResults
            }
        });

        const response: CreateArtifact = {
            message: `${finalResponse.message}\n\n---\nYou can ask follow-up questions by replying with your question.`,
            artifactId: artifact.id,
            artifactTitle: artifact.metadata?.title
        };

        await this.reply(userPost, response);
    }

    private async generateFinalResponse(state: AgentState): Promise<ModelResponse> {
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
            originalGoal: state.originalGoal,
            results: state.intermediateResults
        }, null, 2);

        return await this.generate({
            message: context,
            instructions,
            maxTokens: 16384
        });
    }

    protected async handleUserInput(state: AgentState, userPost: ChatPost): Promise<void> {
        state.intermediateResults.push({
            type: 'user_input',
            question: state.userQuestion,
            answer: userPost.message
        });

        state.needsUserInput = false;
        await this.executeStep(state, userPost);
    }
}
