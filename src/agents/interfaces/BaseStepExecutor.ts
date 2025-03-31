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
import { ContentInput, FullGoalsContent, StepsContent } from 'src/llm/ContentTypeDefinitions';
import { ExecutorType } from './ExecutorType';
import { Message } from 'src/chat/chatClient';
import { isObject } from 'src/types/types';
import { ChatMessage } from '@lmstudio/sdk';


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
    ) { }

    setLastError(error: string): this {
        this.prompt.setLastError(error);
        return this;
    }

    addContext(context?: ContentInput): this {
        let skipContext = false;
        let adjContext = context;
        
        if (isObject(context)) {
            if (context?.contentType === ContentType.STEPS || context?.contentType === ContentType.STEP_RESPONSE) {       
                skipContext = true;
            }
            if (context?.contentType === ContentType.GOALS_FULL && this.params.executionMode === 'task') {
                adjContext = {
                    ...(context as FullGoalsContent),
                    skipStepGoal: true
                } as FullGoalsContent
            }
        }
        
        if (!skipContext) this.prompt.addContext(adjContext);
        
        return this;
    }

    addInstruction(instruction: string): this {
        this.prompt.addInstruction(instruction);
        return this;
    }

    getInstructions(): string | Promise<string> {
        return this.prompt.getInstructions();
    }

    addOutputInstructions(params: OutputInstructionsParams): this {
        this.prompt.addOutputInstructions(params);
        return this;
    }

    private async buildStepHistoryMessages({ steps, posts, handles, stepGoal }: StepsContent): Promise<Message[]> {
        if (!posts?.length) {
            posts = [{message: stepGoal||""}];
        };

        const filteredSteps = steps.filter(s => s.props.result && (s.props.stepType !== ExecutorType.NEXT_STEP || s.props.result?.response.type === StepResponseType.CompletionMessage));


        // If we have posts, group steps by post
        if (posts && posts.length > 0) {
            const renderedSteps = new Map<string, string[]>();
            // Take only the most recent 10 messages
            const recentPosts = posts.slice(-10);
            const lastMessageId = recentPosts[recentPosts.length-1].id;

            // Initialize map with posts
            recentPosts.forEach(post => {
                renderedSteps.set(post.id, []);
            });

            // Process steps and group by post
            const allSteps = filteredSteps;
            const totalSteps = allSteps.length;
            
            await Promise.all(allSteps.map(async (step, index) => {
                const stepResult = step.props.result!;
                const isRecentStep = index >= totalSteps - 2; // Last two steps get full details
                
                let stepInfo: string;
                if (isRecentStep) {
                    let body = await this.prompt.registry.renderResult(stepResult, steps);
                    stepInfo = `- STEP [${step.props.stepType}]:
  Description: ${step.description}
${[body && `Result: <toolResult>${body}</toolResult>`,
                        stepResult.response.message && `<agentResponse>${stepResult.response.message}</agentResponse>`,
                        stepResult.response.reasoning && `<thinking>${stepResult.response.reasoning}</thinking>`,
                        stepResult.response.status && `<toolResult>${stepResult.response.status}</toolResult>`].filter(a => !!a).join("\n")}`;
                } else {
                    // Compress older steps to just type and description
                    stepInfo = `- [${step.props.stepType}]: ${step.description}`;
                }

                // If step has a threadId, add to corresponding post
                const messageId = step.props.userPostId || lastMessageId;
                const existing = renderedSteps.get(messageId) || [];
                existing.push(stepInfo);
                renderedSteps.set(messageId, existing);
            }));


            return recentPosts.map(p => {
                if (renderedSteps.get(p.id)?.length||0 > 0) {
                    return {
                        ...p,
                        message: p.message + `\n\n# 📝 STEPS COMPLETED FOR POST:\n${renderedSteps.get(p.id)?.join("\n\n")}`,
                    }
                } else {
                    return p;
                }
            })
        } else {
            return posts;
        }
    }

    async generate(input: Partial<GenerateInputParams>): Promise<ModelConversationResponse> {
        const traceId = createUUID();

        // Build step history messages
        let stepMessages : Message[]|undefined;
        if (this.params.steps) {
            stepMessages = await this.buildStepHistoryMessages(
                {
                    contentType: ContentType.STEPS,
                    steps: this.params.steps,
                    posts: this.params.context?.threadPosts,
                    stepGoal: this.params.stepGoal
                }
            );
        } else {
            stepMessages = this.params.context?.threadPosts;
        }

        const userPost = stepMessages?.find(m => m.id === this.params.userPost?.id);
        const message = (userPost?.message || stepMessages[stepMessages.length-1] || this.params.stepGoal) + `\nENSURE YOU FOLLOW THE PROVIDED "RESPONSE FORMAT" SECTION. THE SYSTEM CANNOT INTERPRET YOUR RESPONSE OTHERWISE.`;

        const tracedinput: GenerateInputParams = {
            instructions: this.prompt,
            threadPosts: stepMessages,
            userPost,
            message,
            ...input,
            context: {
                ...input.context,
                agentName: this.stepExecutor.params.agentName,
                stepGoal: this.params.stepGoal,
                stepType: this.methodName ? `${this.params.step}:${this.methodName}` : this.params.step,
                traceId: traceId
            }
        };

        const response = await this.stepExecutor.params.modelHelpers.generate(tracedinput);
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
