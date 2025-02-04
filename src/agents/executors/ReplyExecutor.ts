import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { StepResult } from '../interfaces/StepResult';
import { TaskManager } from '../../tools/taskManager';
import { ArtifactManager } from '../../tools/artifactManager';
import { OnboardingProject } from '../onboardingConsultant';
import { StepExecutorDecorator as StepExecutorDecorator } from '../decorators/executorDecorator';
import { ModelHelpers } from '../../llm/modelHelpers';
import { ILLMService } from 'src/llm/ILLMService';
import { ExecutorType } from '../interfaces/ExecutorType';
import { ContentType } from 'src/llm/promptBuilder';
import { Artifact } from 'src/tools/artifact';
import { ExecuteParams } from '../interfaces/ExecuteParams';

/**
 * Executor that generates user-friendly responses to messages.
 * Key capabilities:
 * - Creates natural, conversational replies
 * - Maintains consistent tone and style
 * - Incorporates project context in responses
 * - Handles both direct replies and follow-up messages
 * - Loads and references relevant artifacts
 * - Manages conversation flow and context
 * - Provides clear and actionable responses
 * - Supports multi-turn dialogue
 * - Ensures responses align with project goals
 */
@StepExecutorDecorator(ExecutorType.REPLY, 'Generate user-friendly responses to messages')
export class ReplyExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    taskManager: TaskManager;
    artifactManager: ArtifactManager;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;

        this.taskManager = params.taskManager!;
        this.artifactManager = params.artifactManager!;
    }

    async execute(params: ExecuteParams): Promise<StepResult> {
        const promptBuilder = this.modelHelpers.createPrompt();

        promptBuilder.addContext({contentType: ContentType.ABOUT});
        promptBuilder.addContext({ contentType: ContentType.EXECUTE_PARAMS, params});

        // Add core instructions
        promptBuilder.addInstruction("Generate a user-friendly, conversational reply based on the context.");
        promptBuilder.addInstruction("Key requirements:");
        promptBuilder.addInstruction("- Maintain a professional yet approachable tone");
        promptBuilder.addInstruction("- Keep responses clear and concise");
        promptBuilder.addInstruction("- Reference relevant project context when appropriate");
        promptBuilder.addInstruction("- If asking follow-up questions, make them specific and actionable");

        // Add project context
        const project = this.taskManager.getProject(params.projectId);
        if (project) {
            promptBuilder.addContext({contentType: ContentType.TASKS, tasks: Object.values(project.tasks)});
        }
        // Add any relevant artifacts
        params.context?.artifacts && promptBuilder.addContext({contentType: ContentType.ARTIFACTS_EXCERPTS, artifacts: params.context.artifacts});
        
        // Add previous results if available
        params.previousResponses && promptBuilder.addContext({contentType: ContentType.STEP_RESPONSE, responses: params.previousResponses});

        const prompt = promptBuilder.build();

        const reply = await this.modelHelpers.generate({
            message: params.message || params.stepGoal,
            instructions: prompt,
            threadPosts: params.context?.threadPosts
        });

        return {
            finished: true,
            needsUserInput: true,
            response: reply
        };
    }
}
