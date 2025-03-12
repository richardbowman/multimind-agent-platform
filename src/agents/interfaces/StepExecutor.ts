import { Task, Project } from 'src/tools/taskManager';
import { ExecuteParams } from './ExecuteParams';
import { StepResponse, StepResult } from './StepResult';
import { GenerateInputParams, TaskEventType } from '../agents';
import { ChatPost } from 'src/chat/chatClient';
import { StepTask } from './ExecuteStepParams';
import { LLMContext } from 'src/llm/ILLMService';
import { ExecutorConstructorParams } from './ExecutorConstructorParams';
import { InputPrompt } from 'src/prompts/structuredInputPrompt';
import { ModelResponse, ModelResponseMetadata } from 'src/schemas/ModelResponse';
import { WithMetadata } from 'typescript';
import { WithTokens } from 'src/llm/modelHelpers';
import { createUUID } from 'src/types/uuid';


export interface TaskNotification {
    task: Task;
    childTask: Task;
    eventType: TaskEventType;
    statusPost?: ChatPost;
}

export interface StepExecutor<R extends StepResponse> {
    execute?(params: ExecuteParams): Promise<StepResult<R>>;
    onTaskNotification?(task: Task): Promise<void>;
    onProjectCompleted?(project: Project): Promise<void>;
    handleTaskNotification?(notification: TaskNotification): Promise<void>;
    /**
     * Optional method for async executors to provide final StepResult when their sub-project completes
     * @param project The completed project
     * @returns Final StepResult to return to the parent step
     */
    onChildProjectComplete?(stepTask: StepTask<R>, project: Project): Promise<StepResult<R>>;
}

export type ModelConversationResponse = WithTokens<WithMetadata<ModelResponse, ModelResponseMetadata>>;

export interface ModelConversation extends InputPrompt {
    generate(input: Partial<GenerateInputParams>) : Promise<ModelConversationResponse>;
}

export abstract class BaseStepExecutor<R extends StepResponse> implements StepExecutor<R> {
    constructor(protected params: ExecutorConstructorParams) {
        
    }

    protected getBaseLLMContext() : LLMContext {
        return {
            agentId: this.params.userId
        }
    }

    protected getLLMStepContext(stepParams: ExecuteParams) : LLMContext {
        return {
            ...this.getBaseLLMContext(),
            goal: stepParams.goal,
            stepGoal: stepParams.stepGoal,
            projectId: stepParams.projectId,
            taskId: stepParams.stepId,
            stepType: stepParams.step
        }
    }

    protected startModel(params: Partial<ExecuteParams>, methodName?: string) : ModelConversation {
        const prompt = this.params.modelHelpers.createPrompt();
        return {
            addContext: prompt.addContext.bind(prompt),
            addInstruction: prompt.addInstruction.bind(prompt),
            getInstructions: prompt.getInstructions.bind(prompt),
            addOutputInstructions: prompt.addOutputInstructions.bind(prompt),
            generate: async (input: Partial<GenerateInputParams>) => {
                const traceId = createUUID();
                const tracedinput : GenerateInputParams = {
                    instructions: prompt,
                    threadPosts: params.context?.threadPosts,
                    ...input,
                    context: {
                        ...input.context,
                        agentName: this.params.agentName,
                        stepGoal: params.stepGoal,
                        stepType: methodName?`${params.step}:${methodName}`:params.step,
                        traceId: traceId
                    }
                }
                const response = await this.params.modelHelpers.generate(tracedinput);
                return {
                    ...response,
                    metadata: {
                        _id: traceId,
                        _usage: response._usage,
                        ...response.metadata
                    }
                } as ModelConversationResponse;
            }
        }
    }
}