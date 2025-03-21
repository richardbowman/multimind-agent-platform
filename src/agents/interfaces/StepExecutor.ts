import { Task, Project } from 'src/tools/taskManager';
import { ExecuteParams } from './ExecuteParams';
import { StepResponse, StepResponseType, StepResult } from './StepResult';
import { GenerateInputParams } from '../agents';
import { TaskEventType } from "../../shared/TaskEventType";
import { ChatPost } from 'src/chat/chatClient';
import { StepTask } from './ExecuteStepParams';
import { LLMContext } from 'src/llm/ILLMService';
import { ExecutorConstructorParams } from './ExecutorConstructorParams';
import { InputPrompt } from 'src/prompts/structuredInputPrompt';
import { ModelMessageResponse, ModelResponse, ModelResponseMetadata } from 'src/schemas/ModelResponse';
import { WithMetadata } from 'typescript';
import { WithTokens } from 'src/llm/modelHelpers';
import { createUUID } from 'src/types/uuid';
import { StringUtils } from 'src/utils/StringUtils';
import { ArtifactType, DocumentSubtype } from 'src/tools/artifact';
import { ContentType } from 'src/llm/promptBuilder';
import { FilterCriteria } from 'src/types/FilterCriteria';


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

export type ModelConversationResponse = WithTokens<WithMetadata<ModelMessageResponse, ModelResponseMetadata>>;

export interface ModelConversation<R extends StepResponse> extends InputPrompt {
    generate(input: Partial<GenerateInputParams>) : Promise<ModelConversationResponse>;
    addProcedures(filter: FilterCriteria): Promise<void>;
}

export abstract class BaseStepExecutor<R extends StepResponse> implements StepExecutor<R> {
    constructor(protected params: ExecutorConstructorParams) {
        
    }

    async handleTaskNotification(notification: TaskNotification): Promise<void> {
        return;
    }

    async onChildProjectComplete(stepTask: StepTask<R>, project: Project): Promise<StepResult<R>> {
        return {
            finished: true,
            response: {
                type: StepResponseType.Error,
                status: `Un-implemented 'onchildProjectComplete'`
            } as R
        };
    }

    async onProjectCompleted(project: Project): Promise<void> {
        return;
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

    protected startModel<R extends StepResponse>(params: Partial<ExecuteParams>, methodName?: string) : ModelConversation<R> {
        const prompt = this.params.modelHelpers.createPrompt();
        return this.createModelConversation(prompt, params, methodName);
    }

    private createModelConversation<R extends StepResponse>(prompt: any, params: Partial<ExecuteParams>, methodName?: string) : ModelConversation<R> {
        const _step = this;
        return {
            setLastError: prompt.setLastError.bind(prompt),            
            addContext: prompt.addContext.bind(prompt),
            addInstruction: prompt.addInstruction.bind(prompt),
            getInstructions: prompt.getInstructions.bind(prompt),
            addOutputInstructions: prompt.addOutputInstructions.bind(prompt),
            generate: async (input: Partial<GenerateInputParams>) => {
                const traceId = createUUID();
                const tracedinput : GenerateInputParams = {
                    instructions: prompt,
                    threadPosts: params.context?.threadPosts,
                    userPost: params.userPost,
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
            },
            addProcedures: async (metadataFilter: FilterCriteria) : Promise<void> => {
                // Get procedure guides already in use from previous responses
                const pastGuideIds = params.previousResponses?.flatMap(response =>
                    response.data?.steps?.flatMap(step =>
                        step.procedureGuide?.artifactId ? [step.procedureGuide.artifactId] : []
                    ) || []
                ) || [];
        
                // Get procedure guides from search, excluding any already in use
                const searchedGuides = (await _step.params.artifactManager.searchArtifacts(
                    `Procedure guides: ${StringUtils.truncateWithEllipsis(params.stepGoal||params.message||params.goal||"", 1000)}`,
                    {
                        type: ArtifactType.Document,
                        subtype: DocumentSubtype.Procedure,
                        ...metadataFilter
                    },
                    5,
                    0
                )).filter(guide => !pastGuideIds.includes(guide.artifact.id));
        
                // Load all guides in a single bulk operation
                const procedureGuides = await _step.params.artifactManager.bulkLoadArtifacts([
                    ...searchedGuides.map(p => p.artifact.id),
                    ...pastGuideIds
                ]);
    
        
                // Format searched guides for prompt
                const filtered = searchedGuides.filter(g => procedureGuides.find(p => p.id === g.artifact.id));
                prompt.addContext({ contentType: ContentType.PROCEDURE_GUIDES, guideType: "searched", guides: filtered.map(f => procedureGuides.find(p => p.id === f.artifact.id)).filter(f => !!f) });
                prompt.addContext({ contentType: ContentType.PROCEDURE_GUIDES, guideType: "in-use", guides: pastGuideIds.map(f => procedureGuides.find(p => p.id === f)).filter(f => !!f) });
                    
            }
        }
    }
}
