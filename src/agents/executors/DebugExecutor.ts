import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResult, StepResultType } from '../interfaces/StepResult';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ExecutorType } from '../interfaces/ExecutorType';
import { ContentType } from 'src/llm/promptBuilder';

 /**
  * DebugExecutor provides insights into the agent's execution context and parameters.
  * Key capabilities:
  * - Explains current execution parameters and context
  * - Lists available executor types and their purposes
  * - Describes the agent's configuration and capabilities
  * - Provides debugging information about the current state
  * - Answers questions about the agent's operation
  */
 @StepExecutorDecorator(ExecutorType.DEBUG, 'Provide debugging information about the agent')
 export class DebugExecutor implements StepExecutor {
     private modelHelpers: ModelHelpers;

     constructor(params: ExecutorConstructorParams) {
         this.modelHelpers = params.modelHelpers;
     }

     async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
         const promptBuilder = this.modelHelpers.createPrompt();

         // Add core instructions
         promptBuilder.addInstruction("You are a debugging assistant for this agent.");
         promptBuilder.addInstruction("Your role is to explain the agent's current context and parameters.");
         promptBuilder.addInstruction("Answer questions clearly and provide relevant details from the execution context.");

         // Add execution parameters
         promptBuilder.addContent(ContentType.EXECUTE_PARAMS, {
             goal: params.goal,
             stepGoal: params.stepGoal,
             stepId: params.stepId,
             projectId: params.projectId
         });

         // Add available executor types
         promptBuilder.addContext({contentType: ContentType.DOCUMENTS, documents: {
             title: "Available Executor Types",
             content: Object.values(ExecutorType).map(type => `- ${type}`).join('\n')
         }});

         // Add previous results if available
         if (params.previousResponses) {
             promptBuilder.addContext({contentType: ContentType.STEP_RESPONSE, responses: params.previousResponses});
         }

         const prompt = promptBuilder.build();

         const response = await this.modelHelpers.generate({
             message: params.message || "Explain the current execution context",
             instructions: prompt
         });

         return {
             type: StepResultType.Debug,
             finished: true,
             response: {
                 message: response.message || "No debug information available"
             }
         };
     }
 }