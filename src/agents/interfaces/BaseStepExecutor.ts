import { LLMContext } from 'src/llm/ILLMService';
import { ContentType, OutputInstructionsParams, PromptBuilder } from 'src/llm/promptBuilder';
import { Artifact, ArtifactType, DocumentSubtype } from 'src/tools/artifact';
import { Project } from 'src/tools/taskManager';
import { FilterCriteria } from 'src/types/FilterCriteria';
import { createUUID } from 'src/types/uuid';
import { StringUtils } from 'src/utils/StringUtils';
import { GenerateInputParams } from '../agents';
import { ExecuteParams } from './ExecuteParams';
import { StepTask } from './ExecuteStepParams';
import { ExecutorConstructorParams } from './ExecutorConstructorParams';
import { StepExecutor, TaskNotification, ModelConversation, ModelConversationResponse } from './StepExecutor';
import { StepResponse, StepResult, StepResponseType } from './StepResult';


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

    protected getBaseLLMContext(): LLMContext {
        return {
            agentId: this.params.userId
        };
    }

    protected getLLMStepContext(stepParams: ExecuteParams): LLMContext {
        return {
            ...this.getBaseLLMContext(),
            goal: stepParams.goal,
            stepGoal: stepParams.stepGoal,
            projectId: stepParams.projectId,
            taskId: stepParams.stepId,
            stepType: stepParams.step
        };
    }

    protected startModel<R extends StepResponse>(params: Partial<ExecuteParams>, methodName?: string): ModelConversation<R> {
        const prompt = this.params.modelHelpers.createPrompt();
        return this.createModelConversation(prompt, params, methodName);
    }

    private createModelConversation(prompt: any, params: Partial<ExecuteParams>, methodName?: string): ModelConversation<R> {
        return new ModelConversationImpl<R>(this, prompt, params, methodName);
    }
}

class ModelConversationImpl<R extends StepResponse> implements ModelConversation<R> {
    constructor(
        private readonly stepExecutor: BaseStepExecutor<R>,
        private readonly prompt: PromptBuilder,
        private readonly params: Partial<ExecuteParams>,
        private readonly methodName?: string
    ) {}

    setLastError(error: string): this {
        this.prompt.setLastError(error);
        return this;
    }

    addContext(context: any): this {
        this.prompt.addContext(context);
        return this;
    }

    addInstruction(instruction: string): this {
        this.prompt.addInstruction(instruction);
        return this;
    }

    getInstructions(): string|Promise<string> {
        return this.prompt.getInstructions();
    }

    addOutputInstructions(params: OutputInstructionsParams): this {
        this.prompt.addOutputInstructions(params);
        return this;
    }

    private async buildStepHistoryMessages(threadPosts: ChatPost[] = [], handles?: Record<string, string>): Promise<Array<{role: string, content: string}>> {
        if (!threadPosts?.length) return [];

        const messages: Array<{role: string, content: string}> = [];
        
        // Process posts in chronological order
        for (const post of threadPosts) {
            if (post.props?.partial) continue; // Skip partial/transient posts

            // Add the user's original message
            messages.push({
                role: 'user',
                content: `${handles?.[post.user_id] || 'User'}: ${post.message}`
            });

            // Add any step responses from this post
            if (post.props?.steps?.length) {
                for (const step of post.props.steps) {
                    if (step.response?.message || step.response?.reasoning) {
                        messages.push({
                            role: 'assistant',
                            content: [
                                step.response.message,
                                step.response.reasoning
                            ].filter(Boolean).join('\n\n')
                        });
                    }
                }
            }
        }

        return messages;
    }

    async generate(input: Partial<GenerateInputParams>): Promise<ModelConversationResponse> {
        const traceId = createUUID();
        
        // Build step history messages
        const stepMessages = await this.buildStepHistoryMessages(
            this.params.context?.threadPosts,
            input.context?.handles
        );

        const tracedinput: GenerateInputParams = {
            instructions: this.prompt,
            threadPosts: this.params.context?.threadPosts,
            userPost: this.params.userPost,
            ...input,
            context: {
                ...input.context,
                agentName: this.stepExecutor.params.agentName,
                stepGoal: this.params.stepGoal,
                stepType: this.methodName ? `${this.params.step}:${this.methodName}` : this.params.step,
                traceId: traceId
            },
            messages: stepMessages // Include the step history messages
        };

        const response = await this.stepExecutor.params.modelHelpers.generate(tracedinput, this.stepExecutor.params.llmServices);
        return {
            ...response,
            metadata: {
                _id: traceId,
                _usage: response._usage,
                ...response.metadata
            }
        };
    }

    async addProcedures(metadataFilter: FilterCriteria): Promise<Artifact[]> {
        // Get procedure guides already in use from previous responses
        const pastGuideIds = this.params.previousResponses?.flatMap(response => 
            response.data?.steps?.flatMap(step => 
                step.procedureGuide?.artifactId ? [step.procedureGuide.artifactId] : []
            ) || []
        ) || [];

        // Get procedure guides from search, excluding any already in use
        const searchedGuides = (await this.stepExecutor.params.artifactManager.searchArtifacts(
            `Procedure guides: ${StringUtils.truncateWithEllipsis(this.params.stepGoal || this.params.message || this.params.goal || "", 1000)}`,
            {
                type: ArtifactType.Document,
                subtype: DocumentSubtype.Procedure,
                ...metadataFilter
            },
            5,
            0
        )).filter(guide => !pastGuideIds.includes(guide.artifact.id));

        // Load all guides in a single bulk operation
        const procedureGuides = await this.stepExecutor.params.artifactManager.bulkLoadArtifacts([
            ...searchedGuides.map(p => p.artifact.id),
            ...pastGuideIds
        ]);

        // Format searched guides for prompt
        const filtered = searchedGuides.filter(g => procedureGuides.find(p => p.id === g.artifact.id));
        this.prompt.addContext({ 
            contentType: ContentType.PROCEDURE_GUIDES, 
            guideType: "searched", 
            guides: filtered.map(f => procedureGuides.find(p => p.id === f.artifact.id)).filter(f => !!f) 
        });
        this.prompt.addContext({ 
            contentType: ContentType.PROCEDURE_GUIDES, 
            guideType: "in-use", 
            guides: pastGuideIds.map(f => procedureGuides.find(p => p.id === f)).filter(f => !!f) 
        });

        return procedureGuides;
    }
}
